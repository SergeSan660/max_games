/* Rune//Caster v0.9.2 compatibility patch.
 * Loaded after the byte-preserved v0.9.1 snapshot.
 * Keeps the imported baseline intact while fixing runtime/input issues and
 * replacing wall-pushing enemy movement with grid-based A* navigation.
 */
(() => {
  'use strict';

  const baseMoveEntity = moveEntity;
  const CELL = 32;
  const MAX_SEARCH = 1800;

  function blocked(gx, gy, r) {
    const x = gx * CELL + CELL / 2;
    const y = gy * CELL + CELL / 2;
    if (x < r + 25 || x > W - r - 25 || y < r + 25 || y > H - r - 25) return true;
    return walls.some(w => rectCircleCollide(x, y, r + 3, w));
  }

  function cellAt(x, y) {
    return {
      x: Math.max(0, Math.min(Math.floor((W - 1) / CELL), Math.floor(x / CELL))),
      y: Math.max(0, Math.min(Math.floor((H - 1) / CELL), Math.floor(y / CELL)))
    };
  }

  function nearestOpen(c, r) {
    if (!blocked(c.x, c.y, r)) return c;
    for (let radius = 1; radius <= 5; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          const q = { x: c.x + dx, y: c.y + dy };
          if (q.x < 0 || q.y < 0 || q.x * CELL >= W || q.y * CELL >= H) continue;
          if (!blocked(q.x, q.y, r)) return q;
        }
      }
    }
    return c;
  }

  function findPath(sx, sy, tx, ty, r) {
    const start = nearestOpen(cellAt(sx, sy), r);
    const goal = nearestOpen(cellAt(tx, ty), r);
    if (start.x === goal.x && start.y === goal.y) return [{ x: tx, y: ty }];

    const key = (x, y) => `${x},${y}`;
    const open = [{ x: start.x, y: start.y, g: 0, f: 0 }];
    const came = new Map();
    const gScore = new Map([[key(start.x, start.y), 0]]);
    const closed = new Set();
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [-1, -1, 1.414]
    ];

    let guard = 0;
    while (open.length && guard++ < MAX_SEARCH) {
      let best = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
      const cur = open.splice(best, 1)[0];
      const ck = key(cur.x, cur.y);
      if (closed.has(ck)) continue;
      closed.add(ck);

      if (cur.x === goal.x && cur.y === goal.y) {
        const cells = [{ x: cur.x, y: cur.y }];
        let k = ck;
        while (came.has(k)) {
          const prev = came.get(k);
          cells.push(prev);
          k = key(prev.x, prev.y);
        }
        cells.reverse();
        const result = cells.slice(1).map(c => ({
          x: c.x * CELL + CELL / 2,
          y: c.y * CELL + CELL / 2
        }));
        result.push({ x: tx, y: ty });
        return result;
      }

      for (const [dx, dy, cost] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx * CELL >= W || ny * CELL >= H || blocked(nx, ny, r)) continue;
        // Diagonal movement may not cut through the corner of two walls.
        if (dx && dy && (blocked(cur.x + dx, cur.y, r) || blocked(cur.x, cur.y + dy, r))) continue;
        const nk = key(nx, ny);
        if (closed.has(nk)) continue;
        const ng = cur.g + cost;
        if (ng >= (gScore.get(nk) ?? Infinity)) continue;
        gScore.set(nk, ng);
        came.set(nk, { x: cur.x, y: cur.y });
        const h = Math.hypot(goal.x - nx, goal.y - ny);
        open.push({ x: nx, y: ny, g: ng, f: ng + h });
      }
    }

    // Graceful fallback: collision-aware direct movement is still safer than freezing.
    return [{ x: tx, y: ty }];
  }

  function targetForEnemy(e) {
    if (gameMode === 'local2p') return dist(e, player2) < dist(e, player) ? player2 : player;
    return player;
  }

  function navMove(e, requestedStep) {
    if (e.type === 'dummy' || e.speed <= 0) return;
    const target = targetForEnemy(e);
    const now = performance.now();
    const targetCell = cellAt(target.x, target.y);
    const state = e.__nav || (e.__nav = {
      path: [], index: 0, replanAt: 0, targetKey: '', lastX: e.x, lastY: e.y, stuckAt: now
    });
    const targetKey = `${targetCell.x},${targetCell.y}`;

    if (now - state.stuckAt > 450) {
      if (Math.hypot(e.x - state.lastX, e.y - state.lastY) < 3) state.replanAt = 0;
      state.lastX = e.x;
      state.lastY = e.y;
      state.stuckAt = now;
    }

    if (now >= state.replanAt || state.targetKey !== targetKey || state.index >= state.path.length) {
      state.path = findPath(e.x, e.y, target.x, target.y, e.r);
      state.index = 0;
      state.targetKey = targetKey;
      state.replanAt = now + 280 + Math.random() * 150;
    }

    while (state.index < state.path.length &&
           Math.hypot(state.path[state.index].x - e.x, state.path[state.index].y - e.y) < Math.max(10, e.r * 0.7)) {
      state.index++;
    }

    const wp = state.path[state.index] || target;
    const a = Math.atan2(wp.y - e.y, wp.x - e.x);
    baseMoveEntity(e, Math.cos(a) * requestedStep, Math.sin(a) * requestedStep);
  }

  // The original update loop calls moveEntity() for every moving enemy. Intercept
  // only enemies, preserving player movement, teleportation and all other callers.
  moveEntity = function patchedMoveEntity(ent, dx, dy) {
    if (Array.isArray(enemies) && enemies.includes(ent) && !ent.dead) {
      navMove(ent, Math.hypot(dx, dy));
      return;
    }
    return baseMoveEntity(ent, dx, dy);
  };

  // Avoid held movement/cast keys after tab switches or focus loss.
  const clearKeys = () => { for (const k of Object.keys(keys)) keys[k] = false; };
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });

  // Future regressions should report themselves instead of looking like a blank/frozen game.
  let faultShown = false;
  function showFault(reason) {
    if (faultShown) return;
    faultShown = true;
    const err = reason instanceof Error ? reason : new Error(String(reason));
    console.error('Rune//Caster runtime error', err);
    const box = document.createElement('div');
    box.id = 'runecaster-runtime-fault';
    box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99999;max-width:560px;padding:10px 12px;border:1px solid #ff6d78;border-radius:8px;background:#4a1520;color:white;font:12px/1.35 system-ui';
    box.textContent = `Rune//Caster runtime error: ${err.message}`;
    document.body.appendChild(box);
  }
  window.addEventListener('error', e => showFault(e.error || e.message));
  window.addEventListener('unhandledrejection', e => showFault(e.reason));

  window.RuneCasterNav = { findPath, blocked, version: '0.9.2' };
  console.info('Rune//Caster patch v0.9.2 loaded: A* pathfinding + runtime guards');
})();
