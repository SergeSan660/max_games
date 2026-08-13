/* Rune//Caster v0.9.5 gameplay patch.
 * Removes mana as a cast gate and replaces it with damage-derived cooldowns.
 * 10 potential damage = 1 second cooldown, 20 = 2 seconds, etc.
 * Standalone chain("Spell Name") / chain(slotNumber) schedules another saved
 * spell in the same cast action. Projectile lightning chain and impact chain()
 * semantics remain intact for backwards compatibility.
 */
(() => {
  'use strict';

  const baseCastSpell = castSpell;
  const baseExecuteSpellCode = executeSpellCode;
  const baseCompileCode = compileCode;
  const cooldowns = { p1: new WeakMap(), p2: new WeakMap() };
  const MAX_CHAIN_DEPTH = 12;
  const EPSILON = 1e-6;

  function ownerId() {
    return currentSpellOwner === 'p2' ? 'p2' : 'p1';
  }

  function parseCastChainLines(source) {
    const targets = [];
    const stripped = String(source || '').split(/\r?\n/).map((line, index) => {
      const trimmed = line.trim();
      const m = trimmed.match(/^chain\(\s*(?:(['"])(.*?)\1|(\d+))\s*\)$/);
      if (!m) return line;
      const indent = (line.match(/^\s*/) || [''])[0];
      const target = m[2] != null ? { type: 'name', value: m[2], line: index + 1 } : { type: 'slot', value: Number(m[3]), line: index + 1 };
      targets.push(target);
      return `${indent}# cast-chain handled by RuneCaster v0.9.5`;
    }).join('\n');
    return { stripped, targets };
  }

  function resolveChainTarget(target) {
    if (target.type === 'slot') {
      if (!Number.isInteger(target.value) || target.value < 1 || target.value > 5) {
        throw Error(`Line ${target.line}: chain(slot) must use hotkey 1–5`);
      }
      const idx = loadout[target.value - 1];
      return { spell: spells[idx], index: idx };
    }
    const index = spells.findIndex(s => String(s.name).toLowerCase() === String(target.value).toLowerCase());
    if (index < 0) throw Error(`Line ${target.line}: chain() cannot find saved spell "${target.value}"`);
    return { spell: spells[index], index };
  }

  function effectDamage(fx, projectileDamage = 0) {
    if (!fx) return 0;
    if (fx.type === 'explode') return Math.max(0, Number(fx.damage) || 0);
    if (fx.type === 'chain_explosion') return Math.max(0, Number(fx.damage) || 0) * Math.max(1, Math.floor(Number(fx.jumps) || 1));
    if (fx.type === 'spawn_attack') return Math.max(0, Math.floor(Number(fx.count) || 0)) * Math.max(0, Number(fx.damage) || 0);
    if (fx.type === 'split') return Math.max(0, Math.floor(Number(fx.count) || 0)) * Math.max(0, projectileDamage) * 0.55;
    if (fx.type === 'chain') return fx.effects.reduce((sum, child) => sum + effectDamage(child, projectileDamage), 0);
    return 0;
  }

  function simpleSpellDamage(spell) {
    const count = unlocked.has('ouro') ? Math.max(1, Math.floor(Number(spell.count) || 1)) : 1;
    const damage = Math.max(0, Number(spell.damage) || 0);
    const lightningHits = spell.element === 'lightning' && unlocked.has('storm') ? 1 + Math.max(0, Math.floor(Number(spell.chain) || 0)) : 1;
    const split = unlocked.has('prism') ? Math.max(0, Math.floor(Number(spell.split) || 0)) : 0;
    return count * damage * lightningHits + count * split * damage * 0.55;
  }

  function codeDamage(source) {
    const parsed = parseCastChainLines(source);
    const ast = parseSpellCode(parsed.stripped);
    const env = {};
    let total = 0;
    let steps = 0;

    const step = () => {
      if (++steps > 1200) throw Error('Runtime guard: too many executed statements');
    };

    const execStmt = (text, line) => {
      step();
      let m;
      if ((m = text.match(/^(\w+)\s*=\s*spawn\(["'](fire|ice|lightning)["']\)$/))) {
        env[m[1]] = { element: m[2], damage: 18, chain: 0, split: 0, onHit: null };
        return;
      }
      if ((m = text.match(/^(\w+)\s*=\s*nearest_enemy\(\)$/))) {
        env[m[1]] = { x: 800, y: 320 };
        return;
      }
      if ((m = text.match(/^(\w+)\s*=\s*(.+)$/)) && !text.includes('.')) {
        env[m[1]] = evalNum(m[2], env);
        return;
      }
      if ((m = text.match(/^(\w+)\.(speed|damage|spread|angle|chain|size|lifetime)\s*=\s*(.+)$/))) {
        const bolt = env[m[1]];
        if (!bolt) throw Error(`Line ${line}: ${m[1]} does not exist`);
        bolt[m[2]] = evalNum(m[3], env);
        return;
      }
      if ((m = text.match(/^(\w+)\.target\s*=\s*(\w+)$/))) return;
      if ((m = text.match(/^(\w+)\.on_hit\s*=\s*(.+)$/))) {
        const bolt = env[m[1]];
        if (!bolt) throw Error(`Line ${line}: ${m[1]} does not exist`);
        const fx = parseImpactEffect(m[2], env, line);
        if (fx.type === 'split') { bolt.split = fx.count; bolt.onHit = null; }
        else { bolt.split = 0; bolt.onHit = fx; }
        return;
      }
      if ((m = text.match(/^nova\(["'](fire|ice|lightning)["'],\s*(.+),\s*(.+),\s*(.+)\)$/))) {
        total += Math.max(1, Math.floor(evalNum(m[2], env))) * Math.max(0, evalNum(m[3], env));
        return;
      }
      if ((m = text.match(/^ray\(["'](fire|ice|lightning)["'],\s*(.+),\s*(.+),\s*(.+)\)$/))) {
        total += Math.max(0, evalNum(m[4], env));
        return;
      }
      if ((m = text.match(/^cone\(["'](fire|ice|lightning)["'],\s*(.+),\s*(.+),\s*(.+)\)$/))) {
        total += Math.max(0, evalNum(m[4], env));
        return;
      }
      if (/^(shield|force_field|teleport|push_self)\(/.test(text)) return;
      if ((m = text.match(/^launch\((\w+)\)$/))) {
        const bolt = env[m[1]];
        if (!bolt) throw Error(`Line ${line}: ${m[1]} does not exist`);
        const directHits = bolt.element === 'lightning' ? 1 + Math.max(0, Math.floor(Number(bolt.chain) || 0)) : 1;
        total += Math.max(0, Number(bolt.damage) || 0) * directHits;
        total += effectDamage(bolt.onHit, Number(bolt.damage) || 0);
        if (bolt.split > 0) total += Math.max(0, Math.floor(Number(bolt.split) || 0)) * Math.max(0, Number(bolt.damage) || 0) * 0.55;
        return;
      }
      throw Error(`Line ${line}: unsupported statement "${text}"`);
    };

    const execBody = body => {
      for (const node of body) {
        if (node.type === 'stmt') execStmt(node.text, node.line);
        else if (node.type === 'if') {
          step();
          const condition = node.text.replace(/^if\s+/, '').replace(/:$/, '');
          if (evalCondition(condition, env)) execBody(node.body);
        } else if (node.type === 'for') {
          step();
          const mm = node.text.match(/^for\s+(\w+)\s+in\s+(range\(.*\)):/);
          const range = parseRangeArgs(mm[2], env);
          let iterations = 0;
          for (let value = range.start; range.step > 0 ? value < range.stop : value > range.stop; value += range.step) {
            if (++iterations > 300) throw Error('Runtime guard: loop exceeded 300 iterations');
            env[mm[1]] = value;
            execBody(node.body);
          }
        }
      }
    };

    execBody(ast);
    return total;
  }

  function ownSpellDamage(spell) {
    if (!spell) return 0;
    if (spell.usesCode && spell.code) {
      try { return codeDamage(spell.code); }
      catch { return 0; }
    }
    return simpleSpellDamage(spell);
  }

  function spellCooldownSeconds(spell, visited = new Set(), depth = 0) {
    if (!spell || depth > MAX_CHAIN_DEPTH || visited.has(spell)) return 0;
    visited.add(spell);
    let damage = ownSpellDamage(spell);
    if (spell.usesCode && spell.code) {
      const { targets } = parseCastChainLines(spell.code);
      for (const target of targets) {
        try {
          const next = resolveChainTarget(target).spell;
          damage += spellCooldownSeconds(next, visited, depth + 1) * 10;
        } catch { /* compiler reports invalid target */ }
      }
    }
    visited.delete(spell);
    return Math.max(0, damage / 10);
  }

  function validateCastChains(source, originSpell) {
    const { stripped, targets } = parseCastChainLines(source);
    baseExecuteSpellCode(stripped, true);
    const seen = new Set([originSpell]);
    for (const target of targets) {
      const { spell } = resolveChainTarget(target);
      if (spell === originSpell) throw Error(`Line ${target.line}: chain() cannot cast the same spell recursively`);
      if (seen.has(spell)) throw Error(`Line ${target.line}: duplicate chain target creates an ambiguous cast sequence`);
      seen.add(spell);
    }
    return { stripped, targets };
  }

  executeSpellCode = function patchedExecuteSpellCode(source, dryRun = false) {
    return baseExecuteSpellCode(parseCastChainLines(source).stripped, dryRun);
  };

  function performWithoutMana(spell) {
    const savedMana = player.mana;
    const savedMaxMana = player.maxMana;
    player.maxMana = Math.max(savedMaxMana, 1e9);
    player.mana = player.maxMana;
    try { baseCastSpell(spell); }
    finally {
      player.maxMana = savedMaxMana;
      player.mana = Math.min(savedMana, savedMaxMana);
    }
  }

  function performChain(spell, context) {
    if (!spell || context.depth > MAX_CHAIN_DEPTH) return;
    if (context.visited.has(spell)) {
      showToast('Chain stopped — recursive spell loop detected.');
      return;
    }
    context.visited.add(spell);
    performWithoutMana(spell);
    if (spell.usesCode && spell.code) {
      const { targets } = parseCastChainLines(spell.code);
      for (const target of targets) {
        if (context.depth >= MAX_CHAIN_DEPTH) break;
        try {
          const next = resolveChainTarget(target).spell;
          performChain(next, { visited: context.visited, depth: context.depth + 1 });
        } catch (err) {
          showToast('Chain error: ' + err.message);
          break;
        }
      }
    }
    context.visited.delete(spell);
  }

  castSpell = function cooldownCastSpell(spell) {
    if (!running || won || editorOpen || !spell) return;
    const owner = ownerId();
    const now = performance.now();
    const readyAt = cooldowns[owner].get(spell) || 0;
    if (now + EPSILON < readyAt) {
      showToast(`Cooldown ${(readyAt - now) / 1000 < 0.1 ? '0.1' : ((readyAt - now) / 1000).toFixed(1)}s`);
      return;
    }
    const cooldown = spellCooldownSeconds(spell);
    cooldowns[owner].set(spell, now + cooldown * 1000);
    performChain(spell, { visited: new Set(), depth: 0 });
  };

  function cooldownText(spell) {
    try {
      const seconds = spellCooldownSeconds(spell);
      const damage = seconds * 10;
      return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s cooldown · ${Math.round(damage)} potential damage`;
    } catch {
      return 'compile first';
    }
  }

  updateManaEstimate = function updateCooldownEstimate() {
    const el = document.getElementById('manaEstimate');
    if (!el) return;
    el.textContent = cooldownText(spells[selected]);
  };

  compileCode = function compileCooldownCode() {
    const text = document.getElementById('codeEditor').value;
    const spell = spells[selected];
    try {
      const ast = parseSpellCode(parseCastChainLines(text).stripped);
      if (!ast.length && !parseCastChainLines(text).targets.length) throw Error('Spell is empty');
      validateCastChains(text, spell);
      const name = text.match(/^#\s*(.+)$/m)?.[1]?.trim();
      if (name) spell.name = name;
      spell.code = text;
      spell.usesCode = true;
      renderHotbar();
      renderBlocks();
      renderLibrary();
      updateManaEstimate();
      document.getElementById('compileStatus').textContent = 'Compiled executable code ✓ · cooldown is based on total potential damage';
      showToast(`Full Code compiled · ${cooldownText(spell)}`);
    } catch (err) {
      document.getElementById('compileStatus').textContent = 'Compile error: ' + err.message;
      showToast('Compile error: ' + err.message);
    }
  };

  const baseRenderLibrary = renderLibrary;
  renderLibrary = function renderCooldownLibrary() {
    baseRenderLibrary();
    const pane = document.getElementById('libraryPane');
    if (!pane) return;
    pane.querySelectorAll('.librarySpell').forEach((row, index) => {
      const p = row.querySelector('p');
      if (p && spells[index]) p.textContent = `${cooldownText(spells[index])} · ${spells[index].usesCode ? 'Full Code' : 'Simple'} · ${spells[index].element}`;
    });
  };

  const manaMeter = document.getElementById('manaTxt')?.closest('.meter');
  if (manaMeter) manaMeter.style.display = 'none';
  const p2ManaFill = document.getElementById('p2ManaFill');
  if (p2ManaFill) p2ManaFill.style.display = 'none';
  const p2Text = document.getElementById('p2Txt');
  if (p2Text) p2Text.style.display = 'none';
  const p2Label = document.querySelector('#p2Hud .row span:first-child');
  if (p2Label) p2Label.textContent = 'P2 Health';

  document.querySelectorAll('p, .sideHead, .guideRule, .result, .what, .params').forEach(el => {
    if (el.children.length === 0 && /mana/i.test(el.textContent || '')) {
      el.textContent = el.textContent
        .replace(/Complexity costs mana[^.]*\./gi, 'Spell power creates cooldown instead.')
        .replace(/Mana cost scales[^.]*\./gi, 'Cooldown scales with total potential damage: 10 damage = 1 second.')
        .replace(/Every extra step raises mana cost\./gi, 'Every damaging step adds to the action cooldown.')
        .replace(/Mana rises with radius, damage, and jumps\./gi, 'Damage across all jumps adds to the action cooldown.')
        .replace(/The limitation is mana and /gi, 'The limitation is cooldown and ');
    }
  });

  const prompt = document.getElementById('prompt');
  if (prompt) prompt.textContent = 'WASD move · Mouse aim · Click cast · 1–5 select · E spellbook · cooldown = total potential damage ÷ 10';
  const estimateLabel = document.getElementById('manaEstimate')?.parentElement;
  if (estimateLabel) estimateLabel.firstChild.textContent = 'Estimated cast: ';

  if (typeof codeLessons === 'object' && codeLessons.effectchain) {
    codeLessons.effectchain = {
      title: 'Chain saved spells into one action',
      what: 'A standalone chain() line tells the wizard which saved spell to cast next after this spell. All chained spells happen from the same input action and their damage is added into one cooldown.',
      syntax: 'chain("Ice Ray")\nchain(2)',
      example: 'def cast():\n    bolt = spawn("fire")\n    bolt.damage = 20\n    launch(bolt)\n    chain("Ice Ray")\n    chain(2)',
      result: 'RESULT → one button press casts this spell, then the named spell, then hotkey 2.',
      tip: 'Use bolt.on_hit = chain(...) only for impact-effect sequences. Standalone chain(...) means cast another saved spell.'
    };
  }

  window.RuneCasterCooldown = {
    version: '0.9.5',
    spellCooldownSeconds,
    ownSpellDamage,
    parseCastChainLines
  };

  updateManaEstimate();
  renderLibrary();
  console.info('Rune//Caster patch v0.9.5 loaded: damage cooldowns + cast chaining; mana disabled');
})();
