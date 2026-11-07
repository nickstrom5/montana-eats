# Treasure State Eats: name, icon and palette (final: Nick's decisions, 2026-11-07)

Final (Nick, 2026-11-07, "Yes, as proposed" on the 17-state review): the name and App Store subtitle as in
`playbook/app-store/listing.json`, icon concept B, the ribeye, and the palette as built (below).

## Name
- **Treasure State Eats** (App Store name "Treasure State Eats: Montana", 28 characters; Home Screen "Treasure State Eats", 19, which may
  truncate under the icon on smaller iPhones). "The Treasure State" is Montana's official nickname, and the family's names follow the
  nicknames (Bay State, Granite State, Cowboy State). The prompt found treasurestateeats.com unregistered (9/27/2026); Nick approved
  the name on 2026-11-07; no USPTO search was run.
- Alternatives from the prompt: **Montana Eats** (no App Store app by that name; montanaeats.com registered in 2022) and **Big Sky Eats**
  (bigskyeats.com taken; Big Sky is also a resort town).
- Avoided: the Made in Montana and Grown in Montana logos (Department of Commerce trademarks), "Big Sky Country" and "The Last Best
  Place" (to check on USPTO), the state seal and flag, Grizzlies and Bobcats names and marks.
- Bundle id `com.montanaeats.ios`; site nickstrom5.github.io/montana-eats/ until a `montana.eatsranked.com` record exists.

## Icon (state-prompts/ICON-STYLE.md)
- **B, Nick's choice (2026-11-07): a ribeye with its fat cap and grill marks**, top view, on Glacier teal. Passes check.swift; reads as a steak
  at 60 px, and ties to the steakhouse and supper club guide.
- A: a huckleberry milkshake in a soda glass. Passes, but at 60 px it echoes Wyoming Eats' soda-fountain shake (strip60 comparison).
- C: a Butte pasty (a crimped half-moon), on Butte copper. Passes; distinct, but Butte's pasties have no guide yet (a lead).
Drawn by `scripts/icon-concepts.swift` (PNGs in `playbook/brand/`); `scripts/make-brand.swift` makes the app icon, site icons and
docs/og.png from B.

## Palette (the prompt's landscape option; no team colors)
Yogo sapphire #23408E (8.6:1 on cream) for titles and tint; Butte copper #A0522D (white on it 5.8:1) for the hand-checked guide cards;
Glacier teal #0B6E75 (white on it 6.0:1) for honors chips, focus rings and the icon; bitterroot pink #E8A3B5 (the state flower) only as a
fill under sapphire text; cream #F7F3EA pages. Header band: the Rocky Mountain Front, peaks falling to the plains, in sapphire over a
copper baseline.
