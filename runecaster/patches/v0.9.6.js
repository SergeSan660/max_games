/* Rune//Caster v0.9.6: visible cooldown UI, no visible mana. */
(() => {
  'use strict';
  if (!window.RuneCasterCooldown) return;

  const previousCastSpell = castSpell;
  const previousRenderBlocks = renderBlocks;
  const previousUpdate = update;
  const cooldownEnds = { p1: new WeakMap(), p2: new WeakMap() };

  const owner = () => currentSpellOwner === 'p2' ? 'p2' : 'p1';
  const totalCooldown = spell => {
    try { return Math.max(0, RuneCasterCooldown.spellCooldownSeconds(spell) || 0); }
    catch { return 0; }
  };
  const left = (spell, who = 'p1') => Math.max(0, ((cooldownEnds[who].get(spell) || 0) - performance.now()) / 1000);
  const fmt = n => n < 10 ? `${n.toFixed(1)}s` : `${Math.ceil(n)}s`;

  const manaMeter = document.getElementById('manaTxt')?.closest('.meter');
  if (manaMeter) manaMeter.remove();
  const p2ManaBar = document.getElementById('p2ManaFill')?.parentElement;
  if (p2ManaBar) p2ManaBar.remove();

  castSpell = function visibleCooldownCast(spell) {
    if (!running || won || editorOpen || !spell) return;
    const who = owner();
    const remaining = left(spell, who);
    if (remaining > 0.001) {
      showToast(`Cooldown ${fmt(remaining)}`);
      return;
    }
    cooldownEnds[who].set(spell, performance.now() + totalCooldown(spell) * 1000);
    return previousCastSpell(spell);
  };

  renderHotbar = function cooldownHotbar() {
    const el = document.getElementById('hotbar');
    if (!el) return;
    const icons = { fire:'🔥', lightning:'⚡', ice:'❄️' };
    el.innerHTML = '';
    loadout.forEach((spellIdx, i) => {
      const spell = spells[spellIdx] || defaultSpell('Empty');
      const d = document.createElement('div');
      d.className = 'slot' + (i === selectedSlot ? ' active' : '');
      d.style.gridTemplateRows = '15px 1fr 14px 11px';
      d.innerHTML = `<div class=n>${i+1}</div><div class=ico>${icons[spell.element]||'✨'}</div><div class=nm>${spell.name}</div><div class="costChip" data-cd-slot="${i}">${totalCooldown(spell).toFixed(1)}s CD</div>`;
      d.onclick = () => { if (!editorOpen && !hubOpen) selectHotbarSlot(i); };
      el.appendChild(d);
    });
  };

  renderBlocks = function cooldownBlocks() {
    previousRenderBlocks();
    const preview = document.getElementById('blocksPane')?.querySelector('.manaPreview');
    if (preview) {
      preview.textContent = `${totalCooldown(spells[selected]).toFixed(1)}s COOLDOWN`;
      preview.classList.remove('manaPreview');
    }
  };

  update = function noManaUpdate(dt) {
    for (const p of pickups) if (p.kind === 'mana') p.taken = true;
    previousUpdate(dt);
    if (gameMode === 'local2p') {
      const label = document.getElementById('p2Txt');
      if (label) label.textContent = `P2 ${Math.max(0,Math.ceil(player2.hp))}/${player2.maxHp} HP · spell ${p2Slot===4?'0':p2Slot+6}`;
    }
  };

  const prompt = document.getElementById('prompt');
  if (prompt) prompt.textContent = 'WASD move · Mouse aim · Click cast · 1–5 select · E spellbook · cooldown = damage ÷ 10';

  function refresh() {
    document.querySelectorAll('[data-cd-slot]').forEach(chip => {
      const spell = spells[loadout[Number(chip.dataset.cdSlot)]];
      if (!spell) return;
      const remaining = left(spell, 'p1');
      chip.textContent = remaining > 0 ? fmt(remaining) : `${totalCooldown(spell).toFixed(1)}s CD`;
    });
  }

  setInterval(refresh, 100);
  renderHotbar();
  renderBlocks();
  updateManaEstimate();
  renderLibrary();
  refresh();

  window.RuneCasterCooldownUI = { version:'0.9.6', left, refresh };
  console.info('Rune//Caster v0.9.6 loaded: visible cooldowns, mana UI removed');
})();
