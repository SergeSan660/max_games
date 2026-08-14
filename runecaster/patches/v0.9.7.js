/* Rune//Caster v0.9.7: self-contained cooldown enforcement and mana removal. */
(() => {
  'use strict';

  const priorCastSpell = castSpell;
  const cooldownEnds = new WeakMap();

  function numericDamage(spell) {
    if (!spell) return 0;
    if (!spell.usesCode || !spell.code) {
      const count = Math.max(1, Math.floor(Number(spell.count) || 1));
      const damage = Math.max(0, Number(spell.damage) || 0);
      const jumps = spell.element === 'lightning' ? Math.max(0, Math.floor(Number(spell.chain) || 0)) : 0;
      const split = Math.max(0, Math.floor(Number(spell.split) || 0));
      return count * damage * (1 + jumps) + count * split * damage * 0.55;
    }

    const src = String(spell.code);
    let total = 0;
    const vars = Object.create(null);
    for (const raw of src.split(/\r?\n/)) {
      const line = raw.replace(/#.*/, '').trim();
      let m;
      if ((m = line.match(/^(\w+)\s*=\s*(-?\d+(?:\.\d+)?)$/))) vars[m[1]] = Number(m[2]);
      if ((m = line.match(/^(\w+)\.damage\s*=\s*(-?\d+(?:\.\d+)?)$/))) vars[m[1] + '.damage'] = Math.max(0, Number(m[2]));
      if ((m = line.match(/^nova\([^,]+,\s*(\d+),\s*(\d+(?:\.\d+)?)/))) total += Number(m[1]) * Number(m[2]);
      if ((m = line.match(/^(?:ray|cone)\([^,]+,[^,]+,[^,]+,\s*(\d+(?:\.\d+)?)\s*\)$/))) total += Number(m[1]);
      if ((m = line.match(/^launch\((\w+)\)$/))) total += Math.max(0, Number(vars[m[1] + '.damage']) || 18);
    }
    return Math.max(0, total);
  }

  function cooldownSeconds(spell) {
    return numericDamage(spell) / 10;
  }

  function remaining(spell) {
    return Math.max(0, ((cooldownEnds.get(spell) || 0) - performance.now()) / 1000);
  }

  function castWithoutMana(spell) {
    const oldMana = player && Number.isFinite(player.mana) ? player.mana : 0;
    const oldMax = player && Number.isFinite(player.maxMana) ? player.maxMana : 0;
    if (player) {
      player.maxMana = 1e12;
      player.mana = 1e12;
    }
    try {
      return priorCastSpell(spell);
    } finally {
      if (player) {
        player.maxMana = oldMax;
        player.mana = oldMana;
      }
    }
  }

  castSpell = function hardCooldownCast(spell) {
    if (!spell || !running || won || editorOpen) return;
    const left = remaining(spell);
    if (left > 0.001) {
      showToast(`Cooldown ${left < 10 ? left.toFixed(1) : Math.ceil(left)}s`);
      return;
    }
    const seconds = cooldownSeconds(spell);
    cooldownEnds.set(spell, performance.now() + seconds * 1000);
    return castWithoutMana(spell);
  };

  function removeManaUi() {
    const manaText = document.getElementById('manaTxt');
    if (manaText?.closest('.meter')) manaText.closest('.meter').style.display = 'none';
    const p2Mana = document.getElementById('p2ManaFill');
    if (p2Mana?.parentElement) p2Mana.parentElement.style.display = 'none';

    document.querySelectorAll('.costChip').forEach((chip, i) => {
      const spell = spells?.[loadout?.[i]];
      if (!spell) return;
      const left = remaining(spell);
      chip.textContent = left > 0 ? `${left < 10 ? left.toFixed(1) : Math.ceil(left)}s` : `${cooldownSeconds(spell).toFixed(1)}s CD`;
    });

    document.querySelectorAll('.manaPreview').forEach(el => {
      const spell = spells?.[selected];
      el.textContent = `${cooldownSeconds(spell).toFixed(1)}s COOLDOWN`;
    });

    document.querySelectorAll('*').forEach(el => {
      if (el.children.length) return;
      const text = (el.textContent || '').trim();
      if (/^MANA\b/i.test(text)) el.textContent = text.replace(/^MANA\b/i, 'COOLDOWN');
    });
  }

  const oldUpdate = update;
  update = function hardNoManaUpdate(dt) {
    if (Array.isArray(pickups)) {
      for (const p of pickups) if (p && p.kind === 'mana') p.taken = true;
    }
    oldUpdate(dt);
    removeManaUi();
  };

  setInterval(removeManaUi, 100);
  removeManaUi();

  window.RuneCasterHardCooldown = {
    version: '0.9.7',
    cooldownSeconds,
    remaining,
    damage: numericDamage
  };
  console.info('Rune//Caster v0.9.7 loaded: hard cooldown enforcement, mana fully bypassed');
})();
