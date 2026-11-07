# Treasure State Eats (mt-eats) — notes for Claude Code sessions

Built 2026-11-06 by a side session for Nick's "build the 17 remaining states" (group: Massachusetts, New Hampshire, New Mexico, Montana),
ported from `../nh-eats/` (ma-eats and va-eats before it, with every fix to 2026-11-05: delivery-only brands hidden, the shared website
blocklist and `link_blocklist.py`, the Share link to `Links.site + explore/#p=<id>`, OTA data, the widened adult rule, the Denny's
delivery-brand guard, Utah's street-word merge fix, the exact-outline county lookup). Local only: git-ignored data, no repo, no remote,
nothing published. Sources and calibration: `playbook/12-sources.md`. Brand: `playbook/05-naming.md` — **final** (Nick's decisions, 2026-11-07: "Treasure State Eats: Montana", Home Screen "Treasure State Eats"; a ribeye icon, concept B, on Glacier teal; Yogo
sapphire #23408E, Butte copper #A0522D, Glacier teal #0B6E75 honors, bitterroot pink #E8A3B5 fill only, cream #F7F3EA; a band of the
Rocky Mountain Front).

## Montana is different
- **No Google data at all**, in either build (Nick's rule for these four states): `listings.py` reads no UCSD snapshot.
- **No official list we may ship.** County and city sanitarians inspect; DPHHS's search is behind a reCAPTCHA; Flathead (official letter
  grades), Missoula, Yellowstone, Gallatin and Lewis and Clark post inspections on InspectionsOnline search pages, linked per county
  from each place (`Links.countyInspections`), never read; elsewhere places link DPHHS's list of county health departments. No result is
  shown and none computed. The DOR liquor export is a manual download (Nick's call): "Serves alcohol" is "—". Helena's retail food permit
  layer (no license stated) is read by `fetch_official.py` for **calibration only** (`calibrate.py`); `official.py` loads nothing.
- **Towns:** Overture's locality outlines (131), less the reservation districts, trailer parks and subdivisions, and Butte's outline (the
  whole city-county); outside every outline a listing keeps its postal town. A postal name maps to a town only when 75% of all its
  listings fall in that outline. Counties (56) split the detail files into Visit Montana's six travel regions.
- **Honors:** no MICHELIN Guide covers Montana. James Beard: Wild Crumb (Bozeman; Outstanding Bakery winner 2026), Earl James Reynolds
  (Herb & Omni, Whitefish; 2026 finalist), The Union (Helena; 2025 Best New Restaurant finalist), Joshua Adams (Campione, Livingston;
  2025 finalist), and the 2025-26 semifinalists. Pekin Noodle Parlor (America's Classics 2023) closed in April 2026: on the closed list.
- **Guides** (tags in `montana.py` TAGS, bits 1, 2, 4): steakhouses and supper clubs (40) and drive-ins (7), from Visit Montana's own
  listings through the Travel Montana Data Services API (`fetch_visitmt.py`), chains and coffee stands left out, each kept only where
  one open map listing matches it at the listing's address (`build_research.py`); oldest (8, from the listings' own words, reviewed by
  hand). Leads in `data/research/app/LEADS.md` (Butte pasties and pork chop sandwiches, huckleberry, Native-owned places).
- **Venues:** the airports' terminals (Billings Logan, Bozeman Yellowstone, Missoula), Malmstrom, the stadiums, arenas and fairgrounds,
  the prisons; casinos are soft venues (a bar with keno stays).
- **Inspections:** only a link on place pages (no inspection list among the guides), per Nick's 11-05 call.

## Rebuild
```bash
cd pipeline
../.venv/bin/python check_sources.py URL...   # a new host first
../.venv/bin/python fetch_overture.py && ../.venv/bin/python fetch_extras.py && ../.venv/bin/python fetch_official.py
../.venv/bin/python fetch_visitmt.py   # Visit Montana's listings (about 8 minutes, one request at a time)
../.venv/bin/python listings.py && ../.venv/bin/python calibrate.py
../.venv/bin/python montana.py && ../.venv/bin/python build_research.py && ../.venv/bin/python montana.py
MT_APP=1 ../.venv/bin/python montana.py && cd .. && cp data/app/places.json data/app/detail-*.json MontanaEats/Resources/
cd pipeline && ../.venv/bin/python check_websites.py && ../.venv/bin/python check_websites.py --retry-transient && cd ..   # then re-export
.venv/bin/python scripts/make-site.py && .venv/bin/python scripts/publish_app_data.py && .venv/bin/python scripts/publish_app_data.py --check
.venv/bin/python scripts/qa-site.py
```
(`listings.py` before `calibrate.py`, which adds each listing's county; `montana.py` once before `build_research.py`, which matches names
against `site/montana.json`.) The `.venv` is a copy of wy-eats' (python.org framework Python 3.12, md-eats' package versions).

## App, site, screenshots
- App: `MontanaEats/` (XcodeGen `project.yml`, bundle `com.montanaeats.ios`, display "Treasure State Eats"), tests in `MontanaEatsTests/`
  (data guards; the outline with Mammoth, Sheridan, Sandpoint, Williston and Coutts outside, Gardiner, Cooke City and Fairview inside)
  and `MontanaEatsUITests/`. Run with `DEVELOPER_DIR="/Applications/Xcode 1.app/Contents/Developer"`; unit tests may use
  `CODE_SIGNING_ALLOWED=NO`, UI tests need the signed runner (no flag). Archive only with Xcode 1.app (27.2, 27B52). Run `xcodegen
  generate` whenever the set of `Resources/*.json` files changes.
- Site: `scripts/make-site.py` writes `docs/` and `playbook/site-numbers.json`; `scripts/explore.js` is the web app (its map projection
  and `MT_RINGS` outline are Montana's); `scripts/qa-site.py` the QA. Site URL for now: nickstrom5.github.io/montana-eats (no CNAME).
  Rebuild the site before the unit tests (`ShareLinkTests` reads `docs/`).
- OTA data: `docs/data/app/` via `scripts/publish_app_data.py` (`../OTA-DATA.md`).
- Screenshots: `scripts/capture-screenshots.sh <sim>` (ScreenshotMode pins Bozeman's Main Street), then `scripts/site-images.sh`, then
  make-site + qa-site. App Store frames: `scripts/appstore-screenshots.py`. Icons: `scripts/icon-concepts.swift` and
  `scripts/make-brand.swift` (concept B).

## Status (2026-11-07): ready to publish
- Data: 2,863 places, 2,784 restaurants in 238 towns (QCEW 2,926); 55 hand-checked on a guide (40 steakhouses and supper clubs, 7
  drive-ins), 8 dated oldest, 13 James Beard honorees; Pekin Noodle Parlor on the closed list. Links checked 2026-11-06 (1,343 ok).
- Tests: unit (49) and UI tests pass on iPhone 17 Pro Max and iPad Pro 13" (iOS 27.0, Xcode 1.app), the launch check at 5.3 s (4.57 s on a quiet Mac, 2026-11-07).
  Screenshots in docs/screenshots and playbook/app-store/{iphone,ipad} (8 + 6 frames). Site: 14 pages; `qa-site.py` (full) passes. OTA
  2026-11-06.1 (`--check` OK). Listing: playbook/app-store/listing.json.
- Fixes found here: a guide phrase with a street word ("drive-in": "drive" maps to "dr") now matches as typed too, in the app and web app.
- Records: the QA session is drafting the requests to the five InspectionsOnline counties, for Nick. Not now (Nick, 2026-11-07):
  the DOR liquor export. Helena's permit layer stays calibration only (no license stated).

## Rules
No commits, pushes, public repos, App Store Connect or DNS changes without Nick's yes each time; never submit for review or accept
agreements; never publish Google-derived data. Support email nick@eatsranked.com. Commit author "Nick Soderstrom"
<329204362+nickstrom5@users.noreply.github.com> via `-c user.name -c user.email`.
