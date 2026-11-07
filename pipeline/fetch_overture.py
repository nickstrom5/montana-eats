"""Download the Overture Maps extracts that montana.py reads -> data/nm/

- overture_mt_bbox.parquet     every place in Montana's bounding box (name, category, address, point)
- overture_mt_sources.parquet  which datasets each Montana eating/drinking listing came from (Meta, Foursquare, ...)
- mt_shapes.json               simplified state and county outlines for the map
- mt_state_detail.geojson      the state outline at full detail, for the in-state test
- mt_counties_detail.geojson   the 56 counties (the files split by region)
- mt_towns_detail.geojson      Overture's locality outlines in Montana (cities, towns and census-designated places): a listing in
                               one takes its name as its town; one outside every outline keeps its postal town

Reads the public Overture bucket over S3 with DuckDB (no account needed). Ported from va-eats/pipeline/fetch_overture.py (2026-11-06).
The script checks the towns on the lines with Idaho, Wyoming, the Dakotas and Canada (Gardiner and Cooke City are in, Mammoth WY is
out; Lookout Pass and Sandpoint ID are out; Fairview MT is in, Williston ND out).
"""
import os, re, json, time
import duckdb
from shapely import wkb
from shapely.geometry import mapping, Polygon

RELEASE = "2026-10-21.0"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "mt")
# Montana (44.36°N–49.00°N, 104.04°W–116.05°W) plus a margin for the border towns
BBOX = "bbox.xmin BETWEEN -116.15 AND -103.95 AND bbox.ymin BETWEEN 44.3 AND 49.05"
EAT = "('restaurant','casual_eatery','bar','fast_food_restaurant','coffee_shop','cafe','smoothie_juice_bar','brewery','food_court')"
os.makedirs(OUT, exist_ok=True)

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
places = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*.parquet"

t = time.time()
if not os.path.exists(f"{OUT}/overture_mt_bbox.parquet"):
    con.execute(f"""
COPY (
  SELECT id, names.primary AS name, basic_category AS cat, taxonomy.primary AS tax, taxonomy.hierarchy AS hier, confidence,
         operating_status AS status, brand.names.primary AS brand, addresses[1].freeform AS street, addresses[1].locality AS city,
         addresses[1].postcode AS zip, addresses[1].region AS region, ST_Y(geometry) AS lat, ST_X(geometry) AS lon, websites[1] AS web,
         phones[1] AS phone
  FROM read_parquet('{places}', hive_partitioning=1) WHERE {BBOX}
) TO '{OUT}/overture_mt_bbox.parquet' (FORMAT PARQUET)""")
    print("places in bbox", round(time.time() - t), "s", flush=True)
if not os.path.exists(f"{OUT}/overture_mt_sources.parquet"):
    con.execute(f"""
COPY (
  SELECT id, list_transform(sources, lambda x: x.dataset) AS ds, list_transform(sources, lambda x: x.update_time) AS ut,
         list_transform(sources, lambda x: x.record_id) AS rid,
         len(socials) AS n_soc, len(websites) AS n_web, len(phones) AS n_ph
  FROM read_parquet('{places}', hive_partitioning=1)
  WHERE {BBOX} AND basic_category IN {EAT}
) TO '{OUT}/overture_mt_sources.parquet' (FORMAT PARQUET)""")
    print("sources", round(time.time() - t), "s", flush=True)

areas = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=divisions/type=division_area/*.parquet"
rows = con.execute(f"""
  SELECT subtype, names.primary AS name, ST_AsWKB(geometry) AS g
  FROM read_parquet('{areas}', hive_partitioning=1)
  WHERE country = 'US' AND region = 'US-MT' AND subtype IN ('region', 'county') AND class = 'land'
    AND bbox.xmin > -116.3 AND bbox.xmax < -103.8 AND bbox.ymin > 44.2 AND bbox.ymax < 49.2""").fetchall()
# the towns: every Overture locality outline in Montana (a name used twice is one town, its outlines joined)
trows = con.execute(f"""
  SELECT names.primary AS name, ST_AsWKB(geometry) AS g
  FROM read_parquet('{areas}', hive_partitioning=1)
  WHERE country = 'US' AND region = 'US-MT' AND subtype = 'locality' AND class = 'land'""").fetchall()
from shapely.ops import unary_union
# a reservation's district (a large rural area with a multilingual name: "Wolf Point District / ...") and the trailer parks and
# subdivisions Overture also lists are no towns: a listing there keeps its postal town
# Butte's outline is the whole consolidated city-county and more (it takes in Anaconda): Butte's listings keep their postal town
NOT_TOWNS = {"Big Sky Mobile Home Park", "Belle-Vue Court", "Casitas Del Rio", "Karst Loop", "Butte"}
towns = {}
for n, g in trows:
    n = re.sub(r"\s*/\s*CDP$", "", n or "")
    if n in NOT_TOWNS or "/" in n or n.endswith(" District"):
        continue
    geom = wkb.loads(bytes(g)).buffer(0)
    if n and geom.geom_type in ("Polygon", "MultiPolygon") and not geom.is_empty:
        towns[n] = unary_union([towns[n], geom]) if n in towns else geom
assert 90 < len(towns) < 600, len(towns)
json.dump({n: mapping(g.simplify(0.0002, preserve_topology=True)) for n, g in towns.items()}, open(f"{OUT}/mt_towns_detail.geojson", "w"))
print("towns:", len(towns), "of", len(trows), "locality rows")


def rings(geom, tol, min_area):
    geom = geom.simplify(tol, preserve_topology=True)
    polys = [p for p in getattr(geom, "geoms", [geom]) if p.geom_type == "Polygon" and p.area >= min_area]
    return [[[round(x, 3), round(y, 3)] for x, y in p.exterior.coords] for p in polys]


out = {"state": None, "counties": []}
for sub, name, g in rows:
    geom = wkb.loads(bytes(g)).buffer(0)
    if sub == "region":
        json.dump(mapping(geom.simplify(0.0005, preserve_topology=True)), open(f"{OUT}/mt_state_detail.geojson", "w"))
        out["state"] = [[r] for r in rings(geom, 0.002, 0.000005)]
    else:
        out["counties"].append({"name": name, "c": rings(geom, 0.004, 0.00002)})
# full-detail county polygons for assigning each place to a county (not shipped)
json.dump({name: mapping(wkb.loads(bytes(g)).buffer(0).simplify(0.0003, preserve_topology=True))
           for sub, name, g in rows if sub == "county"}, open(f"{OUT}/mt_counties_detail.geojson", "w"))
json.dump(out, open(f"{OUT}/mt_shapes.json", "w"), separators=(",", ":"))
print("outlines: state", len(out["state"] or []), "rings +", len(out["counties"]), "counties;", round(time.time() - t), "s total")
# islands, shores and border towns: each must fall on the right side of the detailed state outline
from shapely.geometry import shape, Point
st = shape(json.load(open(f"{OUT}/mt_state_detail.geojson")))
for nm, lon, lat, want in [("Billings", -108.5007, 45.7833, True), ("Missoula", -113.9940, 46.8721, True), ("Bozeman", -111.0429, 45.6770, True),
                           ("Kalispell", -114.3129, 48.1920, True), ("Butte", -112.5348, 46.0038, True), ("Helena", -112.0391, 46.5891, True),
                           ("Gardiner", -110.7058, 45.0322, True), ("Mammoth, WY", -110.7010, 44.9768, False), ("West Yellowstone", -111.1047, 44.6621, True),
                           ("Cooke City", -109.9318, 45.0202, True), ("Sandpoint, ID", -116.5532, 48.2766, False), ("Lookout Pass, ID", -115.6963, 47.4565, False),
                           ("Fairview", -104.0444, 47.8506, True), ("Williston, ND", -103.6180, 48.1470, False), ("Sheridan, WY", -106.9561, 44.7972, False),
                           ("Sweetgrass", -111.9590, 48.9970, True), ("Coutts, AB", -111.9600, 49.0050, False), ("Eureka", -115.0532, 48.8796, True),
                           ("Glasgow", -106.6367, 48.1969, True), ("Miles City", -105.8406, 46.4083, True), ("Belle Fourche, SD", -103.8521, 44.6714, False)]:
    ok = st.contains(Point(lon, lat))
    print(f"  {nm}: {'inside' if ok else 'outside'}{'' if ok == want else '  <-- WRONG'}")
print("counties:", len(out["counties"]), sorted(c["name"] for c in out["counties"]))

# the neighbours' land (Idaho, Wyoming, the Dakotas, British Columbia, Alberta and Saskatchewan): listings.py widens Montana's outline ~300 m,
# but only where no neighbour's land is, so a Mammoth, WY or Williston, ND listing on the far side of the line stays out
nb = con.execute(f"""
  SELECT region, ST_AsWKB(geometry) FROM read_parquet('{areas}', hive_partitioning=1)
  WHERE ((country = 'US' AND region IN ('US-ID', 'US-WY', 'US-SD', 'US-ND')) OR (country = 'CA' AND region IN ('CA-BC', 'CA-AB', 'CA-SK')))
    AND subtype = 'region' AND class = 'land'""").fetchall()
from shapely.geometry import box
near = box(-116.3, 44.2, -103.8, 49.2)
nbg = unary_union([wkb.loads(bytes(g)).buffer(0).intersection(near) for _, g in nb])
json.dump(mapping(nbg.simplify(0.0002, preserve_topology=True)), open(f"{OUT}/mt_neighbors.geojson", "w"))
print("neighbours:", sorted(r for r, _ in nb))
