# Rune//Caster

Current imported baseline: **v0.9.1**.

Rune//Caster is a browser game where a wizard programs custom spells, discovers spell APIs as magical artifacts, equips five spells for combat, and experiments with deliberately chaotic combinations.

## Run locally

Serve the repository over HTTP and open `/runecaster/`.

For example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/runecaster/`.

The current baseline is preserved as a compressed static snapshot so migration cannot alter gameplay. `runecaster/index.html` reconstructs the snapshot in the browser. Future work should first keep this baseline green, then progressively extract the spell compiler/runtime, game loop, rendering, arenas and multiplayer into maintainable source modules.

## Verify

```bash
python runecaster/verify_snapshot.py
```

The verifier checks the reconstructed game byte-for-byte against the imported v0.9.1 baseline and confirms that chain/spawn-attack spell support is present.

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
- local two-player versus experiments
- free-range Spell Lab

## Migration rule

The GitHub repository is now the canonical development source. Do not create a separate downloadable HTML as the authoritative version; changes should land here first.
