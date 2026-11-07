"""Visit Montana's own dining listings -> data/research/raw/visitmt-<date>.json, the starting point for the hand-checked guides.

The Montana Department of Commerce's Travel Montana Data Services API (data.visitmt.com; robots.txt allows it, check_sources.py) serves
the listings behind visitmt.com: site types (STEAK HOUSE, DRIVE-IN, ...), searches and each site's record (address, town, description,
dates). This reads the steakhouse and drive-in types, a "supper club" search and the dining types' records with a founding year in
their own words, one request at a time. build_research.py turns them into guides, keeping a place only where one open map listing
matches it at the listing's address.
Usage: ../.venv/bin/python fetch_visitmt.py
"""
import os, re, json, time, datetime
import requests

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "data", "research", "raw")
API = "https://data.visitmt.com/data/json"
H = {"User-Agent": "TreasureStateEatsDataCheck/1.0 (nick@eatsranked.com)"}
os.makedirs(OUT, exist_ok=True)


def get(path):
    time.sleep(0.4)
    r = requests.get(f"{API}/{path}", headers=H, timeout=60)
    r.raise_for_status()
    return r.json()["Results"]


def site(i):
    s = get(f"site/{i}")
    # the API's own field names -> ours
    return {"Id": str(i), "Name": s.get("SiteName"), "Address1": s.get("StreetStreet"), "City": s.get("StreetCity"), "State": s.get("StreetState"),
            "Zip": s.get("StreetZip"), "Latitude": s.get("Latitude"), "Longitude": s.get("Longitude"), "SiteType": s.get("SiteType"),
            "AltSiteTypes": s.get("AltSiteTypes"), "Description": s.get("NetDescriptions"), "Website": s.get("Url"), "Region": s.get("SiteRegion"),
            "SeasonOfOp": s.get("SeasonOfOp")}


out = {"read": datetime.date.today().isoformat(), "api": API, "types": {}, "search": {}}
for t in ("STEAK", "DRIVE", "FAMIL", "CAFEX", "FINED", "BARXX"):
    ids = [x["Id"] for x in get(f"type/{t}")]
    out["types"][t] = [site(i) for i in ids] if t in ("STEAK", "DRIVE") else ids
    print(t, len(ids), flush=True)
hits = get("find/summary/supper club?max=100")
out["search"]["supper club"] = [site(x["Link"].rsplit("/", 1)[-1] if x.get("Link") else x.get("Id")) for x in hits if re.search(r"(?i)supper club", x.get("Label") or x.get("Name") or "")]
# the other dining types' records, read only where the record states a founding year (for the oldest places)
seen = {s["Id"] for t in ("STEAK", "DRIVE") for s in out["types"][t]}
dated = []
for t in ("FAMIL", "CAFEX", "FINED", "BARXX"):
    for i in out["types"][t]:
        if i in seen:
            continue
        seen.add(i)
        s = site(i)
        if re.search(r"(?i)\b(?:since|opened in|established in|est\.?|founded in|built in|dating to|dates to|in business since)\s+(1[89]\d\d)\b", s.get("Description") or ""):
            dated.append(s)
out["dated"] = dated
fn = os.path.join(OUT, f"visitmt-{out['read']}.json")
json.dump(out, open(fn, "w"), indent=1, ensure_ascii=False)
print("wrote", fn, "| steak", len(out["types"]["STEAK"]), "| drive-in", len(out["types"]["DRIVE"]), "| supper club", len(out["search"]["supper club"]),
      "| dated", len(dated))
