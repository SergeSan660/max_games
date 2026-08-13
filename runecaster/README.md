# Rune//Caster

Current imported baseline: **v0.9.1**, with live compatibility patch **v0.9.3**.

Rune//Caster is a browser game where a wizard programs custom spells, discovers spell APIs as magical artifacts, equips five spells for combat, and experiments with deliberately chaotic combinations.

## Playable file

Serve the repository over HTTP and open either:

- `/runecaster/`
- `/runecaster/play.html`

`play.html` is the explicit playable entry point. Both entries reconstruct the byte-preserved v0.9.1 game and then load `patches/v0.9.3.js`.

For example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/runecaster/play.html`.

## v0.9.3 logical pathfinding

- enemies pursue the player directly when there is a collision-safe line of sight
- A* is used when walls actually require route planning
- generated A* routes are line-of-sight smoothed so enemies do not zig-zag through every grid-cell center
- enemies opportunistically skip obsolete waypoints as soon as a later waypoint becomes reachable
- replanning timing is deterministic rather than randomly jittered
- stuck enemies force an early replan
- unreachable targets fall back to the nearest reachable search cell instead of blindly pushing toward the player through walls
- diagonal navigation still cannot cut through wall corners
- focus/tab changes still clear held keys and runtime faults remain visible
- the imported v0.9.1 snapshot remains unchanged as a regression baseline

## Verify

```bash
python runecaster/verify_snapshot.py
node --check runecaster/patches/v0.9.3.js
```

CI verifies the unchanged snapshot, the playable entry points, patch injection, JavaScript syntax, and logical-pathfinding markers.

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
- logical line-of-sight + A* enemy navigation

## Migration rule

The GitHub repository is the canonical development source. Changes should land here first rather than creating separate authoritative ZIP/HTML builds.
