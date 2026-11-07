"""Montana's official records -> data/raw/official/ (playbook/12-sources.md).

Montana publishes no statewide restaurant or inspection list a script may read: DPHHS's My Health Department search sits behind a
reCAPTCHA, the five counties on InspectionsOnline (Flathead, Missoula, Yellowstone, Gallatin, Lewis and Clark) are search-only, and the
DOR liquor licensee export is a manual download (Nick's call). The one open list is the City of Helena's "PHRetailFood" ArcGIS layer
(458 retail food permits: name, geocoded address, permit number). Its service states no license or terms, so it is read for
calibration only (how often a map listing is a permitted food business) and nothing from it ships in the app or on the site.
Usage: ../.venv/bin/python fetch_official.py
"""
import os, json, datetime
import requests
from common import RAW

OFF = os.path.join(RAW, "official")
D = os.path.join(OFF, "helena")
URL = "https://helenamontanamaps.org/arcgisadp/rest/services/PHLE/FeatureServer/3/query"
UA = "TreasureStateEatsDataCheck/1.0 (nick@eatsranked.com)"
os.makedirs(D, exist_ok=True)
feats, off = [], 0
while True:
    r = requests.get(URL, params={"where": "1=1", "outFields": "*", "outSR": 4326, "f": "json", "resultOffset": off, "resultRecordCount": 1000},
                     headers={"User-Agent": UA}, timeout=120)
    r.raise_for_status()
    got = r.json().get("features") or []
    feats += got
    if len(got) < 1000:
        break
    off += len(got)
rows = [{"name": (f["attributes"].get("USER_Establishment") or "").strip(), "addr": (f["attributes"].get("Match_addr") or "").strip(),
         "permit": f["attributes"].get("Permit"), "lon": (f.get("geometry") or {}).get("x"), "lat": (f.get("geometry") or {}).get("y")} for f in feats]
json.dump(rows, open(os.path.join(D, "permits.json"), "w"), indent=0)
json.dump({"helena": {"url": URL.rsplit("/query", 1)[0], "rows": len(rows), "fetched": datetime.date.today().isoformat(),
                      "use": "calibration only (no license stated)"}}, open(os.path.join(OFF, "meta.json"), "w"), indent=1)
print("Helena retail food permits:", len(rows), "| with a point:", sum(r["lat"] is not None for r in rows), rows[:2])
