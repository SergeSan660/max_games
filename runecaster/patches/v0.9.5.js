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
  const cooldowns = { p1: new WeakMap(), p2: new WeakMap() };
  const MAX_CHAIN_DEPTH = 12;
  const EPSILON = 1e-6;

  function ownerId() { return currentSpellOwner === 'p2' ? 'p2' : 'p1'; }

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
      if (!Number.isInteger(target.value) || target.value < 1 || target.value > 5) throw Error(`Line ${target.line}: chain(slot) must use hotkey 1–5`);
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
    let total = 0, steps = 0;
    const step = () => { if (++steps > 1200) throw Error('Runtime guard: too many executed statements'); };

    const execStmt = (text, line) => {
      step(); let m;
      if ((m = text.match(/^(\w+)\s*=\s*spawn\(["'](fire|ice|lightning)["']\)$/))) { env[m[1]] = { element:m[2], damage:18, chain:0, split:0, onHit:null }; return; }
      if ((m = text.match(/^(\w+)\s*=\s*nearest_enemy\(\)$/))) { env[m[1]] = {x:800,y:320}; return; }
      if ((m = text.match(/^(\w+)\s*=\s*(.+)$/)) && !text.includes('.')) { env[m[1]] = evalNum(m[2], env); return; }
      if ((m = text.match(/^(\w+)\.(speed|damage|spread|angle|chain|size|lifetime)\s*=\s*(.+)$/))) { const b=env[m[1]]; if(!b) throw Error(`Line ${line}: ${m[1]} does not exist`); b[m[2]]=evalNum(m[3],env); return; }
      if ((m = text.match(/^(\w+)\.target\s*=\s*(\w+)$/))) return;
      if ((m = text.match(/^(\w+)\.on_hit\s*=\s*(.+)$/))) { const b=env[m[1]]; if(!b) throw Error(`Line ${line}: ${m[1]} does not exist`); const fx=parseImpactEffect(m[2],env,line); if(fx.type==='split'){b.split=fx.count;b.onHit=null}else{b.split=0;b.onHit=fx} return; }
      if ((m = text.match(/^nova\(["'](fire|ice|lightning)["'],\s*(.+),\s*(.+),\s*(.+)\)$/))) { total += Math.max(1,Math.floor(evalNum(m[2],env)))*Math.max(0,evalNum(m[3],env)); return; }
      if ((m = text.match(/^ray\(["'](fire|ice|lightning)["'],\s*(.+),\s*(.+),\s*(.+)\)$/))) { total += Math.max(0,evalNum(m[4],env)); return; }
      if ((m = text.match(/^cone\(["'](fire|ice|lightning)["'],\s*(.+),\s*(.+),\s*(.+)\)$/))) { total += Math.max(0,evalNum(m[4],env)); return; }
      if (/^(shield|force_field|teleport|push_self)\(/.test(text)) return;
      if ((m = text.match(/^launch\((\w+)\)$/))) { const b=env[m[1]]; if(!b) throw Error(`Line ${line}: ${m[1]} does not exist`); const hits=b.element==='lightning'?1+Math.max(0,Math.floor(Number(b.chain)||0)):1; total += Math.max(0,Number(b.damage)||0)*hits; total += effectDamage(b.onHit,Number(b.damage)||0); if(b.split>0) total += Math.max(0,Math.floor(Number(b.split)||0))*Math.max(0,Number(b.damage)||0)*.55; return; }
      throw Error(`Line ${line}: unsupported statement "${text}"`);
    };

    const execBody = body => { for (const node of body) { if(node.type==='stmt') execStmt(node.text,node.line); else if(node.type==='if'){step();const c=node.text.replace(/^if\s+/,'').replace(/:$/,'');if(evalCondition(c,env))execBody(node.body)} else if(node.type==='for'){step();const mm=node.text.match(/^for\s+(\w+)\s+in\s+(range\(.*\)):/);const r=parseRangeArgs(mm[2],env);let n=0;for(let v=r.start;r.step>0?v<r.stop:v>r.stop;v+=r.step){if(++n>300)throw Error('Runtime guard: loop exceeded 300 iterations');env[mm[1]]=v;execBody(node.body)}} } };
    execBody(ast); return total;
  }

  function ownSpellDamage(spell) { if(!spell)return 0; if(spell.usesCode&&spell.code){try{return codeDamage(spell.code)}catch{return 0}} return simpleSpellDamage(spell); }

  function spellCooldownSeconds(spell, visited=new Set(), depth=0) {
    if(!spell||depth>MAX_CHAIN_DEPTH||visited.has(spell)) return 0;
    visited.add(spell); let damage=ownSpellDamage(spell);
    if(spell.usesCode&&spell.code){for(const target of parseCastChainLines(spell.code).targets){try{damage += spellCooldownSeconds(resolveChainTarget(target).spell,visited,depth+1)*10}catch{}}}
    visited.delete(spell); return Math.max(0,damage/10);
  }

  function validateCastChains(source, originSpell) {
    const {stripped,targets}=parseCastChainLines(source); baseExecuteSpellCode(stripped,true);
    const seen=new Set([originSpell]); for(const target of targets){const {spell}=resolveChainTarget(target);if(spell===originSpell)throw Error(`Line ${target.line}: chain() cannot cast the same spell recursively`);if(seen.has(spell))throw Error(`Line ${target.line}: duplicate chain target creates an ambiguous cast sequence`);seen.add(spell)}
    return {stripped,targets};
  }

  executeSpellCode = function patchedExecuteSpellCode(source,dryRun=false){return baseExecuteSpellCode(parseCastChainLines(source).stripped,dryRun)};

  function performWithoutMana(spell){const mana=player.mana,max=player.maxMana;player.maxMana=Math.max(max,1e9);player.mana=player.maxMana;try{baseCastSpell(spell)}finally{player.maxMana=max;player.mana=Math.min(mana,max)}}

  function performChain(spell,context){if(!spell||context.depth>MAX_CHAIN_DEPTH)return;if(context.visited.has(spell)){showToast('Chain stopped — recursive spell loop detected.');return}context.visited.add(spell);performWithoutMana(spell);if(spell.usesCode&&spell.code){for(const target of parseCastChainLines(spell.code).targets){if(context.depth>=MAX_CHAIN_DEPTH)break;try{performChain(resolveChainTarget(target).spell,{visited:context.visited,depth:context.depth+1})}catch(err){showToast('Chain error: '+err.message);break}}}context.visited.delete(spell)}

  castSpell = function cooldownCastSpell(spell){if(!running||won||editorOpen||!spell)return;const owner=ownerId(),now=performance.now(),ready=cooldowns[owner].get(spell)||0;if(now+EPSILON<ready){showToast(`Cooldown ${Math.max(.1,(ready-now)/1000).toFixed(1)}s`);return}const cd=spellCooldownSeconds(spell);cooldowns[owner].set(spell,now+cd*1000);performChain(spell,{visited:new Set(),depth:0})};

  function cooldownText(spell){try{const s=spellCooldownSeconds(spell),d=s*10;return `${s.toFixed(s<10?1:0)}s cooldown · ${Math.round(d)} potential damage`}catch{return 'compile first'}}

  updateManaEstimate = function updateCooldownEstimate(){const el=document.getElementById('manaEstimate');if(el)el.textContent=cooldownText(spells[selected])};

  compileCode = function compileCooldownCode(){const text=document.getElementById('codeEditor').value,spell=spells[selected];try{const parsed=parseCastChainLines(text);const ast=parseSpellCode(parsed.stripped);if(!ast.length&&!parsed.targets.length)throw Error('Spell is empty');validateCastChains(text,spell);const name=text.match(/^#\s*(.+)$/m)?.[1]?.trim();if(name)spell.name=name;spell.code=text;spell.usesCode=true;renderHotbar();renderBlocks();renderLibrary();updateManaEstimate();document.getElementById('compileStatus').textContent='Compiled executable code ✓ · cooldown is based on total potential damage';showToast(`Full Code compiled · ${cooldownText(spell)}`)}catch(err){document.getElementById('compileStatus').textContent='Compile error: '+err.message;showToast('Compile error: '+err.message)}};

  const baseRenderLibrary=renderLibrary;
  renderLibrary=function renderCooldownLibrary(){baseRenderLibrary();const pane=document.getElementById('libraryPane');if(!pane)return;pane.querySelectorAll('.librarySpell').forEach((row,index)=>{const p=row.querySelector('p');if(p&&spells[index])p.textContent=`${cooldownText(spells[index])} · ${spells[index].usesCode?'Full Code':'Simple'} · ${spells[index].element}`})};

  const manaMeter=document.getElementById('manaTxt')?.closest('.meter');if(manaMeter)manaMeter.style.display='none';
  const p2ManaFill=document.getElementById('p2ManaFill');if(p2ManaFill)p2ManaFill.style.display='none';
  const p2Text=document.getElementById('p2Txt');if(p2Text){const observer=new MutationObserver(()=>{p2Text.textContent=`P2 ${Math.max(0,Math.ceil(player2.hp))}/${player2.maxHp} HP · spell ${p2Slot===4?'0':p2Slot+6}`});observer.observe(p2Text,{childList:true,characterData:true,subtree:true})}

  const prompt=document.getElementById('prompt');if(prompt)prompt.textContent='WASD move · Mouse aim · Click cast · 1–5 select · E spellbook · cooldown = total potential damage ÷ 10';
  if(typeof codeLessons==='object'&&codeLessons.effectchain){codeLessons.effectchain={title:'Chain saved spells into one action',what:'A standalone chain() line tells the wizard which saved spell to cast next after this spell. All chained spells happen from the same input action and their damage is added into one cooldown.',syntax:'chain("Ice Ray")\nchain(2)',example:'def cast():\n    bolt = spawn("fire")\n    bolt.damage = 20\n    launch(bolt)\n    chain("Ice Ray")\n    chain(2)',result:'RESULT → one button press casts this spell, then the named spell, then hotkey 2.',tip:'Use bolt.on_hit = chain(...) only for impact-effect sequences. Standalone chain(...) means cast another saved spell.'}}

  window.RuneCasterCooldown={version:'0.9.5',spellCooldownSeconds,ownSpellDamage,parseCastChainLines};
  updateManaEstimate();renderLibrary();console.info('Rune//Caster patch v0.9.5 loaded: damage cooldowns + cast chaining; mana disabled');
})();
