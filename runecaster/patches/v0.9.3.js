/* Rune//Caster v0.9.3 compatibility patch.
 * Loaded after the byte-preserved v0.9.1 snapshot.
 * Preserves v0.9.2 runtime/input guards while making enemy navigation more
 * natural: direct pursuit in clear space, smoothed A* routes around walls,
 * deterministic replanning, stuck recovery, and safe reachable fallbacks.
 */
(() => {
  'use strict';

  const baseMoveEntity = moveEntity;
  const CELL = 32;
  const MAX_SEARCH = 1800;
  const CLEARANCE_PAD = 3;

  function blocked(gx, gy, r) {
    const x = gx * CELL + CELL / 2;
    const y = gy * CELL + CELL / 2;
    if (x < r + 25 || x > W - r - 25 || y < r + 25 || y > H - r - 25) return true;
    return walls.some(w => rectCircleCollide(x, y, r + CLEARANCE_PAD, w));
  }

  function pointBlocked(x, y, r) {
    if (x < r + 25 || x > W - r - 25 || y < r + 25 || y > H - r - 25) return true;
    return walls.some(w => rectCircleCollide(x, y, r + CLEARANCE_PAD, w));
  }

  function segmentClear(ax, ay, bx, by, r) {
    const distance = Math.hypot(bx - ax, by - ay);
    const samples = Math.max(1, Math.ceil(distance / (CELL / 4)));
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      if (pointBlocked(ax + (bx - ax) * t, ay + (by - ay) * t, r)) return false;
    }
    return true;
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

  function reconstruct(came, end, tx, ty, exactGoal) {
    const key = (x, y) => `${x},${y}`;
    const cells = [{ x: end.x, y: end.y }];
    let k = key(end.x, end.y);
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
    if (exactGoal) result.push({ x: tx, y: ty });
    return result;
  }

  function smoothPath(sx, sy, path, r) {
    if (path.length < 2) return path;
    const out = [];
    let ax = sx;
    let ay = sy;
    let i = 0;
    while (i < path.length) {
      let farthest = i;
      for (let j = path.length - 1; j >= i; j--) {
        if (segmentClear(ax, ay, path[j].x, path[j].y, r)) {
          farthest = j;
          break;
        }
      }
      const wp = path[farthest];
      out.push(wp);
      ax = wp.x;
      ay = wp.y;
      i = farthest + 1;
    }
    return out;
  }

  function findPath(sx, sy, tx, ty, r) {
    if (segmentClear(sx, sy, tx, ty, r)) return [{ x: tx, y: ty }];

    const start = nearestOpen(cellAt(sx, sy), r);
    const goal = nearestOpen(cellAt(tx, ty), r);
    if (start.x === goal.x && start.y === goal.y) return [{ x: tx, y: ty }];

    const key = (x, y) => `${x},${y}`;
    const heuristic = (x, y) => Math.hypot(goal.x - x, goal.y - y);
    const open = [{ x: start.x, y: start.y, g: 0, f: heuristic(start.x, start.y) }];
    const came = new Map();
    const gScore = new Map([[key(start.x, start.y), 0]]);
    const closed = new Set();
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2]
    ];

    let bestReachable = { x: start.x, y: start.y, h: heuristic(start.x, start.y) };
    let guard = 0;
    while (open.length && guard++ < MAX_SEARCH) {
      let best = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[best].f || (open[i].f === open[best].f && open[i].g > open[best].g)) best = i;
      }
      const cur = open.splice(best, 1)[0];
      const ck = key(cur.x, cur.y);
      if (closed.has(ck)) continue;
      closed.add(ck);

      const h = heuristic(cur.x, cur.y);
      if (h < bestReachable.h) bestReachable = { x: cur.x, y: cur.y, h };

      if (cur.x === goal.x && cur.y === goal.y) {
        return smoothPath(sx, sy, reconstruct(came, cur, tx, ty, true), r);
      }

      for (const [dx, dy, cost] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx * CELL >= W || ny * CELL >= H || blocked(nx, ny, r)) continue;
        // Diagonal movement may not cut through wall corners.
        if (dx && dy && (blocked(cur.x + dx, cur.y, r) || blocked(cur.x, cur.y + dy, r))) continue;
        const nk = key(nx, ny);
        if (closed.has(nk)) continue;
        const ng = cur.g + cost;
        if (ng >= (gScore.get(nk) ?? Infinity)) continue;
        gScore.set(nk, ng);
        came.set(nk, { x: cur.x, y: cur.y });
        open.push({ x: nx, y: ny, g: ng, f: ng + heuristic(nx, ny) });
      }
    }

    // If the target is unreachable, move only toward the closest reachable cell.
    // Never fall back to blindly walking through a wall.
    const fallback = reconstruct(came, bestReachable, tx, ty, false);
    return smoothPath(sx, sy, fallback, r);
  }

  function targetForEnemy(e) {
    if (gameMode === 'local2p') return dist(e, player2) < dist(e, player) ? player2 : player;
    return player;
  }

  function replanDelay(e) {
    const seed = Math.abs(Math.floor((e.x * 13 + e.y * 7 + (e.r || 0) * 17))) % 151;
    return 260 + seed;
  }

  function navMove(e, requestedStep) {
    if (e.type === 'dummy' || e.speed <= 0 || requestedStep <= 0) return;
    const target = targetForEnemy(e);
    const now = performance.now();

    // In open space, chase directly instead of zig-zagging through grid centers.
    if (segmentClear(e.x, e.y, target.x, target.y, e.r)) {
      const a = Math.atan2(target.y - e.y, target.x - e.x);
      baseMoveEntity(e, Math.cos(a) * requestedStep, Math.sin(a) * requestedStep);
      if (e.__nav) {
        e.__nav.path = [];
        e.__nav.index = 0;
        e.__nav.targetKey = '';
      }
      return;
    }

    const targetCell = cellAt(target.x, target.y);
    const state = e.__nav || (e.__nav = {
      path: [], index: 0, replanAt: 0, targetKey: '', lastX: e.x, lastY: e.y, stuckAt: now
    });
    const targetKey = `${targetCell.x},${targetCell.y}`;

    if (now - state.stuckAt > 400) {
      if (Math.hypot(e.x - state.lastX, e.y - state.lastY) < Math.max(2, requestedStep * 2)) state.replanAt = 0;
      state.lastX = e.x;
      state.lastY = e.y;
      state.stuckAt = now;
    }

    if (now >= state.replanAt || state.targetKey !== targetKey || state.index >= state.path.length) {
      state.path = findPath(e.x, e.y, target.x, target.y, e.r);
      state.index = 0;
      state.targetKey = targetKey;
      state.replanAt = now + replanDelay(e);
    }

    while (state.index < state.path.length &&
           Math.hypot(state.path[state.index].x - e.x, state.path[state.index].y - e.y) < Math.max(10, e.r * 0.7)) {
      state.index++;
    }

    // Opportunistically skip obsolete waypoints as soon as a later one is visible.
    for (let i = state.path.length - 1; i > state.index; i--) {
      if (segmentClear(e.x, e.y, state.path[i].x, state.path[i].y, e.r)) {
        state.index = i;
        break;
      }
    }

    const wp = state.path[state.index];
    if (!wp) return;
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

  window.RuneCasterNav = {
    findPath,
    blocked,
    segmentClear,
    smoothPath,
    version: '0.9.3'
  };
  console.info('Rune//Caster patch v0.9.3 loaded: logical A* pathfinding + runtime guards');
})();
