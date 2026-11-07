# Montana sources and calibration (checked 2026-11-06)

## Official sources
| Source | What it has | Can a script read it? | Used |
|---|---|---|---|
| DPHHS Environmental Health and Food Safety (licenses retail food; county or city sanitarians inspect) | My Health Department's public search (inspections.myhealthdepartment.com/montana) | no: reCAPTCHA (403 to scripts) | no; places outside the five counties below link DPHHS's list of county and tribal health departments |
| InspectionsOnline searches: Flathead (official letter-grade placards, Board of Health Policy 2010-01), Missoula (an A+/A "Score" with no published definition), Yellowstone (RiverStone Health), Gallatin, Lewis and Clark | each county's inspections, search-only (a POST form, no export) | not crawled (the prompt; search pages) | linked per county from each place; no result shown, no grade computed. An export by records request: **Nick's call** |
| Great Falls/Cascade, Butte-Silver Bow and the other counties | reports on request, or PDFs that stop in 2024 | — | no |
| City of Helena "PHRetailFood" ArcGIS layer (helenamontanamaps.org .../PHLE/FeatureServer/3) | 458 retail food permits: name, geocoded address, permit number | yes (robots allows) | **calibration only**: the service states no license or terms, so nothing from it ships |
| DOR Alcoholic Beverage Control, TAP license search and its Export button | licensees statewide | a manual download; not crawled | no: "Serves alcohol" is "—" everywhere. Using the export: **Nick's call** |
| Montana State Library cadastral (MTParcels_GDB) | parcels with building values | yes | no (no building-value board; redistribution rights unclear) |

## Towns
A listing's town is the Overture locality outline its point is in (131 outlines: cities, towns and census places; the reservation
districts with multilingual names, four trailer parks and subdivisions, and Butte's outline, which is the whole consolidated
city-county and reaches past Anaconda, left out), or the nearest within ~200 m; outside every outline it keeps its postal town. A postal
name maps to one town only when 75% of all its listings fall in that town's outline (a fix: Butte's few listings inside Walkerville's
outline had made "Butte" mean Walkerville). The 21 border tests (Mammoth, Sheridan WY, Sandpoint, Lookout Pass, Williston, Coutts and
Belle Fourche out; Gardiner, Cooke City, West Yellowstone, Fairview, Sweetgrass and Eureka in) pass. Counties (56) split the app's detail
files into Visit Montana's six travel regions.

## Calibration
- BLS QCEW: 2,926 private NAICS 722 establishments (2025 average; 2,154 restaurants, 504 bars). Census CBP 2023: 3,072.
- Overture 2026-10-21.0: 5,785 eating and drinking listings in Montana (265 marked permanently closed). The family's keep rule (Meta
  0.95, or 0.90 with a website, or a brand feed) plus the hand-checked and honored places gives the App Store build **2,863 places,
  2,784 restaurants** (95% of QCEW).
- Helena's permits confirm the rule: Meta 0.95+ listings in Helena matched a retail food permit **83.2%** of the time (119 listings).
  31.6% of the 456 permits were found among the open map listings (the permits include grocery, school and other retail food).
- No Google data at all.

## Research sources (each place cites its own; data/research/app/*.json; read 2026-11-06)
- Visit Montana's own listings, through the Montana Department of Commerce's Travel Montana Data Services API (data.visitmt.com; robots
  allows; `pipeline/fetch_visitmt.py`, `data/research/raw/visitmt-2026-11-06.json`): the STEAK HOUSE (62) and DRIVE-IN (17) site types and
  the supper clubs, each with its address. Chains (Outback, Dairy Queen, Taco Time, Montana's Rib & Chop House, Montana Club...) and
  coffee stands are left out; a place is kept only where one open map listing matches it at the listing's address (40 steakhouses
  and supper clubs, 7 drive-ins). The notes are our own words.
- Founding years: the dining listings whose own description states the year the place opened, reviewed by hand (building dates,
  hotels and chains left out): 8 places from 1863 to 1960 (Star Bakery Restaurant, the Oxford, the M&M, Log Cabin Cafe, Norm's Soda
  Fountain, 3-D International, the Top Hat, Echo Lake Cafe).
- jamesbeard.org: the 2026 winners (Wild Crumb), nominees and semifinalists; the 2025 nominees and semifinalists. Pekin Noodle Parlor
  (America's Classics 2023) closed in April 2026 (the Daily Montanan, 2026-04-24): on the closed list.
- No MICHELIN Guide covers Montana (its Keys for Sage Lodge, Paws Up and Triple Creek Ranch are hotel honors).
- Leads (Butte pasties and pork chop sandwiches, huckleberry, Native-owned places, unmatched listings) in `data/research/app/LEADS.md`.
