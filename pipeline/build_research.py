"""Writes data/research/app/*.json (hand-checked Montana guides), data/research/michelin.json, jbf.json and closed.json from the
compact lists below. Ported from nm-eats/pipeline/build_research.py (nh-eats, ma-eats before it).

The guides start from Visit Montana's own listings (the Montana Department of Commerce's Travel Montana Data Services API, the data
behind visitmt.com), read on the date in data/research/raw/visitmt-*.json by fetch_visitmt.py: its STEAK HOUSE and DRIVE-IN site types
and its supper clubs, each with the address the listing gives. The notes are our own words. A place is kept only when it matches one
open map listing in its town (or the same name at the same street number statewide), the kept places first, then an open Overture
listing the keep rule left out; the rest are leads. Founding years: Visit Montana's listing of the place itself, in its own words,
reviewed by hand (a building's age is not the business's). Honors: jamesbeard.org. No MICHELIN Guide covers Montana.
Usage: ../.venv/bin/python build_research.py   (then montana.py)"""
import glob, json, os, re
from brands import brand_of
from common import norm_name
ROOT = os.path.join(os.path.dirname(__file__), "..")
R = os.path.join(ROOT, "data", "research")
d = json.load(open(os.path.join(ROOT, "site", "montana.json")))
C, M = d["cols"], d["meta"]
import unicodedata
norm = lambda s: re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", unicodedata.normalize("NFKD", (s or "").lower()).encode("ascii", "ignore").decode()
                                             .replace("'", ""))).strip()

RAWF = sorted(glob.glob(os.path.join(R, "raw", "visitmt-*.json")))[-1]
RAW = json.load(open(RAWF))
VMT = lambda i: f"https://visitmt.com/listing/{i}"            # Visit Montana's own listing page for the place
JBF26 = "https://www.jamesbeard.org/stories/james-beard-award-semifinalists-2026"                   # 2026-01-21
JBF26N = "https://www.jamesbeard.org/stories/james-beard-awards-restaurant-and-chef-nominees-2026"  # 2026-03-31
JBF26W = "https://www.jamesbeard.org/stories/james-beard-award-winners-2026"                        # 2026-06-15
JBF25 = "https://www.jamesbeard.org/stories/the-2025-james-beard-award-semifinalists"               # 2025-01-22
JBF25N = "https://www.jamesbeard.org/stories/2025-james-beard-awards-restaurant-and-chef-nominees"  # 2025-04-02
PEKIN_CLOSED = "https://dailymontanan.com/2026/04/24/pekin-noodle-parlor-in-butte-closes-its-doors-after-117-years/"   # 2026-04-24

NOTE = {"steakhouse": "On Visit Montana's own steakhouse listings, the state tourism office's.",
        "supper club": "A supper club on Visit Montana's own listings, the state tourism office's.",
        "drive-in": "On Visit Montana's own drive-in listings, the state tourism office's."}


# chains (national or Montana's own, several locations) and coffee stands aren't the local places these guides are for, whatever the
# listing's site type says
NOT_LOCAL = re.compile(r"(?i)\b(?:outback|longhorn steakhouse|dairy queen|taco time|taco john|wendy|mcdonald|burger king|sonic|a ?& ?w|arby|"
                       r"montana'?s rib|montana club|jakers|applebee|perkins|4 ?b'?s|coffee|espresso|mocha|copy cup|blend 10|java)\b")


def entries(rows, kind):
    out = []
    for r in rows:
        name, town, addr = (r.get("Name") or "").strip(), (r.get("City") or "").strip(), (r.get("Address1") or "").strip()
        if not name or (r.get("State") or "MT").upper() not in ("MT", "MONTANA"):
            continue
        if NOT_LOCAL.search(name) or (brand_of(norm_name(name)) and not re.search(r"(?i)longhorn bar", name)):
            continue
        k = "supper club" if re.search(r"(?i)supper club", name) else kind
        out.append((name, town, addr if re.match(r"\s*\d", addr) else None, NOTE[k], None, None, [VMT(r["Id"])]))
    return out


GUIDES = {"steakhouse": entries(RAW["types"]["STEAK"] + [r for r in RAW["search"].get("supper club", [])
                                                         if r["Id"] not in {x["Id"] for x in RAW["types"]["STEAK"]}], "steakhouse"),
          "drive-in": entries(RAW["types"]["DRIVE"], "drive-in")}
# the oldest places: Visit Montana's listing of the place states the year it opened, reviewed by hand (filled from RAW["dated"])
HISTORIC = {   # Id -> (founded, the year as Visit Montana's listing of the place states it; building dates, hotels and chains left out)
    "13037": (1863, "Visit Montana's listing: the Star Bakery Restaurant first opened in 1863, serving miners."),
    "10008": (1883, "Visit Montana's listing: a legend in Missoula since 1883."),
    "20414": (1890, "Visit Montana's listing: the M&M first opened in 1890."),
    "11271": (1937, "Visit Montana's listing: serving meals since 1937."),
    "13105": (1938, "Visit Montana's listing: Norm's Soda Fountain opened in 1938."),
    "10579": (1946, "Visit Montana's listing: family owned and operated since 1946."),
    "21368": (1950, "Visit Montana's listing: established in 1950."),
    "7334": (1960, "Visit Montana's listing: opened in 1960."),
}
GUIDES["historic restaurant"] = [((r.get("Name") or "").strip(), (r.get("City") or "").strip(), (r.get("Address1") or "").strip() or None,
                                  "Open since " + str(HISTORIC[r["Id"]][0]) + ", by its own account on Visit Montana's listing.", HISTORIC[r["Id"]][0],
                                  HISTORIC[r["Id"]][1], [VMT(r["Id"])]) for r in RAW.get("dated", []) if r["Id"] in HISTORIC]

ADDR, POINT = {}, {}
# the name to show where the kept map listing carries another business's name (Rosebud's bar is filed as the LongHorn chain)
DISPLAY = {("Longhorn Bar and Steakhouse", "Rosebud"): "Longhorn Bar and Steakhouse"}
CUISINE = {}
KINDS = {k: [k] for k in GUIDES}
KINDS["steakhouse"] = ["steakhouse"]

MICHELIN = []   # no MICHELIN Guide covers Montana
MI_MATCH = {}
MI_UT = "https://guide.michelin.com/us/en/restaurants"
MW = "Best Chef: Mountain"
JBF = [{"name": "Wild Crumb", "city": "Bozeman", "honors": ["Outstanding Bakery winner 2026"], "sources": [JBF26W, JBF26N, JBF26]},
       {"name": "Herb & Omni", "city": "Whitefish", "honors": [f"{MW} finalist 2026 (Earl James Reynolds)"], "sources": [JBF26N, JBF26],
        "match_names": ["HERB AND OMNI"]},
       {"name": "Blackbird Kitchen", "city": "Bozeman", "honors": ["Outstanding Restaurant semifinalist 2026"], "sources": [JBF26],
        "match_names": ["BLACKBIRD"]},
       {"name": "One Legged Magpie", "city": "Red Lodge", "honors": ["Outstanding Wine and Other Beverages Program semifinalist 2026"], "sources": [JBF26]},
       {"name": "Pangea", "city": "Missoula", "address": "223 N Higgins Ave", "match_names": ["PANGEA BAR AND RESTAURANT"], "honors": [f"{MW} semifinalist 2026 (Brandon Cunningham)"], "sources": [JBF26]},
       {"name": "Ember", "city": "Hamilton", "honors": [f"{MW} semifinalist 2026 (Brandon Dearden)"], "sources": [JBF26]},
       {"name": "Shan", "city": "Bozeman", "honors": [f"{MW} semifinalist 2026 (Jarrett Wrisley)"], "sources": [JBF26]},
       {"name": "The Union", "city": "Helena", "address": "361 N Last Chance Gulch", "match_names": ["THE UNION RESTAURANT BY OLD SALT"], "honors": ["Best New Restaurant finalist 2025"], "sources": [JBF25N, JBF25]},
       {"name": "Vienne", "city": "Bozeman", "honors": ["Outstanding Bakery semifinalist 2025"], "sources": [JBF25]},
       {"name": "Devil's Toboggan", "city": "Bozeman", "honors": ["Outstanding Bar semifinalist 2025"], "sources": [JBF25], "match_names": ["DEVILS TOBOGGAN"]},
       {"name": "Campione", "city": "Livingston", "honors": [f"{MW} finalist 2025 (Joshua Adams)"], "sources": [JBF25N, JBF25]},
       {"name": "Hummingbird's Kitchen", "city": "Bozeman", "honors": [f"{MW} semifinalist 2025 (Linda Huang)"], "sources": [JBF25],
        "match_names": ["HUMMINGBIRDS KITCHEN"]},
       {"name": "Walkers Grill", "city": "Billings", "address": "2700 First Ave N", "match_names": ["WALKERS"], "honors": [f"{MW} semifinalist 2025 (Nick Steen Gullings and John Baldwin)"], "sources": [JBF25]}]

# America's Classics 2023, closed April 23, 2026 (the Tam family's announcement; the Daily Montanan)
CLOSED = [{"name": "Pekin Noodle Parlor", "city": "Butte", "address": "117 S Main St", "sources": [PEKIN_CLOSED],
           "note": "Closed April 2026 after more than a century (a James Beard America's Classic, 2023)."}]


import pandas as pd
from common import name_sim, MT
_S1 = pd.read_pickle(os.path.join(MT, "stage1.pkl"))
_S1 = _S1[~_S1.ov_closed.fillna(False) & ~_S1.j_outside.fillna(False)]
_num = lambda a: ((re.match(r"\s*0*(\d+)", a if isinstance(a, str) else "") or [None, ""])[1]).upper()


def by_address(name, num):
    """The same street number and a name that's the same business ("Grandma's K & I Diner" is K & I Diner; "Nopalito Restaurant" is
    Nopalito's Restaurants): the kept places first, then an open Overture listing the keep rule left out."""
    n0, k = _num(num), norm_name(name)
    kept = [i for i, a in enumerate(C["addr"]) if _num(a) == n0 and C["city"][i] is not None and name_sim(k, norm_name(C["name"][i])) >= 80]
    if kept:
        return kept, None
    s1 = _S1[_S1.street.map(_num).eq(n0)]
    s1 = s1[[name_sim(k, norm_name(n)) >= 80 for n in s1.name.fillna("")]]
    return [], (s1.iloc[0] if len(s1) == 1 else None)


def key(s):
    """The name key without a leading "the": "Varsity" is our "The Varsity"."""
    return re.sub(r"^the ", "", norm(s))


def find(name, town, num):
    hits = find_in(name, town, num)
    if not hits and num:   # the source's town is a village ("Intervale"): the same name at the same street number anywhere
        hits = find_in(name, None, num)
    return hits


def find_in(name, town, num):
    k = key(name)
    hits = [i for i, n in enumerate(C["name"]) if C["city"][i] is not None and (town is None or M["cities"][C["city"][i]] == town)
            and (key(n) == k or key(n).startswith(k + " ") or k.startswith(key(n) + " ") or key(n).replace(" ", "") == k.replace(" ", "")
                 or (key(n).split()[:2] == k.split()[:2] and len(k.split()) >= 2))]
    if num:
        hits = [i for i in hits if (C["addr"][i] or "").split(" ")[0].upper() == num.upper()]
    exact = [i for i in hits if key(C["name"][i]) == k]   # "Limoncello" and "Limoncello Ristorante", one place listed twice
    return exact if len(hits) > 1 and len(exact) == 1 else hits


leads, n_out = [], {}
for kind, rows in GUIDES.items():
    out = []
    for name, town, addr, note, founded, fnote, srcs in rows:
        num = (re.match(r"\s*(\d+)", addr or "") or [None, None])[1]
        hits = find(name, town, num)
        s1row = None
        if len(hits) != 1 and addr:
            alt, s1row = by_address(name, addr)
            if len(alt) == 1:
                hits = alt
        if len(hits) != 1 and addr and (kind == "historic restaurant" or s1row is not None):
            # a dated source with its own address, or a trail stop that is an open Overture listing at that address (the keep rule left
            # it out): added with the street address
            out.append({"name": name, "address": addr, "city": town, "zip": None, "kinds": KINDS[kind], "dishes": [], "note": note,
                        "founded": founded, "founded_note": fnote, "website": None, "open": True, "evidence_date": "2026-11",
                        "sources": srcs, "match_names": []} | ({"cuisine": CUISINE[(name, town)]} if (name, town) in CUISINE else {}))
            continue
        if len(hits) != 1:
            # trail listings carry no date, so a stop that matches no open map listing may have closed: a lead, not added
            why = "listed at several locations" if not addr else f"{len(hits)} open map listings match it"
            leads.append(f"- {kind}: {name} ({town}{', ' + addr if addr else ''}) — {why}; not added"); continue
        i = hits[0]
        out.append({"name": C["name"][i], "address": C["addr"][i], "city": M["cities"][C["city"][i]], "zip": str(C["zip"][i]) if C["zip"][i] else None,
                    "kinds": KINDS[kind], "dishes": [], "note": note, "founded": founded, "founded_note": fnote, "website": None, "open": True,
                    "evidence_date": "2026-11", "sources": srcs, "match_names": [name.upper()] if norm(name) != norm(C["name"][i]) else []})
        if brand_of(norm_name(name)):
            out[-1]["display"] = name
        if (name, town) in DISPLAY:
            out[-1]["display"] = DISPLAY[(name, town)]
        if (name, town) in CUISINE:
            out[-1]["cuisine"] = CUISINE[(name, town)]
    fn = re.sub(r"[^a-z]+", "_", kind).strip("_")
    json.dump(out, open(f"{R}/app/{fn}.json", "w"), indent=1, ensure_ascii=False)
    n_out[kind] = len(out)

MI_ADDR = {}
json.dump({"restaurants": [{"name": n, "address": MI_ADDR.get(n), "city": t, "zip": None, "distinction": dist, "cuisine": cu, "green_star": False,
                             "michelin_url": MI_UT, "sources": [MI_UT], "match_names": [x.upper() for x in MI_MATCH.get(n, [])], "open": True}
                            for n, t, dist, cu in MICHELIN]}, open(f"{R}/michelin.json", "w"), indent=1, ensure_ascii=False)
json.dump([dict({"address": None}, **j, zip=None, open=True) for j in JBF], open(f"{R}/jbf.json", "w"), indent=1, ensure_ascii=False)
json.dump(CLOSED, open(f"{R}/closed.json", "w"), indent=1, ensure_ascii=False)
open(f"{R}/app/LEADS.md", "w").write("# Montana research leads (not yet verified)\n\nWritten by pipeline/build_research.py.\n\n" + "\n".join(leads) + """

## Waiting for a source we may use
- Butte's pasties and pork chop sandwiches (Joe's Pasty Shop, Park Street Pasty, Pork Chop John's, Truzzolino's): Southwest Montana's
  pasty story names two shops and no address; not yet four places with a source we may use.
- Huckleberry shakes and pies, Indian tacos and frybread at Native-owned places: no 2025-26 source naming places yet.
- The Social Haus at the Resort at Paws Up (Greenough; Brandon Cunningham, 2025 Best Chef: Mountain finalist) and The Tasting Room at
  Chico Hot Springs (Pray; David Wells, 2025 finalist): resort dining rooms with no map listing of their own, so not placed.
- MICHELIN: no Montana guide (its Keys for Sage Lodge, Paws Up and Triple Creek Ranch are hotel honors, not restaurant ones).
""")
print(n_out, "| leads:", len(leads))
for l in leads: print(l)
