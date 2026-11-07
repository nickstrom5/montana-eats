// Treasure State Eats web app: the iPhone app's guides, search, filters, map and place details, in the browser.
// Keep its guide rules in step with MontanaEats/Models/Guide.swift and its search with MontanaEats/Models/Search.swift.
// Same data as the app, split by scripts/make-site.py into data/core.json (list, search and map columns), data/ids.json (each place's
// stable id, fetched at the first tap, key, scroll or hover, so a visit that only looks doesn't download it; saved places and #p= links
// wait for it) and data/detail-<county>.json (phones, websites, notes, and county records or inspection results where a state has them), fetched per
// county when a place there is opened. Every data file carries the version of the core.json it was built with (core.json "ver",
// detail "_v", ids "v"): files from another build are fetched again, and never mixed in, because ids and details are keyed by row. No cookies, no trackers; saved places and the last guide live in this browser's localStorage only
// (keys start with mteats-: other state sites share the nickstrom5.github.io origin).
// The page runs under a strict Content-Security-Policy (hash-pinned inline script and style): never add inline event handlers or
// inline style attributes to the HTML built here; set properties from code instead.
(() => {
  "use strict";
  const BASE = document.documentElement.dataset.base || "";
  const $ = (s) => document.querySelector(s);
  // every value that goes into innerHTML passes through esc(), numbers included (the data file is trusted, but not that much)
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const own = (o, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);   // Object.hasOwn, for older Safari too
  const PREFIX = "mteats-";
  const store = {
    get(k, d) { try { const v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  // only http(s) links leave the page; bare hosts ("example.com/menu") get https://
  const safeUrl = (u) => {
    u = String(u ?? "").trim();
    if (/^https?:\/\/[^\s"'<>\\]+$/i.test(u)) return u;
    if (/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(?:[/?#][^\s"'<>\\]*)?$/i.test(u)) return "https://" + u;
    return null;
  };
  const num = (x) => (x == null || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtDate = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? "")); return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : String(s ?? ""); };
  // Montana's counties inspect; five post their inspections on search pages (linked from each place); nothing is read
  const DHHS_URL = "https://dphhs.mt.gov/publichealth/EHFS/countytribalhealthdepts";
  const COUNTY_INS = { "Flathead County": "https://www.inspectionsonline.us/foodsafety/mtflatheadkalispell/search.htm",
    "Missoula County": "https://www.inspectionsonline.us/foodsafety/mtmissoulamissoula/search.htm",
    "Yellowstone County": "https://www.inspectionsonline.us/foodsafety/mtyellowstonebillings/search.htm",
    "Gallatin County": "https://www.inspectionsonline.us/foodsafety/mtgallatinbozeman/search.htm",
    "Lewis and Clark County": "https://www.inspectionsonline.us/foodsafety/mtlewisandclarkhelena/search.htm" };

  // ---------------------------------------------------------------- search (a port of MontanaEats/Models/Search.swift)
  // pikes are street types too, and "state st" is a street, not the state
  const typeSyn = { avenue: "ave", av: "ave", street: "st", boulevard: "blvd", road: "rd", drive: "dr", place: "pl", court: "ct",
    parkway: "pkwy", highway: "hwy", lane: "ln", trail: "trl", circle: "cir", terrace: "ter", pike: "pike", pk: "pike", pke: "pike" };
  // directions and road names: "north main" finds "N Main St", "interstate 40" finds "I-40"
  const syn = { ...typeSyn, north: "n", south: "s", east: "e", west: "w", northwest: "nw", northeast: "ne", southwest: "sw", southeast: "se",
    saint: "st", mount: "mt", fort: "ft", interstate: "i", ih: "i", freeway: "fwy", expressway: "expy" };
  const abbrs = new Set(Object.values(syn)), typeAbbrs = new Set(Object.values(typeSyn));
  const DIRS = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw"]);
  // the bit order is pipeline/montana.py's TAGS
  const STEAKHOUSES = 1, DRIVEINS = 2, OLDEST = 4;
  // a dish ("banh mi", "cheesy western") is not a tag: it's in each hand-checked place's search text, so it finds the places serving it
  const tagPhrases = [["steakhouses", STEAKHOUSES], ["steakhouse", STEAKHOUSES], ["steak house", STEAKHOUSES], ["supper clubs", STEAKHOUSES],
    ["supper club", STEAKHOUSES], ["steaks", STEAKHOUSES], ["drive-ins", DRIVEINS], ["drive-in", DRIVEINS], ["drive ins", DRIVEINS], ["drive in", DRIVEINS]];
  // letters with no accent to strip (NFD keeps them): "pho tay do" must find Phở Tây Đô (Ohio's 2026-10-24 fix)
  const UNACCENTED = { "ø": "o", "æ": "ae", "œ": "oe", "đ": "d", "ł": "l", "ß": "ss", "þ": "th", "ı": "i" };
  function normalize(s) {
    let t = String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[øæœđłßþı]/g, (c) => UNACCENTED[c]);
    // initials keep together, so "jr crickets" finds J.R. Crickets (St. and E. Main St stay as they are)
    t = t.replace(/\b([a-z])\.(?=[a-z]\b)/g, "$1");
    t = t.replace(/\b([a-z0-9])\s*&\s*([a-z0-9])\b/g, "$1$2").replace(/&/g, " and ").replace(/['’`]/g, "");
    return t.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }
  const normAddr = (s) => normalize(s).split(" ").map((w) => (own(syn, w) ? syn[w] : w)).join(" ");

  function parse(text) {
    const q = { tokens: [], town: null, townPhrase: null, tag: 0, tagPhrase: null, tagStem: null, townNeedle: null, streetNeedle: null };
    let raw = normalize(text).split(" ").filter(Boolean);
    if (!raw.length) return q;
    let mapped = raw.map((w) => (own(syn, w) ? syn[w] : w));
    const find = (phrase) => {
      const p = phrase.split(" ");
      // the words as typed or as mapped ("drive-in" maps "drive" to the street type "dr", so the phrase is matched as typed too)
      for (let i = 0; i + p.length <= mapped.length; i++) if (p.every((w, k) => mapped[i + k] === w) || p.every((w, k) => raw[i + k] === w)) return [i, i + p.length];
      return null;
    };
    const cut = ([a, b]) => { const words = raw.slice(a, b).join(" "); raw.splice(a, b - a); mapped.splice(a, b - a); return words; };
    for (const [phrase, tag] of tagPhrases) { const r = find(normalize(phrase)); if (r) { q.tag = tag; q.tagPhrase = cut(r); break; } }
    if (q.tagPhrase) { const stem = normalize(q.tagPhrase).replace(/s$/, ""); q.tagStem = stem ? " " + stem : null; }
    // the longest town named in the query wins, unless a street type follows it ("houston st" is a street)
    for (const key of TOWN_KEYS_BY_LENGTH) {
      const r = find(key);
      if (r && !(r[1] < mapped.length && typeAbbrs.has(mapped[r[1]]))) {
        // a direction word right before the town ("north shreveport") may mean the street as well as the town
        if (r[0] > 0 && DIRS.has(mapped[r[0] - 1])) q.streetNeedle = " " + mapped.slice(r[0] - 1, r[1]).join(" ") + " ";
        q.town = TOWN_KEYS[key]; q.townPhrase = cut(r); q.townNeedle = " " + normalize(q.townPhrase); break;
      }
    }
    const stop = new Set(["the", "and", "of", "a", "in", "near", "me"]);   // "barbecue near me" isn't a place named "Me"
    let idx = raw.map((_, i) => i);
    // stop words stay only when they're all there is ("the"); next to a guide or a town ("lemon pepper near me") they go
    if (q.tag || q.town || idx.some((i) => !stop.has(mapped[i]))) idx = idx.filter((i) => !stop.has(mapped[i]));
    idx.forEach((i, n) => {
      const token = raw[i], isLast = n === idx.length - 1;
      if (own(syn, token)) { q.tokens.push([` ${syn[token]} `, ` ${token}`]); return; }
      const whole = (abbrs.has(token) && (!isLast || token.length > 1)) || (token.length <= 2 && !isLast);
      const needles = [" " + token + (whole ? " " : "")];
      if (isLast && token.length >= 3) for (const [word, abbr] of Object.entries(typeSyn)) if (word !== token && word.startsWith(token)) needles.push(` ${abbr} `);
      q.tokens.push(needles);
    });
    // "brady st": a finished street type sticks to the word before it
    if (q.tokens.length >= 2 && idx.length && typeAbbrs.has(mapped[idx[idx.length - 1]])) {
      const last = idx[idx.length - 1], prev = idx[idx.length - 2];
      q.tokens.splice(-2, 2, [` ${mapped[prev]} ${mapped[last]} `, ` ${raw[prev]} ${raw[last]}`]);
    }
    return q;
  }
  const qEmpty = (q) => !q.tokens.length && !q.town && !q.tag;
  function matches(p, q) {
    if (q.tag && !(p.g & q.tag)) { if (!q.tagStem || !p.nameText.includes(q.tagStem)) return false; }
    if (q.town && p.c !== q.town) {
      if (!(q.townNeedle && p.nameText.includes(q.townNeedle)) && !(q.streetNeedle && p.search.includes(q.streetNeedle))) return false;
    }
    return q.tokens.every((needles) => needles.some((n) => p.search.includes(n)));
  }
  const nameMatches = (p, q) => q.tokens.length && q.tokens.every((needles) => needles.some((n) => p.nameText.includes(n)));

  // ---------------------------------------------------------------- guides (MontanaEats/Models/Guide.swift)
  const hcTag = (t) => (p) => p.hc && Boolean(p.g & t);
  const HC_SORTS = ["featured", "nearest", "name"];
  const GUIDES = {
    steakhouses: { title: "Steakhouses & Supper Clubs", sub: "Hand-checked steakhouses and supper clubs on Visit Montana's own listings", inc: hcTag(STEAKHOUSES), sorts: HC_SORTS },
    driveins: { title: "Drive-Ins", sub: "Hand-checked drive-ins on Visit Montana's own listings", inc: hcTag(DRIVEINS), sorts: HC_SORTS },
    honors: { title: "James Beard Honors", sub: "James Beard winners, finalists and semifinalists", inc: (p) => p.mi > 0 || p.jb, sorts: ["iconic", "nearest"] },
    oldest: { title: "Oldest Places", sub: "Founding years checked at the same address, oldest first", inc: (p) => p.f != null && p.hc && Boolean(p.g & OLDEST), sorts: ["oldest"], ranked: true },
    all: { title: "All Restaurants", sub: "Restaurants, cafés, bars and bakeries statewide", inc: () => true, sorts: ["name", "nearest"] },
    saved: { title: "Saved", sub: "Places you saved in this browser", inc: (p) => saved.has(p.id), sorts: ["name", "nearest"] },
  };
  const HC_GUIDES = ["steakhouses", "driveins"];
  const SORT_LABEL = { featured: "Featured first", nearest: "Nearest", oldest: "Oldest first", name: "A to Z", iconic: "James Beard honors first" };
  const MI = ["", "MICHELIN Recommended", "Bib Gourmand", "1 MICHELIN Star", "2 MICHELIN Stars", "3 MICHELIN Stars"];
  const CHIP = [[STEAKHOUSES, "Steakhouse"], [DRIVEINS, "Drive-in"]];

  // ---------------------------------------------------------------- state
  let P = [], CAL = {}, TOWN_KEYS = {}, TOWN_KEYS_BY_LENGTH = [], GENERATED = "", META = {};
  let here = null, shown = 100, current = [], view = "list";
  const savedRaw = store.get("saved", []);
  const saved = new Set(Array.isArray(savedRaw) ? savedRaw.filter((x) => typeof x === "string" && x.length < 64) : []);
  const st = { g: "steakhouses", q: "", sort: "", town: "", cuisine: "", chains: false, bib: false, p: "" };
  let bibCount = 0;   // Bib Gourmand places (non-restaurants left out): the box shows only when there are some

  const miles = (a, b) => {
    const r = Math.PI / 180, dLa = (b.la - a.la) * r, dLo = (b.lo - a.lo) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.la * r) * Math.cos(b.la * r) * Math.sin(dLo / 2) ** 2;
    return 3958.8 * 2 * Math.asin(Math.sqrt(h));
  };
  const milesText = (m) => (m < 10 ? m.toFixed(1) : Math.round(m)) + " mi";

  function order() {
    const g = GUIDES[st.g];
    let o = st.sort && g.sorts.includes(st.sort) ? st.sort : HC_GUIDES.includes(st.g) && here ? "nearest" : g.sorts[0];
    if (o === "nearest" && !here) o = g.sorts.find((s) => s !== "nearest") || o;   // no location yet: say what the list is really sorted by
    return o;
  }

  function allows(p) {
    if (st.town && p.c !== st.town) return false;
    if (st.cuisine && p.cu !== st.cuisine) return false;
    if (st.chains && p.ch >= 5) return false;
    if (st.bib && p.mi !== 2) return false;      // MICHELIN Bib Gourmand only, as the app's Filters switch
    return true;
  }

  function list() {
    const g = GUIDES[st.g], q = parse(st.q), o = order();
    if (qEmpty(q) && st.q.trim()) return [];   // typed something, but nothing searchable ("🍕", "!!!")
    let out = P.filter((p) => g.inc(p) && allows(p) && (qEmpty(q) || matches(p, q)));
    const byName = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.i - b.i);
    if (o === "nearest" && here) {
      const dist = new Map(out.map((p) => [p, p.la != null ? miles(here, p) : Infinity]));
      out.sort((a, b) => dist.get(a) - dist.get(b) || byName(a, b));
    }
    else if (o === "featured") out.sort((a, b) => (b.ip ?? -1) - (a.ip ?? -1) || (a.f ?? 9999) - (b.f ?? 9999) || byName(a, b));
    else if (o === "oldest") out.sort((a, b) => (a.f ?? 9999) - (b.f ?? 9999) || byName(a, b));
    else if (o === "iconic") {   // MICHELIN distinction, then the James Beard honor, then name (the app's order)
      const jb = (p) => (p.h & 1 ? 4 : p.h & 2 ? 3 : p.h & 4 ? 2 : p.h & 8 ? 1 : 0);
      out.sort((a, b) => (b.mi || 0) - (a.mi || 0) || jb(b) - jb(a) || byName(a, b));
    }
    else out.sort(byName);
    if (q.tokens.length && !g.ranked) {       // name matches first when searching
      const named = out.filter((p) => nameMatches(p, q));
      if (named.length && named.length < out.length) { const ids = new Set(named); out = named.concat(out.filter((p) => !ids.has(p))); }
    }
    return out;
  }

  // ---------------------------------------------------------------- rendering
  const jbLabel = (p) => (p.h & 1 ? "America's Classic" : p.h & 2 ? "James Beard winner" : p.h & 4 ? "James Beard finalist" : p.h & 8 ? "James Beard semifinalist" : p.jb ? "James Beard (restaurateur)" : null);
  function chips(p, max) {
    const c = [];
    if (p.mi && MI[p.mi]) c.push(`<span class="tag tag-mi">${esc(MI[p.mi])}</span>`);
    const jb = jbLabel(p);
    if (jb) c.push(`<span class="tag tag-jb">${esc(jb)}</span>`);
    if (p.hc) for (const [t, label] of CHIP) if (p.g & t) c.push(`<span class="tag">${label}</span>`);
    if (p.hc && p.g & OLDEST && p.f) c.push(`<span class="tag tag-plain">Since ${esc(p.f)}</span>`);
    if (p.ch >= 5) c.push(`<span class="tag tag-plain">Chain · ${esc(p.ch)}</span>`);
    if (p.t === 0 && !p.h && !p.mi && !p.hc) c.push('<span class="tag tag-dash">Listing only</span>');
    return (max ? c.slice(0, max) : c).join("");
  }

  function metric(p, o) {
    if (o === "nearest" && here && p.la != null) return [milesText(miles(here, p)), "away"];
    if (p.f && st.g !== "all") return [String(p.f), "since"];
    return null;
  }

  function render() {
    const g = GUIDES[st.g], o = order();
    if (st.g === "saved" && !idsReady) loadIds().then(() => { if (st.g === "saved") render(); });
    current = list();
    document.querySelectorAll(".ex-guides button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.g === st.g)));
    $("#ex-sub").textContent = g.sub;
    const sortSel = $("#ex-sort");
    sortSel.innerHTML = g.sorts.map((s) => `<option value="${esc(s)}"${s === o ? " selected" : ""}>${esc(SORT_LABEL[s])}</option>`).join("");
    sortSel.disabled = g.sorts.length < 2;
    const filters = [st.town && `in ${st.town}`, st.cuisine && st.cuisine, st.chains && "no chains", st.bib && "Bib Gourmand"].filter(Boolean);
    $("#ex-count").textContent = `${current.length.toLocaleString()} ${current.length === 1 ? "place" : "places"} · ${SORT_LABEL[o]}` + (filters.length ? ` · ${filters.join(", ")}` : "");
    $("#ex-clear").hidden = !filters.length;
    // Near me stays: each tap asks for a fresh fix (people move), and it's how to retry after a timeout
    if (view === "list") renderList(o); else drawMap();
    saveHash();
  }

  // typing searches only the open guide (the page opens on Lemon Pepper Wings): when that finds little, the same words across every
  // restaurant, with the same filters, so a famous place outside the guide isn't a dead end
  const FEW = 5;
  function elsewhereCount() {
    const q = parse(st.q);
    if (st.g === "all" || qEmpty(q) || current.length >= FEW) return 0;
    let n = 0;
    for (const p of P) if (allows(p) && matches(p, q)) n++;
    return n > current.length ? n : 0;
  }
  const allButton = (n) => `<button type="button" class="ex-small" id="ex-all">Search all restaurants (${esc(n.toLocaleString())} ${n === 1 ? "match" : "matches"})</button>`;
  function wireAll() {
    const b = $("#ex-all");
    if (b) b.onclick = () => { st.g = "all"; st.sort = ""; shown = 100; render(); const r = $(".ex-row"); if (r) r.focus(); };
  }

  function renderList(o) {
    const ol = $("#ex-list");
    const g = GUIDES[st.g];
    const elsewhere = elsewhereCount();
    if (!current.length) {
      ol.innerHTML = `<li class="ex-empty">${st.g === "saved" && !idsReady ? "Loading your saved places…" : st.g === "saved" && idsFailed && saved.size ? "Your saved places couldn't load: you may be offline, or the site was just updated. Reload the page to try again." : elsewhere ? `Nothing in ${esc(g.title)} matches that. ${allButton(elsewhere)}` : st.g === "saved" ? "Nothing saved yet. Open a place and tap Save to keep it here, in this browser." : "No places match. Try fewer words or clear the filters."}</li>`;
      wireAll();
      $("#ex-more").hidden = true;
      return;
    }
    ol.innerHTML = current.slice(0, shown).map((p, i) => {
      const m = metric(p, o);
      const rank = g.ranked ? `<span class="ex-rank${i < 3 ? " top" : ""}" aria-label="Rank ${i + 1}">${i + 1}</span>` : "";
      const where = [p.c, p.cu].filter(Boolean).join(" · ");
      const big = m ? `<b>${esc(m[0])}</b>` : "";
      return `<li><button class="ex-row" data-i="${esc(p.i)}">${rank}<span class="ex-main"><b>${esc(p.n)}</b><span class="ex-town">${esc(where)}</span><span class="ex-chips">${chips(p, 4)}</span></span>${m ? `<span class="ex-metric">${big}<small>${esc(m[1])}</small></span>` : ""}</button></li>`;
    }).join("") + (elsewhere ? `<li class="ex-empty">Only ${esc(current.length)} in ${esc(g.title)}. ${allButton(elsewhere)}</li>` : "");
    wireAll();
    const left = current.length - shown;
    $("#ex-more").hidden = left <= 0;
    $("#ex-more").textContent = `Show more (${left.toLocaleString()} left)`;
  }

  // ---------------------------------------------------------------- place panel
  const TIER = { 2: "On an official list", 1: "High-confidence listing", 0: "Listing only" };   // "High-confidence", not "confirmed" (Nick, 2026-10-13)

  // the state's alcohol licenses are the only statewide official list, and only places serving alcohol hold one, so its match rates are a
  // floor for comparing kinds of listings, not a rate to quote per place (the app shows none either)
  function howWeKnow(p) {
    const src = SOURCES[p.s] || "meta";
    if (src === "research") return "On our hand-checked list (checked against a 2025 or 2026 source). The open map data didn't list it as a place to eat, so it's placed from its own map listing or street address.";
    if (p.t === 2) return src === "official"
      ? "From the state's alcohol license list. The open map data didn't have it, so it's placed on its licensed street address."
      : "Matched to an active state alcohol license.";
    return (p.t === 1 ? "A high-confidence listing in Overture's open map data." : "A single listing in Overture's open map data, so it may be closed or misfiled.")
      + (p.hc ? " It's also on our hand-checked list, checked against a 2025 or 2026 source." : "");
  }

  const kv = (k, v) => (v == null || v === "" ? "" : `<div class="ex-kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`);
  const section = (t, body) => `<section class="ex-sec"><h3>${esc(t)}</h3>${body}</section>`;
  let listAtPush = null;   // the list's URL state when a place was opened with pushState (Back then closes the panel)

  // the open place is a modal dialog at every width (a bottom sheet on phones, a side sheet on wider screens, which would otherwise
  // cover Near me and the List/Map buttons): everything behind it is inert, and a click on the dimmed backdrop closes it
  function panelMode() {
    const panel = $("#ex-panel"), modal = !panel.hidden;
    if (modal) { panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); }
    else { panel.removeAttribute("role"); panel.removeAttribute("aria-modal"); }
    $("#ex-backdrop").hidden = !modal;
    const behind = [...document.querySelectorAll("body > .skip, .wrap > header, .wrap > nav, .wrap > footer, #main > *")].filter((el) => el !== panel && el.id !== "ex-backdrop");
    behind.forEach((el) => { el.inert = modal; });
  }

  // no inspection results are read in Montana: each place links its county's search, or DPHHS's list of county health departments
  const inspectionSection = (d, p) => section("Health inspections", COUNTY_INS[p.county]
    ? `<p class="ex-fine">${esc(p.county)}'s sanitarians post their restaurant inspections on the county's own search, not as data, so this site shows none and computes no grade.${p.county === "Flathead County" ? " Flathead's posted placards carry the county's official letter grade." : ""}</p><p><a href="${COUNTY_INS[p.county]}" rel="noopener" target="_blank">${esc(p.county)}'s inspection search</a></p>`
    : `<p class="ex-fine">Montana's county and city sanitarians inspect restaurants and keep the reports; this county publishes none online, so this site shows none and computes no grade.</p><p><a href="${DHHS_URL}" rel="noopener" target="_blank">Montana's county health departments</a></p>`);

  function openPlace(p, push = true) {
    const panel = $("#ex-panel");
    const wasOpen = !panel.hidden;
    // the place opens at once; its id (for Save, the #p= link and the Back step) follows when ids.json arrives, which the first tap
    // only starts, so a tap never waits on it. If ids.json can't load (offline, or a build changed under us), the place stays open
    // without Save and without a link.
    const waiting = p.id == null && !idsReady;
    if (waiting && (push || !wasOpen)) loadIds().then(() => { if (!panel.hidden && panel.dataset.i === String(p.i)) openPlace(p, push); });
    const noId = p.id == null, pid = p.id ?? "";
    // a re-render (the county's details just arrived) replaces the panel's buttons: remember where keyboard focus was, to put it back
    const focused = wasOpen && panel.contains(document.activeElement) ? document.activeElement : null;
    const refocus = focused && (focused.id ? `#${focused.id}` : focused.textContent.trim());
    st.p = pid;
    const loaded = DETAIL_LOADED.has(p.co), failed = DETAIL_FAILED.has(p.co);
    const d = DETAIL.get(p.i) || {};
    const la = num(p.la), lo = num(p.lo);
    const addr = [p.a, [p.c, p.z].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const apple = la != null && lo != null
      ? `https://maps.apple.com/?q=${encodeURIComponent(p.n)}&ll=${la},${lo}`
      : `https://maps.apple.com/?q=${encodeURIComponent(p.n + ", " + addr)}`;
    const dirs = la != null && lo != null ? `https://maps.apple.com/?daddr=${la},${lo}&dirflg=d` : apple;
    const site = safeUrl(d.w);
    const tel = d.ph ? String(d.ph).replace(/[^\d+]/g, "") : "";
    let html = `<button class="ex-close" id="ex-close" aria-label="Close">×</button>
      <p class="ex-kicker">${esc([p.ar && p.c ? `${p.ar}, ${p.c}` : p.c || "Montana", p.county && p.county !== "Montana" ? p.county : ""].filter(Boolean).join(" · ").toUpperCase())}</p>
      <h2 id="ex-pname">${esc(p.n)}</h2>
      <p class="ex-addr">${esc([addr, p.cu].filter(Boolean).join(" · "))}</p>
      ${here && la != null ? `<p class="ex-dist">${esc(milesText(miles(here, p)))} away</p>` : ""}
      <p class="ex-chips">${chips(p)}</p>
      <div class="ex-actions">
        <a class="btn ex-apple" href="${esc(apple)}" rel="noopener" target="_blank">Ratings, hours &amp; photos · Apple Maps</a>
        <div class="ex-act-row">
          <a href="${esc(dirs)}" rel="noopener" target="_blank">Directions</a>
          ${tel ? `<a href="tel:${esc(tel)}">Call</a>` : ""}
          ${site ? `<a href="${esc(site)}" rel="noopener nofollow" target="_blank">Website</a>` : ""}
          ${waiting ? '<button id="ex-save" aria-pressed="false" disabled>Save</button>' : noId ? "" : `<button id="ex-save" aria-pressed="${saved.has(pid)}">${saved.has(pid) ? "Saved" : "Save"}</button>`}
        </div>
      </div>`;
    if (!loaded) html += `<p class="ex-fine">Loading details…</p>`;
    if (p.hc && (d.note || p.dish || p.f || d.seas)) {
      html += section("Hand-checked", (d.note ? `<p>${esc(d.note)}</p>` : "") + kv("On the menu", p.dish ? String(p.dish).split("; ").join(", ") : "")
        + kv("Open here since", p.f) + (d.fn ? `<p class="ex-fine">${esc(d.fn)}</p>` : "") + kv("Season", d.seas)
        + `<p class="ex-fine">Checked against Visit Montana's own listings, the state tourism office's. Menus and hours change, so check before you go.</p>`);
    }
    if (p.mi || d.jbf) {
      const lines = [...(p.mi && MI[p.mi] ? [MI[p.mi]] : []),
        ...(d.jbf ? String(d.jbf).split("; ").map((x) => "James Beard: " + x) : [])];
      html += section("Honors", `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul><p class="ex-fine">Honors are facts, not ratings. James Beard Foundation and James Beard Award are trademarks of the James Beard Foundation.</p>`);
    }
    if (failed) html += `<p class="ex-fine">This place's details (county records, phone, website) didn't load: you may be offline, or the site was just updated. Reload the page to try again.</p>`;
    else if (loaded) {
      const lic = Array.isArray(d.lic) ? d.lic.filter(Array.isArray) : [];
      html += section("Official records", (lic.length ? lic.map((l) => kv(String(l[0] || "Record"), [l[2], l[1] ? "No. " + l[1] : ""].filter(Boolean).join(" · ") || "On the list")).join("")
          : kv("License record", "—"))
        + kv("Serves alcohol", p.lq ? "Licensed to serve on the premises" : "—")
        + `<p class="ex-fine">Montana publishes no open list of its restaurants we may read, and the Department of Revenue's licensee list isn't published as data, so this site shows no license and no alcohol status: — means unknown, never "no".</p>`);
    }
    html += loaded ? inspectionSection(d, p) : "";
    html += section("How we know it's here", kv("Listed as", TIER[p.t])
      + (p.ch >= 2 ? kv("Locations in Montana", p.ch.toLocaleString()) : "") + `<p class="ex-fine">${esc(howWeKnow(p))}</p>`);
    const store_url = safeUrl(window.APP_STORE_URL);   // set in the page footer script once the App Store listing exists
    html += store_url
      ? `<p class="ex-app">Save it on your phone: <a href="${esc(store_url)}" rel="noopener">get the free iPhone app</a></p>`
      : `<p class="ex-app">The iPhone app is coming soon. <a href="${BASE}/#download">Ask for early access</a></p>`;
    panel.innerHTML = html;
    panel.dataset.id = pid;
    panel.dataset.i = String(p.i);
    panel.hidden = false;
    document.body.classList.add("ex-open");
    panelMode();
    $("#ex-close").onclick = () => closePlace();
    if (!noId) $("#ex-save").onclick = (e) => {
      if (saved.has(p.id)) saved.delete(p.id); else saved.add(p.id);
      store.set("saved", [...saved]);
      e.target.textContent = saved.has(p.id) ? "Saved" : "Save";
      e.target.setAttribute("aria-pressed", String(saved.has(p.id)));
      if (st.g === "saved") render();
    };
    const samePlace = wasOpen && panel.dataset.shown === String(p.i);   // a re-render: details or the id just arrived
    if (!samePlace) panel.scrollTop = 0;
    panel.dataset.shown = String(p.i);
    if (!samePlace) $("#ex-close").focus();
    else if (refocus) {
      const same = refocus.startsWith("#") ? panel.querySelector(refocus)
        : [...panel.querySelectorAll("a, button")].find((el) => el.textContent.trim() === refocus);
      (same || $("#ex-close")).focus();
    }
    if (push && !noId) {
      if (panel.dataset.pushed) saveHash();   // one Back step per panel, not per place looked at
      else { listAtPush = listHash(); saveHash(true); panel.dataset.pushed = "1"; }
    }
    if (!loaded) loadDetail(p.co).then(() => { if (panel.dataset.i === String(p.i) && !panel.hidden) openPlace(p, false); });
  }

  // fromHistory: the Back button (or a hash link) already moved the URL, so don't touch history again
  function closePlace(fromHistory = false) {
    st.p = "";
    const panel = $("#ex-panel");
    const wasI = panel.dataset.i;   // the row the panel belonged to: focus goes back there
    panel.hidden = true;
    delete panel.dataset.id;
    delete panel.dataset.i;
    delete panel.dataset.shown;
    delete panel.dataset.pushed;
    document.body.classList.remove("ex-open");
    panelMode();
    if (!fromHistory) {
      // the list hasn't changed since the panel opened: step back over the entry openPlace pushed, so Back isn't a dead click
      if (history.state && history.state.mteats === "place" && listHash() === listAtPush) history.back();
      else saveHash();
    }
    listAtPush = null;
    const row = wasI && document.querySelector(`.ex-row[data-i="${Number(wasI)}"]`);
    if (row) row.focus();
  }

  // ---------------------------------------------------------------- map (canvas: county outlines + a dot per place)
  let SHAPES = null, cam = null;
  // Montana's own frame (set per state: a port's leftover numbers once framed the wrong state, QA 2026-11-03)
  const LAT0 = 46.9, KX = Math.cos(LAT0 * Math.PI / 180);
  const proj = (lo, la) => [(lo - (-109.6)) * KX, -(la - LAT0)];

  function fitCam(w, h) {
    const [x0, y0] = proj(-116.05, 49.0), [x1, y1] = proj(-104.04, 44.36);   // the state's west/north and east/south edges
    const k = Math.min(w / (x1 - x0), h / (y1 - y0)) * 0.95;
    return { k, x: (w - (x1 - x0) * k) / 2 - x0 * k, y: (h - (y1 - y0) * k) / 2 - y0 * k };
  }

  // calls f on every ring, however deeply it's nested (the state is [polygon[ring[point]]], each county [ring[point]])
  const eachRing = (g, f) => {
    if (!Array.isArray(g) || !g.length) return;
    if (Array.isArray(g[0]) && typeof g[0][0] === "number") f(g); else g.forEach((x) => eachRing(x, f));
  };

  const classic = (p) => Boolean((p.hc && p.g) || p.mi);
  async function drawMap() {
    const cv = $("#ex-map"), wrap = $("#ex-mapwrap");
    const w = wrap.clientWidth, h = wrap.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    if (!cam) cam = fitCam(w, h);
    if (!SHAPES) SHAPES = await fetchJSON(`${BASE}/data/mt_shapes.json`).catch(() => ({ state: [], counties: [] }));
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const X = (lo, la) => { const [x, y] = proj(lo, la); return [x * cam.k + cam.x, y * cam.k + cam.y]; };
    const ring = (r) => { r.forEach(([lo, la], i) => { const [x, y] = X(lo, la); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); };
    c.fillStyle = "#f7f3ec";   // the map stays light in dark mode (its frame is light too), so the navy dots keep their contrast
    c.beginPath(); eachRing(SHAPES.state, ring); c.fill("evenodd");
    c.strokeStyle = "rgba(14,26,48,.22)"; c.lineWidth = 0.8;
    for (const co of SHAPES.counties || []) { c.beginPath(); eachRing(co.c, ring); c.stroke(); }
    const pts = current.filter((p) => p.la != null);
    const r = Math.max(2.2, Math.min(5, 1.6 + cam.k / 120));
    // plain places: one batch of small squares (tens of thousands draw fast that way); hand-checked and honored places: dots on top
    c.fillStyle = "#1f3a5f";
    const sq = pts.length > 3000 ? Math.max(1.6, r - 0.6) : r * 1.6;
    for (const p of pts) {
      if (classic(p)) continue;
      const [x, y] = X(p.lo, p.la);
      if (x < -5 || y < -5 || x > w + 5 || y > h + 5) continue;
      if (pts.length > 3000) c.fillRect(x - sq / 2, y - sq / 2, sq, sq);
      else { c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); }
    }
    c.fillStyle = "#b0172b"; c.strokeStyle = "#ffffff"; c.lineWidth = 1;
    for (const p of pts) {
      if (!classic(p)) continue;
      const [x, y] = X(p.lo, p.la);
      if (x < -5 || y < -5 || x > w + 5 || y > h + 5) continue;
      c.beginPath(); c.arc(x, y, r + 1, 0, 6.2832); c.fill(); c.stroke();
    }
    $("#ex-maphint").textContent = pts.length ? `${pts.length.toLocaleString()} ${pts.length === 1 ? "place" : "places"} · tap a dot` : "No places to show";
  }

  function nearestDot(px, py) {
    let best = null, bd = 14 * 14;
    for (const p of current) {
      if (p.la == null) continue;
      const [x0, y0] = proj(p.lo, p.la), x = x0 * cam.k + cam.x, y = y0 * cam.k + cam.y;
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < bd || (d === bd && classic(p))) { bd = d; best = p; }
    }
    return best;
  }

  function zoomAt(f, px, py) {
    const k = Math.min(Math.max(cam.k * f, 40), 60000);
    const s = k / cam.k;
    cam = { k, x: px - (px - cam.x) * s, y: py - (py - cam.y) * s };
    drawMap();
  }

  function mapEvents() {
    const cv = $("#ex-map");
    const ptrs = new Map();
    let moved = false, pinch0 = null;
    cv.addEventListener("wheel", (e) => { e.preventDefault(); const b = cv.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - b.left, e.clientY - b.top); }, { passive: false });
    cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = false; pinch0 = null; });
    cv.addEventListener("pointermove", (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId);
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const r = cv.getBoundingClientRect();
        if (pinch0) zoomAt(d / pinch0, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
        pinch0 = d; moved = true; return;
      }
      const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      cam.x += dx; cam.y += dy; drawMap();
    });
    const up = (e) => {
      ptrs.delete(e.pointerId);
      if (!moved && ptrs.size === 0) {
        const b = cv.getBoundingClientRect(), p = nearestDot(e.clientX - b.left, e.clientY - b.top);
        if (p) openPlace(p);
      }
      if (ptrs.size < 2) pinch0 = null;
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", (e) => ptrs.delete(e.pointerId));
    $("#ex-zin").onclick = () => zoomAt(1.6, cv.clientWidth / 2, cv.clientHeight / 2);
    $("#ex-zout").onclick = () => zoomAt(0.625, cv.clientWidth / 2, cv.clientHeight / 2);
    window.addEventListener("resize", () => { if (view === "map") drawMap(); });
  }

  function centerOn(pt) {
    const cv = $("#ex-map"), w = cv.clientWidth, h = cv.clientHeight;
    const k = 4000, [x, y] = proj(pt.lo, pt.la);
    cam = { k, x: w / 2 - x * k, y: h / 2 - y * k };
  }

  // ---------------------------------------------------------------- data, URL state, controls
  let SOURCES = [], DETAIL_FILES = [];
  async function fetchJSON(url, opts) { const r = await fetch(url, opts); if (!r.ok) throw new Error(r.status + " " + url); return r.json(); }
  // the build this page's data comes from: the page names it (so a cached core.json from an older build isn't used), core.json confirms it
  const PAGE_VER = ($("#ex-app") && $("#ex-app").dataset.ver) || "";
  let DV = "";
  const vq = (v) => (v ? "?v=" + encodeURIComponent(v) : "");
  // a data file from another build (a cache that outlived a deploy) is fetched once more, then refused: its rows wouldn't line up
  async function fetchCurrent(url, verOf) {
    let d = await fetchJSON(url + vq(DV));
    if (DV && verOf(d) !== DV) d = await fetchJSON(url + vq(DV), { cache: "reload" });
    if (DV && verOf(d) !== DV) throw new Error("another build: " + url);
    return d;
  }
  const DETAIL = new Map(), DETAIL_LOADED = new Set(), DETAIL_FAILED = new Set(), detailPromises = new Map();
  // a county's detail file (phones, websites, notes, alcohol licenses) is fetched only once someone reaches for a place there
  function loadDetail(co) {
    // a county with no extras has no file (null in dfiles): nothing to fetch
    if (!Number.isInteger(co) || co < 0 || co >= DETAIL_FILES.length || !DETAIL_FILES[co]) { DETAIL_LOADED.add(co); return Promise.resolve(); }
    if (!detailPromises.has(co)) {
      detailPromises.set(co, fetchCurrent(`${BASE}/data/detail-${encodeURIComponent(DETAIL_FILES[co])}.json`, (d) => d && d._v).then((d) => {
        if (d && typeof d === "object") for (const k of Object.keys(d)) { const i = Number(k); if (Number.isInteger(i) && d[k] && typeof d[k] === "object") DETAIL.set(i, d[k]); }
      }).catch(() => { DETAIL_FAILED.add(co); /* offline or another build: the panel says so, and asks for a reload */ })
        .finally(() => DETAIL_LOADED.add(co)));
    }
    return detailPromises.get(co);
  }

  // ids.json: one stable id per place, in core order (saved places, #p= links and the panel's history entry use them)
  let idsPromise = null, idsReady = false, idsFailed = false;
  function loadIds() {
    idsPromise ||= fetchCurrent(`${BASE}/data/ids.json`, (d) => d && d.v).then((d) => {
      const ids = d && typeof d.ids === "string" ? d.ids.split(",") : [];   // one comma-separated string: smaller than a JSON array
      if (ids.length !== P.length) throw new Error("ids.json doesn't match core.json");
      ids.forEach((x, i) => { P[i].id = x; });
    }).catch(() => { idsFailed = true; /* offline or another build: saving and links wait for a reload, and the page says so */ })
      .finally(() => { idsReady = true; });
    return idsPromise;
  }

  async function load() {
    let d = await fetchJSON(`${BASE}/data/core.json${vq(PAGE_VER)}`);
    // a core.json with no version predates versioning (a cache that ignored ?v=): its rows would meet this build's ids and county
    // files unchecked, so fetch it once more past the cache, then stop with the reload message rather than mix two builds
    if (PAGE_VER && typeof d.ver !== "string") d = await fetchJSON(`${BASE}/data/core.json${vq(PAGE_VER)}`, { cache: "reload" });
    if (PAGE_VER && typeof d.ver !== "string") throw new Error("core.json from before versioning");
    DV = typeof d.ver === "string" ? d.ver : "";
    GENERATED = d.generated; CAL = d.calibration || {}; SOURCES = d.srcs || []; DETAIL_FILES = d.dfiles || [];
    META = { permits: d.permits_updated };
    const n = d.n, towns = new Map(), C = { ...d.cols };
    for (const [k, pairs] of Object.entries(d.sparse || {})) {   // mostly-empty columns arrive as [[index, value], ...]
      const col = new Array(n).fill(null);
      if (Array.isArray(pairs)) for (const pr of pairs) if (Array.isArray(pr) && Number.isInteger(pr[0]) && pr[0] >= 0 && pr[0] < n) col[pr[0]] = pr[1];
      C[k] = col;
    }
    for (const k of ["n", "c", "ar", "co", "cu", "t", "s", "a", "z", "b", "ch", "g", "hc", "ip", "f", "h", "mi", "dish", "lq", "dla", "dlo", "jb"])
      if (!Array.isArray(C[k]) || C[k].length !== n) C[k] = new Array(n).fill(null);
    P = new Array(n);
    let la = 0, lo = 0;   // coordinates come as steps of 0.0001° from the previous place
    for (let i = 0; i < n; i++) {
      let pla = null, plo = null;
      if (C.dla[i] != null && C.dlo[i] != null) { la += C.dla[i]; lo += C.dlo[i]; pla = la / 10000; plo = lo / 10000; }
      const city = C.c[i] == null ? null : d.cities[C.c[i]], cu = d.cuisines[C.cu[i]], brand = C.b[i] == null ? null : d.brands[C.b[i]];
      const county = C.co[i] == null ? null : d.counties[C.co[i]];
      const p = { i, id: null, n: String(C.n[i] ?? ""), c: city, cu, t: C.t[i], s: C.s[i], a: C.a[i], z: C.z[i], la: pla, lo: plo,
        ch: num(C.ch[i]) || 1, g: C.g[i] || 0, hc: C.hc[i] === 1, ip: C.ip[i], f: num(C.f[i]), h: C.h[i] || 0,
        mi: num(C.mi[i]) || 0, jb: C.jb[i] === 1, dish: C.dish[i], co: C.co[i], county, lq: C.lq[i] === 1, ar: C.ar ? C.ar[i] : null };
      p.search = " " + normalize([p.n, city, p.ar, county, p.z, cu, brand, p.dish].filter(Boolean).join(" ")) + " " + normAddr(p.a || "") + " ";
      p.nameText = " " + normalize([p.n, brand].filter(Boolean).join(" ")) + " ";
      p.key = normalize(p.n);
      P[i] = p;
      if (city) towns.set(city, (towns.get(city) || 0) + 1);
    }
    const byCount = [...towns.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    for (const [name] of byCount) { const k = normAddr(name); if (!own(TOWN_KEYS, k)) TOWN_KEYS[k] = name; }   // biggest town wins a shared spelling
    TOWN_KEYS_BY_LENGTH = Object.keys(TOWN_KEYS).sort((a, b) => b.length - a.length);
    $("#ex-town").innerHTML = '<option value="">All towns</option>' + [...towns.keys()].sort((a, b) => a.localeCompare(b)).map((t) => `<option>${esc(t)}</option>`).join("");
    const cuis = new Map();
    for (const p of P) cuis.set(p.cu, (cuis.get(p.cu) || 0) + 1);
    $("#ex-cuisine").innerHTML = '<option value="">All kinds</option>' + [...cuis.entries()].sort((a, b) => b[1] - a[1]).map(([c, k]) => `<option value="${esc(c)}">${esc(c)} (${esc(k.toLocaleString())})</option>`).join("");
    bibCount = P.filter((p) => !p.v && p.mi === 2).length;
    $("#ex-bibwrap").hidden = !bibCount;
    $("#ex-bibn").textContent = `(${bibCount.toLocaleString()})`;
    if (!bibCount) st.bib = false;
  }

  const guideOk = (g) => own(GUIDES, g);
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    const last = store.get("guide", "steakhouses");
    // a returning visitor gets the guide they used last, unless it's an empty Saved list
    st.g = guideOk(h.get("g")) ? h.get("g") : guideOk(last) && !(last === "saved" && !saved.size) ? last : "steakhouses";
    st.q = h.get("q") || ""; st.town = h.get("town") || ""; st.cuisine = h.get("kind") || ""; st.chains = h.get("chains") === "1"; st.bib = h.get("bib") === "1";
    st.sort = h.get("sort") || ""; st.p = h.get("p") || "";
  }
  function hashOf(withPlace) {
    const h = new URLSearchParams();
    h.set("g", st.g);
    if (st.q) h.set("q", st.q); if (st.town) h.set("town", st.town); if (st.cuisine) h.set("kind", st.cuisine);
    if (st.chains) h.set("chains", "1"); if (st.bib) h.set("bib", "1"); if (st.sort) h.set("sort", st.sort); if (withPlace && st.p) h.set("p", st.p);
    return "#" + h.toString();
  }
  const listHash = () => hashOf(false);
  // filter changes replace the current history entry; opening a place pushes one, so Back closes the panel
  function saveHash(push = false) {
    const url = hashOf(true);
    if (push) history.pushState({ mteats: "place" }, "", url);
    else history.replaceState(st.p ? { mteats: "place" } : null, "", url);
    store.set("guide", st.g);
  }

  // a coarse Montana outline (MontanaEats/Services/LocationService.swift's MontanaOutline): a bounding box would count the neighbours' border towns
  const MT_RINGS = [[[-114.77, 46.735], [-114.765, 46.758], [-114.773, 46.762], [-114.774, 46.766], [-114.783, 46.769], [-114.787, 46.783], [-114.799, 46.776], [-114.808, 46.783], [-114.829, 46.783], [-114.836, 46.793], [-114.857, 46.802], [-114.861, 46.812], [-114.866, 46.815], [-114.887, 46.81], [-114.895, 46.802], [-114.898, 46.809], [-114.894, 46.817], [-114.898, 46.823], [-114.921, 46.828], [-114.928, 46.835], [-114.928, 46.843], [-114.923, 46.848], [-114.928, 46.855], [-114.948, 46.86], [-114.944, 46.867], [-114.931, 46.877], [-114.936, 46.897], [-114.929, 46.909], [-114.921, 46.912], [-114.925, 46.919], [-114.935, 46.92], [-114.96, 46.93], [-114.958, 46.934], [-114.964, 46.938], [-114.971, 46.939], [-114.986, 46.95], [-114.985, 46.954], [-114.999, 46.966], [-115.001, 46.972], [-115.029, 46.976], [-115.031, 46.972], [-115.048, 46.97], [-115.051, 46.975], [-115.05, 46.981], [-115.067, 46.995], [-115.065, 47.0], [-115.072, 47.013], [-115.069, 47.015], [-115.071, 47.027], [-115.079, 47.029], [-115.081, 47.038], [-115.088, 47.041], [-115.087, 47.046], [-115.106, 47.049], [-115.122, 47.066], [-115.131, 47.069], [-115.139, 47.08], [-115.142, 47.091], [-115.14, 47.097], [-115.144, 47.102], [-115.16, 47.103], [-115.171, 47.107], [-115.179, 47.121], [-115.186, 47.125], [-115.186, 47.13], [-115.199, 47.14], [-115.212, 47.142], [-115.222, 47.149], [-115.244, 47.152], [-115.255, 47.164], [-115.256, 47.175], [-115.262, 47.182], [-115.287, 47.184], [-115.3, 47.189], [-115.299, 47.199], [-115.291, 47.211], [-115.298, 47.226], [-115.315, 47.233], [-115.324, 47.245], [-115.318, 47.252], [-115.319, 47.257], [-115.34, 47.263], [-115.359, 47.26], [-115.385, 47.268], [-115.411, 47.265], [-115.421, 47.272], [-115.42, 47.278], [-115.426, 47.281], [-115.456, 47.278], [-115.457, 47.283], [-115.466, 47.288], [-115.482, 47.282], [-115.491, 47.29], [-115.528, 47.3], [-115.527, 47.309], [-115.54, 47.325], [-115.538, 47.329], [-115.55, 47.335], [-115.55, 47.35], [-115.557, 47.354], [-115.564, 47.353], [-115.575, 47.356], [-115.577, 47.368], [-115.595, 47.372], [-115.602, 47.378], [-115.617, 47.383], [-115.643, 47.378], [-115.648, 47.383], [-115.646, 47.388], [-115.655, 47.395], [-115.657, 47.401], [-115.677, 47.403], [-115.675, 47.41], [-115.692, 47.416], [-115.712, 47.416], [-115.72, 47.421], [-115.721, 47.426], [-115.759, 47.424], [-115.747, 47.442], [-115.734, 47.444], [-115.716, 47.452], [-115.702, 47.452], [-115.691, 47.457], [-115.676, 47.453], [-115.646, 47.456], [-115.637, 47.463], [-115.629, 47.48], [-115.635, 47.482], [-115.66, 47.478], [-115.668, 47.489], [-115.686, 47.485], [-115.69, 47.501], [-115.698, 47.503], [-115.711, 47.517], [-115.711, 47.523], [-115.695, 47.527], [-115.698, 47.532], [-115.706, 47.535], [-115.711, 47.533], [-115.725, 47.535], [-115.736, 47.54], [-115.742, 47.539], [-115.751, 47.542], [-115.755, 47.548], [-115.754, 47.552], [-115.74, 47.563], [-115.723, 47.57], [-115.721, 47.576], [-115.706, 47.577], [-115.704, 47.585], [-115.687, 47.595], [-115.698, 47.607], [-115.698, 47.612], [-115.691, 47.617], [-115.694, 47.624], [-115.707, 47.635], [-115.73, 47.642], [-115.736, 47.654], [-115.731, 47.662], [-115.732, 47.668], [-115.726, 47.673], [-115.728, 47.682], [-115.722, 47.695], [-115.731, 47.705], [-115.753, 47.717], [-115.759, 47.72], [-115.773, 47.718], [-115.777, 47.721], [-115.784, 47.73], [-115.781, 47.743], [-115.797, 47.758], [-115.805, 47.759], [-115.825, 47.753], [-115.831, 47.755], [-115.835, 47.762], [-115.837, 47.775], [-115.847, 47.785], [-115.845, 47.794], [-115.848, 47.81], [-115.845, 47.815], [-115.852, 47.828], [-115.87, 47.835], [-115.881, 47.85], [-115.901, 47.844], [-115.909, 47.853], [-115.918, 47.854], [-115.925, 47.867], [-115.935, 47.874], [-115.938, 47.881], [-115.954, 47.895], [-115.968, 47.9], [-115.967, 47.913], [-115.982, 47.916], [-115.984, 47.923], [-115.993, 47.926], [-115.998, 47.939], [-116.006, 47.944], [-116.007, 47.951], [-116.018, 47.963], [-116.03, 47.973], [-116.038, 47.972], [-116.049, 47.977], [-116.049, 49.0], [-111.576, 48.996], [-109.421, 49.0], [-104.049, 48.999], [-104.049, 48.5], [-104.042, 47.862], [-104.046, 47.343], [-104.047, 46.0], [-104.043, 45.75], [-104.04, 44.998], [-105.913, 45.001], [-105.928, 44.994], [-106.264, 44.994], [-107.055, 44.997], [-107.133, 45.0], [-107.441, 45.002], [-109.082, 45.0], [-109.103, 45.006], [-110.111, 45.004], [-110.198, 44.997], [-110.366, 45.001], [-110.406, 44.995], [-110.704, 44.993], [-110.786, 45.001], [-111.055, 45.001], [-111.053, 44.477], [-111.101, 44.488], [-111.107, 44.487], [-111.115, 44.494], [-111.127, 44.498], [-111.138, 44.517], [-111.131, 44.533], [-111.141, 44.536], [-111.15, 44.535], [-111.159, 44.547], [-111.178, 44.553], [-111.181, 44.57], [-111.201, 44.576], [-111.227, 44.577], [-111.231, 44.585], [-111.231, 44.597], [-111.24, 44.614], [-111.219, 44.623], [-111.242, 44.644], [-111.249, 44.645], [-111.252, 44.652], [-111.27, 44.647], [-111.278, 44.652], [-111.28, 44.655], [-111.267, 44.664], [-111.266, 44.668], [-111.275, 44.675], [-111.279, 44.683], [-111.296, 44.692], [-111.296, 44.702], [-111.322, 44.719], [-111.323, 44.729], [-111.337, 44.734], [-111.348, 44.726], [-111.353, 44.727], [-111.366, 44.738], [-111.366, 44.743], [-111.374, 44.751], [-111.385, 44.755], [-111.393, 44.753], [-111.398, 44.747], [-111.395, 44.744], [-111.4, 44.734], [-111.398, 44.724], [-111.415, 44.711], [-111.424, 44.714], [-111.429, 44.721], [-111.439, 44.721], [-111.489, 44.706], [-111.49, 44.699], [-111.483, 44.692], [-111.485, 44.687], [-111.469, 44.679], [-111.477, 44.674], [-111.473, 44.666], [-111.488, 44.654], [-111.492, 44.644], [-111.501, 44.65], [-111.505, 44.645], [-111.517, 44.644], [-111.517, 44.641], [-111.503, 44.627], [-111.517, 44.621], [-111.523, 44.614], [-111.521, 44.612], [-111.526, 44.604], [-111.52, 44.602], [-111.525, 44.598], [-111.524, 44.592], [-111.518, 44.582], [-111.502, 44.572], [-111.51, 44.567], [-111.508, 44.562], [-111.492, 44.56], [-111.479, 44.553], [-111.47, 44.557], [-111.468, 44.544], [-111.465, 44.542], [-111.468, 44.54], [-111.499, 44.543], [-111.513, 44.537], [-111.523, 44.548], [-111.539, 44.552], [-111.547, 44.558], [-111.563, 44.556], [-111.586, 44.563], [-111.614, 44.549], [-111.647, 44.555], [-111.659, 44.553], [-111.683, 44.562], [-111.69, 44.557], [-111.703, 44.561], [-111.716, 44.544], [-111.738, 44.544], [-111.75, 44.54], [-111.759, 44.534], [-111.763, 44.526], [-111.771, 44.531], [-111.78, 44.524], [-111.801, 44.526], [-111.809, 44.52], [-111.808, 44.511], [-111.821, 44.509], [-111.831, 44.517], [-111.83, 44.52], [-111.842, 44.527], [-111.857, 44.549], [-111.863, 44.552], [-111.869, 44.567], [-111.871, 44.564], [-111.88, 44.561], [-111.892, 44.564], [-111.896, 44.56], [-111.903, 44.557], [-111.948, 44.557], [-111.952, 44.55], [-111.961, 44.55], [-111.963, 44.545], [-111.968, 44.545], [-111.972, 44.538], [-111.978, 44.536], [-111.992, 44.538], [-111.995, 44.536], [-112.011, 44.544], [-112.017, 44.543], [-112.033, 44.547], [-112.036, 44.542], [-112.033, 44.529], [-112.038, 44.533], [-112.069, 44.538], [-112.093, 44.53], [-112.097, 44.523], [-112.106, 44.521], [-112.109, 44.525], [-112.127, 44.529], [-112.129, 44.536], [-112.137, 44.54], [-112.149, 44.537], [-112.165, 44.542], [-112.18, 44.533], [-112.221, 44.544], [-112.229, 44.55], [-112.227, 44.555], [-112.231, 44.559], [-112.229, 44.564], [-112.244, 44.569], [-112.251, 44.568], [-112.257, 44.572], [-112.268, 44.566], [-112.287, 44.569], [-112.293, 44.562], [-112.305, 44.56], [-112.314, 44.553], [-112.315, 44.542], [-112.32, 44.539], [-112.353, 44.538], [-112.359, 44.529], [-112.357, 44.525], [-112.359, 44.485], [-112.365, 44.48], [-112.367, 44.467], [-112.387, 44.448], [-112.407, 44.458], [-112.416, 44.454], [-112.434, 44.455], [-112.433, 44.46], [-112.441, 44.467], [-112.455, 44.467], [-112.455, 44.471], [-112.46, 44.476], [-112.473, 44.48], [-112.484, 44.475], [-112.485, 44.471], [-112.497, 44.468], [-112.501, 44.463], [-112.511, 44.467], [-112.514, 44.476], [-112.536, 44.479], [-112.542, 44.484], [-112.578, 44.481], [-112.602, 44.491], [-112.625, 44.484], [-112.629, 44.483], [-112.629, 44.489], [-112.633, 44.492], [-112.662, 44.486], [-112.672, 44.492], [-112.685, 44.493], [-112.693, 44.5], [-112.718, 44.505], [-112.735, 44.5], [-112.743, 44.489], [-112.75, 44.491], [-112.772, 44.484], [-112.781, 44.485], [-112.788, 44.474], [-112.798, 44.467], [-112.798, 44.461], [-112.808, 44.454], [-112.814, 44.454], [-112.819, 44.447], [-112.827, 44.444], [-112.828, 44.432], [-112.84, 44.425], [-112.822, 44.407], [-112.82, 44.4], [-112.812, 44.398], [-112.816, 44.395], [-112.813, 44.392], [-112.813, 44.377], [-112.846, 44.358], [-112.855, 44.361], [-112.864, 44.37], [-112.873, 44.373], [-112.875, 44.378], [-112.881, 44.38], [-112.885, 44.396], [-112.883, 44.401], [-112.889, 44.406], [-112.902, 44.399], [-112.914, 44.403], [-112.921, 44.411], [-112.945, 44.415], [-112.951, 44.418], [-112.952, 44.425], [-112.963, 44.424], [-112.971, 44.428], [-112.989, 44.444], [-113.003, 44.452], [-113.008, 44.464], [-113.006, 44.471], [-113.02, 44.484], [-113.026, 44.495], [-113.016, 44.504], [-113.016, 44.516], [-113.005, 44.52], [-113.006, 44.526], [-113.026, 44.539], [-113.033, 44.538], [-113.045, 44.545], [-113.046, 44.553], [-113.036, 44.56], [-113.037, 44.565], [-113.067, 44.579], [-113.062, 44.587], [-113.087, 44.6], [-113.072, 44.615], [-113.058, 44.618], [-113.053, 44.621], [-113.049, 44.629], [-113.05, 44.635], [-113.065, 44.649], [-113.064, 44.653], [-113.068, 44.658], [-113.069, 44.669], [-113.067, 44.679], [-113.081, 44.683], [-113.079, 44.688], [-113.082, 44.692], [-113.097, 44.699], [-113.101, 44.707], [-113.099, 44.718], [-113.101, 44.73], [-113.117, 44.733], [-113.116, 44.74], [-113.12, 44.746], [-113.134, 44.753], [-113.137, 44.76], [-113.131, 44.765], [-113.131, 44.773], [-113.158, 44.781], [-113.164, 44.779], [-113.179, 44.788], [-113.193, 44.802], [-113.203, 44.804], [-113.209, 44.81], [-113.238, 44.815], [-113.247, 44.823], [-113.28, 44.813], [-113.299, 44.803], [-113.302, 44.8], [-113.341, 44.785], [-113.354, 44.792], [-113.354, 44.795], [-113.346, 44.801], [-113.356, 44.82], [-113.376, 44.831], [-113.377, 44.836], [-113.409, 44.841], [-113.422, 44.838], [-113.429, 44.855], [-113.439, 44.856], [-113.443, 44.862], [-113.455, 44.866], [-113.457, 44.876], [-113.462, 44.882], [-113.461, 44.887], [-113.478, 44.896], [-113.471, 44.91], [-113.49, 44.923], [-113.498, 44.942], [-113.495, 44.948], [-113.487, 44.946], [-113.481, 44.95], [-113.466, 44.947], [-113.461, 44.952], [-113.449, 44.953], [-113.443, 44.959], [-113.449, 44.97], [-113.444, 44.973], [-113.446, 44.998], [-113.437, 45.007], [-113.448, 45.02], [-113.446, 45.034], [-113.455, 45.04], [-113.449, 45.046], [-113.452, 45.059], [-113.46, 45.065], [-113.474, 45.062], [-113.485, 45.064], [-113.489, 45.077], [-113.514, 45.085], [-113.522, 45.092], [-113.506, 45.108], [-113.511, 45.117], [-113.549, 45.113], [-113.554, 45.119], [-113.569, 45.125], [-113.576, 45.131], [-113.567, 45.143], [-113.565, 45.15], [-113.58, 45.149], [-113.583, 45.154], [-113.59, 45.156], [-113.594, 45.166], [-113.589, 45.177], [-113.592, 45.185], [-113.597, 45.187], [-113.599, 45.193], [-113.604, 45.193], [-113.636, 45.212], [-113.636, 45.217], [-113.647, 45.226], [-113.649, 45.234], [-113.655, 45.24], [-113.667, 45.247], [-113.679, 45.25], [-113.691, 45.263], [-113.691, 45.272], [-113.68, 45.274], [-113.68, 45.279], [-113.7, 45.293], [-113.703, 45.3], [-113.71, 45.301], [-113.718, 45.317], [-113.728, 45.32], [-113.738, 45.33], [-113.74, 45.345], [-113.729, 45.356], [-113.738, 45.368], [-113.732, 45.373], [-113.733, 45.391], [-113.749, 45.403], [-113.776, 45.409], [-113.777, 45.416], [-113.763, 45.423], [-113.759, 45.427], [-113.776, 45.434], [-113.774, 45.447], [-113.784, 45.455], [-113.774, 45.463], [-113.776, 45.471], [-113.759, 45.48], [-113.764, 45.499], [-113.772, 45.513], [-113.766, 45.521], [-113.797, 45.524], [-113.81, 45.52], [-113.82, 45.524], [-113.834, 45.521], [-113.827, 45.533], [-113.829, 45.538], [-113.817, 45.557], [-113.82, 45.566], [-113.807, 45.578], [-113.796, 45.581], [-113.806, 45.602], [-113.824, 45.613], [-113.839, 45.611], [-113.848, 45.621], [-113.861, 45.624], [-113.886, 45.618], [-113.904, 45.622], [-113.899, 45.628], [-113.902, 45.637], [-113.895, 45.644], [-113.903, 45.652], [-113.919, 45.658], [-113.92, 45.664], [-113.931, 45.672], [-113.935, 45.695], [-113.939, 45.696], [-113.965, 45.691], [-113.969, 45.693], [-113.97, 45.703], [-113.98, 45.703], [-113.989, 45.706], [-113.994, 45.704], [-113.997, 45.697], [-114.008, 45.694], [-114.016, 45.696], [-114.02, 45.693], [-114.015, 45.684], [-114.029, 45.675], [-114.016, 45.664], [-114.016, 45.653], [-114.019, 45.649], [-114.035, 45.648], [-114.046, 45.637], [-114.067, 45.629], [-114.074, 45.615], [-114.082, 45.611], [-114.083, 45.597], [-114.086, 45.592], [-114.101, 45.587], [-114.121, 45.585], [-114.131, 45.576], [-114.133, 45.572], [-114.13, 45.566], [-114.136, 45.558], [-114.15, 45.558], [-114.154, 45.553], [-114.18, 45.552], [-114.194, 45.537], [-114.205, 45.536], [-114.228, 45.547], [-114.249, 45.546], [-114.252, 45.537], [-114.248, 45.525], [-114.259, 45.511], [-114.261, 45.497], [-114.27, 45.491], [-114.271, 45.485], [-114.28, 45.48], [-114.295, 45.48], [-114.304, 45.472], [-114.325, 45.466], [-114.33, 45.46], [-114.345, 45.461], [-114.351, 45.471], [-114.361, 45.475], [-114.36, 45.478], [-114.367, 45.492], [-114.389, 45.503], [-114.425, 45.511], [-114.43, 45.53], [-114.437, 45.531], [-114.44, 45.537], [-114.449, 45.539], [-114.45, 45.543], [-114.463, 45.545], [-114.462, 45.554], [-114.456, 45.563], [-114.466, 45.561], [-114.472, 45.566], [-114.498, 45.556], [-114.516, 45.568], [-114.527, 45.571], [-114.553, 45.558], [-114.565, 45.558], [-114.565, 45.562], [-114.558, 45.566], [-114.552, 45.576], [-114.558, 45.585], [-114.547, 45.599], [-114.537, 45.607], [-114.544, 45.617], [-114.554, 45.62], [-114.563, 45.637], [-114.552, 45.642], [-114.542, 45.641], [-114.539, 45.65], [-114.529, 45.652], [-114.522, 45.649], [-114.507, 45.657], [-114.499, 45.669], [-114.502, 45.674], [-114.499, 45.679], [-114.501, 45.683], [-114.514, 45.685], [-114.501, 45.693], [-114.495, 45.704], [-114.504, 45.722], [-114.515, 45.728], [-114.526, 45.728], [-114.535, 45.739], [-114.547, 45.744], [-114.544, 45.759], [-114.557, 45.765], [-114.566, 45.773], [-114.555, 45.786], [-114.544, 45.79], [-114.544, 45.798], [-114.531, 45.81], [-114.531, 45.818], [-114.511, 45.829], [-114.517, 45.835], [-114.509, 45.845], [-114.503, 45.846], [-114.499, 45.85], [-114.487, 45.851], [-114.475, 45.846], [-114.47, 45.851], [-114.438, 45.862], [-114.41, 45.851], [-114.405, 45.87], [-114.396, 45.871], [-114.387, 45.884], [-114.387, 45.89], [-114.393, 45.893], [-114.395, 45.902], [-114.404, 45.904], [-114.413, 45.912], [-114.414, 45.922], [-114.431, 45.936], [-114.402, 45.958], [-114.401, 45.964], [-114.41, 45.973], [-114.411, 45.978], [-114.429, 45.987], [-114.448, 45.988], [-114.458, 45.998], [-114.48, 45.993], [-114.487, 46.004], [-114.473, 46.014], [-114.48, 46.031], [-114.497, 46.028], [-114.507, 46.032], [-114.506, 46.038], [-114.497, 46.042], [-114.493, 46.052], [-114.479, 46.055], [-114.468, 46.063], [-114.467, 46.066], [-114.472, 46.069], [-114.472, 46.077], [-114.462, 46.078], [-114.46, 46.098], [-114.471, 46.106], [-114.474, 46.114], [-114.488, 46.114], [-114.521, 46.125], [-114.517, 46.136], [-114.527, 46.146], [-114.514, 46.154], [-114.515, 46.167], [-114.507, 46.164], [-114.489, 46.167], [-114.476, 46.16], [-114.458, 46.17], [-114.444, 46.169], [-114.443, 46.203], [-114.451, 46.215], [-114.445, 46.22], [-114.447, 46.232], [-114.452, 46.242], [-114.468, 46.249], [-114.464, 46.252], [-114.47, 46.266], [-114.465, 46.273], [-114.454, 46.27], [-114.441, 46.273], [-114.432, 46.278], [-114.425, 46.288], [-114.433, 46.306], [-114.421, 46.33], [-114.414, 46.335], [-114.41, 46.361], [-114.41, 46.366], [-114.422, 46.387], [-114.41, 46.396], [-114.408, 46.4], [-114.401, 46.401], [-114.393, 46.409], [-114.385, 46.411], [-114.383, 46.432], [-114.368, 46.437], [-114.372, 46.443], [-114.384, 46.447], [-114.379, 46.46], [-114.383, 46.467], [-114.394, 46.47], [-114.4, 46.478], [-114.403, 46.499], [-114.384, 46.505], [-114.376, 46.501], [-114.358, 46.505], [-114.348, 46.51], [-114.342, 46.518], [-114.349, 46.53], [-114.343, 46.541], [-114.347, 46.552], [-114.342, 46.555], [-114.329, 46.576], [-114.343, 46.59], [-114.332, 46.596], [-114.329, 46.604], [-114.322, 46.611], [-114.327, 46.62], [-114.322, 46.626], [-114.32, 46.647], [-114.333, 46.661], [-114.353, 46.664], [-114.358, 46.672], [-114.378, 46.668], [-114.384, 46.663], [-114.395, 46.665], [-114.404, 46.66], [-114.41, 46.663], [-114.412, 46.657], [-114.425, 46.661], [-114.454, 46.65], [-114.453, 46.642], [-114.467, 46.632], [-114.487, 46.634], [-114.501, 46.642], [-114.524, 46.641], [-114.542, 46.65], [-114.547, 46.645], [-114.563, 46.641], [-114.571, 46.644], [-114.583, 46.634], [-114.589, 46.636], [-114.594, 46.633], [-114.613, 46.639], [-114.616, 46.644], [-114.611, 46.647], [-114.614, 46.655], [-114.635, 46.66], [-114.639, 46.666], [-114.633, 46.672], [-114.642, 46.673], [-114.641, 46.679], [-114.623, 46.691], [-114.62, 46.707], [-114.639, 46.722], [-114.644, 46.723], [-114.648, 46.733], [-114.665, 46.74], [-114.689, 46.737], [-114.699, 46.741], [-114.701, 46.734], [-114.709, 46.727], [-114.708, 46.724], [-114.713, 46.716], [-114.74, 46.712], [-114.749, 46.699], [-114.767, 46.697], [-114.768, 46.705], [-114.781, 46.707], [-114.788, 46.714], [-114.782, 46.719], [-114.782, 46.726]]];
  function inRing(ring, la, lo) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > la) !== (yj > la) && lo < (xj - xi) * (la - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const inMontana = (la, lo) => MT_RINGS.some((r) => inRing(r, la, lo));

  function locate() {
    if (!navigator.geolocation) { $("#ex-locmsg").textContent = "This browser can't share its location."; return; }
    $("#ex-locmsg").textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition((pos) => {
      here = { la: pos.coords.latitude, lo: pos.coords.longitude };
      const inGA = inMontana(here.la, here.lo);
      $("#ex-locmsg").textContent = inGA ? "Sorted by distance from you. Your location stays in this browser." : "You're outside Montana: distances are from where you are. Your location stays in this browser.";
      st.sort = GUIDES[st.g].sorts.includes("nearest") ? "nearest" : st.sort;
      if (view === "map" && inGA) centerOn(here);
      shown = 100; render();
    }, (err) => {
      $("#ex-locmsg").textContent = err && err.code === 1 ? "Location is off for this site. Allow it in your browser settings to sort by distance."
        : "Couldn't get a location fix just now. Tap Near me to try again.";
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });   // a fresh fix on every tap, never one from minutes ago
  }

  function setView(v) {
    view = v;
    document.querySelectorAll(".ex-view button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
    $("#ex-listwrap").hidden = v !== "list";
    $("#ex-mapwrap").hidden = v !== "map";
    render();
    // the map often starts below the fold (on phones, and on laptop-height screens): bring it into view
    if (v === "map" && $("#ex-mapwrap").getBoundingClientRect().top > innerHeight * 0.5) $("#ex-mapwrap").scrollIntoView({ block: "nearest" });
  }

  // the URL moved under us: Back/Forward (popstate) or a link to another #hash (hashchange). Both can fire for one step.
  function fromURL() {
    const before = listHash();
    readHash();
    if (listHash() !== before) { syncInputs(); shown = 100; render(); }
    if (st.p && !idsReady) { loadIds().then(fromURL); return; }
    const p = st.p && P.find((x) => x.id === st.p);
    const panel = $("#ex-panel");
    if (p) {
      if (panel.hidden || panel.dataset.id !== p.id) {
        openPlace(p, false);
        // Forward to a place opened earlier: its entry was pushed after the list's, so closing it steps back, as after a tap
        if (history.state && history.state.mteats === "place") { listAtPush = listHash(); panel.dataset.pushed = "1"; }
      }
    }
    else { if (!panel.hidden) closePlace(true); linkMissing(); }
  }

  // a #p= link whose place isn't here: ids.json didn't load, or the place has left the list since the link was made
  function linkMissing() {
    if (!st.p) return;
    $("#ex-locmsg").textContent = idsFailed ? "The place in this link couldn't load: you may be offline, or the site was just updated. Reload the page to try again."
      : "The place in this link isn't on the list anymore (it may have closed or moved).";
  }

  function controls() {
    document.querySelectorAll(".ex-guides button").forEach((b) => b.onclick = () => { if (guideOk(b.dataset.g)) st.g = b.dataset.g; st.sort = ""; shown = 100; render(); });
    let t = null;
    $("#ex-q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; shown = 100; render(); }, 120); });
    $("#ex-sort").onchange = (e) => { st.sort = e.target.value; if (st.sort === "nearest" && !here) locate(); shown = 100; render(); };
    $("#ex-town").onchange = (e) => { st.town = e.target.value; shown = 100; render(); };
    $("#ex-cuisine").onchange = (e) => { st.cuisine = e.target.value; shown = 100; render(); };
    $("#ex-chains").onchange = (e) => { st.chains = e.target.checked; shown = 100; render(); };
    $("#ex-bib").onchange = (e) => { st.bib = e.target.checked; shown = 100; render(); };
    $("#ex-clear").onclick = () => { st.town = st.cuisine = ""; st.chains = st.bib = false; syncInputs(); shown = 100; render(); };
    $("#ex-locate").onclick = locate;
    $("#ex-more").onclick = () => { shown += 200; renderList(order()); };
    document.querySelectorAll(".ex-view button").forEach((b) => b.onclick = () => setView(b.dataset.v));
    $("#ex-list").addEventListener("click", (e) => { const b = e.target.closest(".ex-row"); if (b && P[+b.dataset.i]) openPlace(P[+b.dataset.i]); });
    // warm the region file of the row under the pointer (or keyboard focus), so the panel opens with its details
    for (const ev of ["pointerover", "focusin"]) $("#ex-list").addEventListener(ev, (e) => { const b = e.target.closest && e.target.closest(".ex-row"); if (b && P[+b.dataset.i]) { loadIds(); loadDetail(P[+b.dataset.i].co); } });
    // the ids (a few hundred KB) wait for the first sign of use, so a visit that only looks doesn't download them
    const WARM = ["pointerdown", "keydown", "wheel", "scroll", "touchstart"];
    const warmIds = () => { WARM.forEach((ev) => removeEventListener(ev, warmIds, true)); loadIds(); };
    WARM.forEach((ev) => addEventListener(ev, warmIds, { capture: true, passive: true }));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#ex-panel").hidden) closePlace(); });
    window.addEventListener("popstate", fromURL);
    window.addEventListener("hashchange", fromURL);
    $("#ex-backdrop").addEventListener("click", () => { if (st.p || !$("#ex-panel").hidden) closePlace(); });
    mapEvents();
  }
  function syncInputs() {
    $("#ex-q").value = st.q; $("#ex-town").value = st.town; $("#ex-cuisine").value = st.cuisine; $("#ex-chains").checked = st.chains; $("#ex-bib").checked = st.bib;
  }

  (async () => {
    $("#ex-loading").hidden = false;   // hidden in the HTML, so a browser without JavaScript shows only the <noscript> note
    readHash();
    try { await load(); } catch (e) { $("#ex-loading").textContent = "The restaurant list couldn't load. Refresh to try again."; return; }
    syncInputs(); controls();
    $("#ex-app").hidden = false;
    $("#ex-loading").hidden = true;
    render();
    if (st.p) {
      await loadIds();
      const open = P.find((p) => p.id === st.p);
      if (open) { await loadDetail(open.co); openPlace(open, false); }
      else linkMissing();
    }
  })();
})();
