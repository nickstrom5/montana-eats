"""Stage 1: every Montana eating/drinking listing, cleaned and placed in its city or town -> data/mt/stage1.pkl

Adapted from va-eats/pipeline/listings.py (wi-eats -> az-eats -> tn-eats -> ga-eats -> la-eats -> md-eats -> va-eats lineage). Overture
Maps places (2026-10-21.0 release) are the statewide base. This stage cleans names and towns and drops junk. Montana uses no
Google data at all (not even the private 2021 snapshot the older states' web builds read): the in21/closed21 columns stay False.
Each listing's town is the locality outline its point is in (mt_towns_detail.geojson: the cities, towns and census places), else its
postal town (much of Montana is unincorporated); a postal name that differs stays as `area`, searchable. It keeps every listing (with
flags) so calibrate.py can measure which kinds of listings Helena's retail food permits confirm before montana.py decides what to keep.
"""
import os, re, json, gzip, math, html
import numpy as np, pandas as pd, duckdb
from shapely.geometry import shape, Point
from shapely.prepared import prep
from rapidfuzz import fuzz
from common import norm_name, nice, name_sim, FOODCAT, NOTFOOD, GENERIC, _stems, DATA, MT, canon_city, town_key
from brands import brand_of

EAT = ("restaurant", "casual_eatery", "bar", "fast_food_restaurant", "coffee_shop", "cafe", "smoothie_juice_bar", "brewery", "food_court")

con = duckdb.connect()
o = con.execute(f"""
  SELECT a.id, a.name, a.cat, a.tax, a.confidence, a.status, a.brand, a.street, a.city, a.zip, a.lat, a.lon, a.web, a.phone,
         b.ds, b.n_soc, b.n_web, b.n_ph
  FROM '{MT}/overture_mt_bbox.parquet' a JOIN '{MT}/overture_mt_sources.parquet' b USING (id)
  WHERE (a.region IN ('MT', 'Montana') OR coalesce(a.region, '') = '') AND a.cat IN {EAT} AND a.name IS NOT NULL
""").df()
o["src"] = o.ds.map(lambda x: next((s for s in x if s not in ("Overture", "Overture-signals")), None) if x is not None else None)
o["ov_closed"] = o.status.eq("permanently_closed")
print("Overture MT eating listings:", len(o), "| marked permanently closed by Overture:", int(o.ov_closed.sum()))


def fix_text(t):
    """Repair UTF-8 read as Latin-1 ("CafÃ©"), HTML entities ("&amp"), keyword tails after "|", and corporate suffixes."""
    if not isinstance(t, str):
        return t
    if re.search(r"[ÃÂ][\u0080-¿]", t):
        try:
            t = t.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    t = html.unescape(t)
    t = re.split(r"\s*\|\s*", t)[0]
    t = re.split(r"\s+f/?k/?a\s+", t, flags=re.I)[0]
    m = re.search(r"\bd/?b/?a\.?\s+(.+)$", t, flags=re.I)
    if m:
        t = m.group(1)
    t = re.sub(r"(?:,?\s+(?:Inc|LLC|L\.L\.C|Corp|Corporation|Ltd)\.?)+\s*$", "", t, flags=re.I)
    t = re.sub(r"(?<![&\s])(?<!\band)(?<!\bAnd)(?<!\bAND),?\s+Co\.?\s*$", "", t)
    return re.sub(r"\s+", " ", t).strip()


o["name"] = o.name.map(fix_text)
o["street"] = o.street.map(lambda t: html.unescape(t).strip() if isinstance(t, str) else t)
# directions typed into the address ("Located in: ...", "Between X & Y, 3063 Meadowlark Ln"): keep the street address
ADDR = re.compile(r"(?:\d+[A-Z]?)\s+(?:[NSEW]\.?\s+)?[\w.' ]+?\b(?:St|Street|Ave|Avenue|Dr|Drive|Rd|Road|Blvd|Ln|Lane|Way|Ct|Pl|Hwy|Pkwy|Trl|Pike|Cir|Ter)\b\.?(?:\s*(?:#|Ste|Suite|Unit)\s*\w+)?", re.I)


def tidy_street(t):
    if not isinstance(t, str) or not re.search(r"(?i)located in|please|between|next to|inside|back door|entrance|across from", t):
        return t
    hits = ADDR.findall(t)
    return hits[-1].strip() if hits else t


o["street"] = o.street.map(tidy_street)
# closed or not open yet, per the listing's own name
CLOSED = re.compile(r"\b(?:permanently|temporarily)\s+closed\b|\bclosed\s+(?:permanently|for business|at\b)|coming soon|\bnow closed\b"
                    r"|[-–(|]\s*['\"]?closed['\"]?\s*\)?\s*$|^closed\s*[-–:]", re.I)
JUNKNAME = re.compile(r"^[\d\s#-]+$")
NOTFOOD_NAME = re.compile(r"\b(?:radiator|auto (?:repair|body|parts|sales)|tires?|insurance|barber|dental|chiropractic|plumbing|realty|food pantry|"
                          r"distribution cent(?:er|re)|bakery warehouse|restaurant equipment|wholesale (?:distributor|supply|foods?)|"
                          r"meal program|soup kitchen|church|parish|funeral|daycare|day care|salon|storage|apartments?|condominiums?|operations)\b", re.I)
z5 = o.zip.fillna("").astype(str).str.strip().str[:5]
o["nowhere"] = o.street.fillna("").str.strip().eq("") & z5.eq("")
o["j_closedname"] = o.name.fillna("").str.contains(CLOSED)
o["j_junk"] = (o.name.fillna("").str.match(JUNKNAME) | o.name.fillna("").str.contains(NOTFOOD_NAME)
               | (z5.ne("") & ~z5.str.match(r"^59\d{3}$")) | o.street.fillna("").map(lambda t: bool(re.search(r"[^\x00-ɏ]", t))))
closed = o[o.j_closedname]
twin = np.zeros(len(o), bool)
for la, lo, k in [(la, lo, norm_name(CLOSED.sub(" ", n))) for la, lo, n in zip(closed.lat, closed.lon, closed.name)]:
    near = (np.abs(o.lat - la) < 0.0015) & (np.abs(o.lon - lo) < 0.002)
    for i in np.flatnonzero(near.to_numpy()):
        if k and fuzz.token_set_ratio(k, norm_name(o.name.iat[i])) >= 90:
            twin[i] = True
o["j_closedname"] |= twin


o["area"] = o.city.map(lambda c: canon_city(c, villages=False))   # the postal name as written
o["city"] = o.city.map(canon_city)


tk = o.city.dropna().map(town_key)
main = o.city.dropna().groupby(tk).agg(lambda x: x[~x.str.islower()].mode().iat[0] if (~x.str.islower()).any() else x.mode().iat[0])
o["city"] = o.city.map(lambda c: main.get(town_key(c), c) if isinstance(c, str) else c)
# no town on the listing: take it from an address like "123 Main St, Easton, MT", else from the zip's usual town
TOWN_TAIL = r",\s*([A-Za-z .']+?),\s*(?:MT|Mont|Montana)\b.*$"
miss = o.city.isna()
o.loc[miss, "city"] = o.loc[miss, "street"].fillna("").str.extract(TOWN_TAIL)[0].map(canon_city)
o["street"] = o.street.str.replace(TOWN_TAIL, "", regex=True)
zip_town = o[o.city.notna()].assign(z=o.zip.fillna("").astype(str).str[:5]).groupby("z").city.agg(lambda x: x.mode().iat[0])
miss = o.city.isna()
o.loc[miss, "city"] = o.loc[miss, "zip"].fillna("").astype(str).str[:5].map(zip_town)
print("places still without a town:", int(o.city.isna().sum()))


def dom(w):
    from urllib.parse import urlparse
    if not isinstance(w, str) or not w.strip():
        return None
    try:
        h = urlparse(w if "://" in w else "http://" + w).netloc.lower()
    except ValueError:
        return None
    parts = re.sub(r"^www\d?\.", "", h).split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else None


AGGREGATOR = {"facebook.com", "business.site", "grubhub.com", "doordash.com", "ubereats.com", "yelp.com", "toasttab.com", "square.site",
              "order.online", "google.com", "instagram.com", "menufy.com", "chownow.com", "clover.com", "wixsite.com", "godaddysites.com",
              "squarespace.com", "weebly.com", "linktr.ee", "slicelife.com", "beyondmenu.com", "seamless.com", "co.uk", "wordpress.com",
              "tripadvisor.com", "orderonline.com", "spoton.com", "popmenu.com", "bentobox.com", "places.singleplatform.com",
              "chamberofcommerce.com", "hub.biz", "restaurantji.com", "menupix.com", "allmenus.com", "zmenu.com", "opentable.com", "resy.com",
              "exploretock.com", "wix.com", "site123.me", "webs.com", "yellowpages.com", "mapquest.com", "foursquare.com", "tumblr.com",
              "blogspot.com", "carrd.co", "square.com", "toast.site", "hungerrush.com", "menufy.com", "gloriafood.com", "mobilebytes.com",
              "orderspoon.com", "revelup.com", "wordpress.org", "godaddy.com", "myshopify.com", "linkedin.com", "twitter.com", "x.com"}
o["dom"] = o.web.map(dom).where(lambda d: ~d.isin(AGGREGATOR))

# mis-geocoded listings: outside the state line, or far from every other place in their own town
# ~300 m over the water for piers, docks and the marsh edge, but not across a land border: a Chevy Chase, DC or Takoma Park, DC listing
# on the far side of the line, or a Delmar, Delaware one, stays out (the neighbours' land is cut back out, fetch_overture.py)
state = shape(json.load(open(f"{MT}/mt_state_detail.geojson"))).buffer(0.003).difference(shape(json.load(open(f"{MT}/mt_neighbors.geojson"))))
ps = prep(state)
o["j_outside"] = ~np.array([ps.contains(Point(x, y)) for x, y in zip(o.lon, o.lat)])
med = o.groupby("city")[["lat", "lon"]].transform("median")
size = o.groupby("city").lat.transform("size")
o["j_far"] = ((size >= 5) & (np.hypot((o.lat - med.lat) * 111, (o.lon - med.lon) * 79) > 30)).fillna(False)
print("junk names:", int(o.j_junk.sum()), "| closed per name:", int(o.j_closedname.sum()), "| outside MT:", int(o.j_outside.sum()),
      "| far from town:", int((o.j_far & ~o.j_outside).sum()))

# the town is the locality outline the point is in (or the nearest within ~1 km), whatever the postal name says; outside every outline
# the postal town stays
from shapely import STRtree
_TW = json.load(open(f"{MT}/mt_towns_detail.geojson"))
_TN = list(_TW); _TG = [shape(_TW[n]) for n in _TN]; _TT = STRtree(_TG)


def town_at(la, lo):
    if la != la:
        return None
    p = Point(lo, la)
    hit = [i for i in _TT.query(p) if _TG[i].contains(p)]
    if hit:
        return _TN[hit[0]]
    # outside every outline: the postal town stands (Montana's unincorporated places, and Butte, whose outline is left out); the nearest
    # outline within ~200 m only for a pin just over a town line
    near = [(_TG[i].distance(p), _TN[i]) for i in _TT.query(p.buffer(0.002))]
    return min(near)[1] if near else None


o["ptown"] = [town_at(la, lo) for la, lo in zip(o.lat, o.lon)]
moved = o.ptown.notna() & o.city.notna() & o.ptown.ne(o.city)
print("listings whose point is in another town than their postal name:", int(moved.sum()), "| no town outline nearby:", int(o.ptown.isna().sum()))
o["city"] = o.ptown.where(o.ptown.notna(), o.city)
# each postal name that points to one town (75%+ of its listings, 3 or more) -> data/mt/locality_town.json, which canon_city reads
# for the research, the records and the next run
_lk = o.area.fillna("").map(lambda c: re.sub(r"[^a-z]", "", c.lower()))
loc = {}
# 75% of all the listings with that postal name, not just those inside an outline: most of Butte is outside every outline (its own is
# left out), so its few listings inside Walkerville's mustn't make "Butte" mean Walkerville
for k_, g_ in o[_lk.ne("")].groupby(_lk[_lk.ne("")]):
    vc = g_.ptown.value_counts()
    if len(vc) and vc.iat[0] >= 3 and vc.iat[0] >= 0.75 * len(g_):
        loc[k_] = vc.index[0]
json.dump(dict(sorted(loc.items())), open(f"{MT}/locality_town.json", "w"), indent=0)
# a spelling of the town itself ("North Attleboro", "Middleboro", "Foxboro") is no area name, and neither is another town's name (a
# Bedford listing with a Manchester mailing address isn't in a "Manchester" part of Bedford)
_town_keys = {re.sub(r"[^a-z]", "", n.lower()) for n in _TN}
o["area"] = [a if isinstance(a, str) and isinstance(c, str) and fuzz.ratio(re.sub(r"[^a-z]", "", a.lower()), re.sub(r"[^a-z]", "", c.lower())) < 80
             and re.sub(r"[^a-z]", "", a.lower()) not in _town_keys and canon_city(a) not in (c, None) else None for a, c in zip(o.area, o.city)]
print("postal names mapped to a town:", len(loc), "| listings with an area name:", int(o.area.notna().sum()),
      o.area.value_counts().head(12).to_dict())

# names carrying their town ("Snooze - Boulder", "Culver's of Pueblo, CO") or only a town ("Golden, Colorado")
TAIL = re.compile(r"\s*(?:[-–|,:]\s*|\s(?:of|in|at)\s+)[A-Z][A-Za-z.' ]{1,30},\s*(?:MT|Mont|Montana)\.?\s*$")
TOWNS = set(o.city.dropna().str.strip().str.lower())


def clean_name(n, city, brand):
    n0 = n.strip()
    if isinstance(city, str) and city:
        c = re.escape(city.strip())
        n = re.sub(rf"(?:\s*[-–|,:]\s*|\s(?:of|in|at)\s+|\s|^){c},?\s*(?:MT|Mont|Montana)\.?\s*$", "", n, flags=re.I)
        n = re.sub(rf"\s*[-–|:]\s*{c}\s*$", "", n, flags=re.I)
        m = re.match(rf"^(.*\S)\s+{c}$", n, flags=re.I)
        if m and not re.search(r"\b(?:of|in|at|de|del|la|el|the|and|&|du|on)$", m.group(1), re.I) and (_stems(norm_name(m.group(1))) - GENERIC) \
                and isinstance(brand, str):
            n = m.group(1)   # only chains drop a bare town tail ("Culver's Pueblo"); "Estes Park Brewery" keeps it
        if n.strip().lower() == city.strip().lower():
            n = ""
    if n.strip().lower() in TOWNS:
        n = ""
    n = TAIL.sub("", n).strip(" -–|,")
    m = re.fullmatch(r"([A-Za-z.' ]+),\s*(?:MT|Mont|Montana)", n0)
    if not n or (m and m.group(1).strip().lower() in TOWNS):
        return brand if isinstance(brand, str) and brand else None
    return n


o["name"] = [clean_name(n, c, b) for n, c, b in zip(o.name, o.city, o.brand)]
o = o[o.name.notna()].reset_index(drop=True)
label = [isinstance(b, str) and b.strip() != "" and src in ("AllThePlaces", "DAC") and fuzz.partial_ratio(norm_name(b), norm_name(n)) < 70
         for n, b, src in zip(o.name, o.brand, o.src)]
o.loc[label, "name"] = o.loc[label, "brand"].map(fix_text)
print("store-label names replaced by the brand:", int(sum(label)))

# ---------------------------------------------------------------- (no Google 2021 listings in Montana)
HOST = re.compile(r"shopping (?:mall|center)|outlet|botanical garden|garden center|museum|zoo|aquarium|water park|amusement|theme park|"
                  r"movie theater|cinema|golf|country club|hotel|motel|resort|lodge|casino|stadium|arena|university|college|school|hospital|"
                  r"airport|library|church|grocery|supermarket|warehouse club|department store|home improvement|hardware|book store|"
                  r"gift shop|salon|spa\b|gym|tobacco|vaporizer|cigar|adult entertainment|appliance|furniture|fireplace|wedding venue|"
                  r"event venue|indoor playground|mover|landscaping|boutique|produce market|beverage distributor|food products supplier|"
                  r"swimming pool|skating|sports complex|association|video arcade|convenience store|gas station|truck stop|campground|"
                  r"rv park|marina|ski resort|bowling|cheese manufacturer|cheese shop|dairy farm|farm|orchard|winery|fairground|dispensary|cannabis|"
                  r"fraternal organization|veterans organization|social club|community center|senior citizen center|cabin rental", re.I)
# no Google data in Montana (see the docstring): an empty table keeps the shared code's shape
G = pd.DataFrame(columns=["name", "address", "gmap_id", "latitude", "longitude", "category", "avg_rating", "num_of_reviews", "price",
                          "state", "description"])
G["k"] = G.name.map(norm_name)
G["st"] = G.k.map(lambda k: _stems(k) - GENERIC if k else set())
G["closed21"] = pd.Series(dtype=bool)
G["num"] = pd.Series(dtype=object)
grid = {}

TOWNWORDS = set(" ".join(o.city.dropna().map(norm_name)).split()) | set("""TEXAS JAPANESE PANCAKE PANCAKES BUFFET CUISINE RESTAURANT
CAFE CAFFE DINER STEAKHOUSE SUSHI HIBACHI RAMEN TAQUERIA CANTINA BISTRO EATERY LOUNGE SALOON SPORTS FAMILY AMERICAN MEXICAN ITALIAN
GREEK KOREAN VIETNAMESE INDIAN ASIAN THAI CHINESE BAKERY PUB TAP HOUSE ROOM SUPPER CLUB TAVERN INN MOUNTAIN GREEN CHILE""".split())
G["st2"] = G.st.map(lambda st: st - TOWNWORDS)
o["k"] = o.name.map(norm_name)
o["brand_n"] = [brand_of(k, norm_name(b) if isinstance(b, str) else None) for k, b in zip(o.k, o.brand)]
o["st"] = o.k.map(lambda k: _stems(k) - GENERIC if k else set())
o["num"] = o.street.fillna("").map(lambda a: (re.match(r"\s*(\d+)", a) or [None, None])[1])
pairs = []
for oi, r in o.iterrows():
    if not r.k:
        continue
    gy, gx = round(r.lat / 0.0015), round(r.lon / 0.002)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            for gi in grid.get((gy + dy, gx + dx), []):
                gk = G.k.iat[gi]
                if not gk:
                    continue
                dist = math.hypot((G.latitude.iat[gi] - r.lat) * 111000, (G.longitude.iat[gi] - r.lon) * 79000)
                if dist > 200:
                    continue
                s = name_sim(r.k, gk)
                same_num = r.num is not None and G.num.iat[gi] == r.num
                if same_num and r.st & G.st.iat[gi]:
                    s = max(s, 80)   # "Snarf's" at 1001 = "Snarf's Sandwiches" at 1001
                if s < 95 and not (r.st - TOWNWORDS) & G.st2.iat[gi]:
                    continue         # "Black Bear Diner Morris" is not "Morris R Place": a town or cuisine word isn't enough
                if (s >= 88 and dist < 150) or (s >= 75 and same_num):
                    pairs.append((s + (10 if same_num else 0) - dist / 25, oi, gi))
taken_o, taken_g, gmatch = set(), set(), {}
for sc, oi, gi in sorted(pairs, key=lambda t: -t[0]):   # one Google listing per business, best pairs first
    if oi in taken_o or gi in taken_g:
        continue
    taken_o.add(oi); taken_g.add(gi); gmatch[oi] = gi
o["gi"] = o.index.map(gmatch)
o["in21"] = o.gi.notna()
o["closed21"] = [bool(G.closed21.iat[int(v)]) if v is not None and v == v else False for v in o.gi]
print("matched to Google 2021:", int(o.in21.sum()), "| of those, closed by 2021:", int(o.closed21.sum()))
o.to_pickle(f"{MT}/stage1.pkl")
G.to_pickle(f"{MT}/google21.pkl")
print("wrote stage1:", len(o), "listings")
