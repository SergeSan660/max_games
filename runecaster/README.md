# Rune//Caster

Current imported baseline: **v0.9.1**, with live compatibility patch **v0.9.2**.

Rune//Caster is a browser game where a wizard programs custom spells, discovers spell APIs as magical artifacts, equips five spells for combat, and experiments with deliberately chaotic combinations.

## Playable file

Serve the repository over HTTP and open either:

- `/runecaster/`
- `/runecaster/play.html`

`play.html` is the explicit playable entry point. Both entries reconstruct the byte-preserved v0.9.1 game and then load `patches/v0.9.2.js`.

For example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/runecaster/play.html`.

## v0.9.2 fixes

- enemy movement now uses grid-based A* pathfinding around dungeon and arena walls
- diagonal navigation cannot cut through wall corners
- enemies periodically re-plan when the player moves or when they appear stuck
- focus/tab changes clear held keys so movement does not remain stuck
- runtime faults are surfaced visibly instead of silently producing a frozen/blank game
- the imported v0.9.1 snapshot remains unchanged as a regression baseline

## Verify

```bash
python runecaster/verify_snapshot.py
node --check runecaster/patches/v0.9.2.js
```

CI verifies the unchanged snapshot, the playable entry points, patch injection, JavaScript syntax, and pathfinding markers.

## Current mechanics

- top-down wizard combat
- programmable spell Workshop
- Simple and Full Code modes
- always-visible coding reference/examples
- artifact-driven spell API discovery
- mana-priced spell complexity and mana boosters
- explosions, chain explosions, chained impact effects, shields and force fields
- rays, cones, novas and elemental projectile visuals
- campaign arenas and Arcane Archdruid progression
- local two-player versus
- free-range Spell Lab
- A* enemy navigation

## Migration rule

The GitHub repository is the canonical development source. Changes should land here first rather than creating separate authoritative ZIP/HTML builds.
