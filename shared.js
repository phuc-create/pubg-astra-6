/* Shared arena and movement rules: used by the server and browser prediction. */
(function (root) {
  'use strict';
  const WORLD = { width: 1600, height: 900, margin: 28 };
  const CONFIG = {
    playerSpeed: 285, maxHealth: 100, magazine: 30,
    bulletSpeed: 1120, bulletDamage: 28, fireInterval: .145,
    reloadDuration: 1.2, dashSpeed: 900, dashDuration: .15,
    dashCooldown: 2.1, pickupRadius: 30, maxParticles: 360
  };
  const RULES = { maxTeams: 4, teamSize: 3, maxPlayers: 12, scoreLimit: 20,
    duration: 300, respawn: 3, spawnShield: 1.5, tickRate: 60, snapshotRate: 20 };
  const TEAMS = [
    { id: 'mint', name: 'NGỌC LỤC', color: '#69ebd2', symbol: '◆' },
    { id: 'coral', name: 'SAN HÔ', color: '#ff7c91', symbol: '▲' },
    { id: 'gold', name: 'HỔ PHÁCH', color: '#f5d36c', symbol: '●' },
    { id: 'violet', name: 'THẠCH ANH', color: '#b599ff', symbol: '■' }
  ];
  const OBSTACLES = [
    { x: 272, y: 211, w: 185, h: 86, label: 'A-01' },
    { x: 1143, y: 211, w: 185, h: 86, label: 'A-02' },
    { x: 272, y: 603, w: 185, h: 86, label: 'B-01' },
    { x: 1143, y: 603, w: 185, h: 86, label: 'B-02' },
    { x: 718, y: 165, w: 164, h: 62, label: 'C-01' },
    { x: 718, y: 673, w: 164, h: 62, label: 'C-02' }
  ];
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  function move(entity, dx, dy) {
    // Substeps prevent a dash/prediction correction from tunnelling through cover.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 12));
    for (let i = 0; i < steps; i++) {
      entity.x += dx / steps; entity.y += dy / steps;
      for (let pass = 0; pass < 2; pass++) for (const o of OBSTACLES) {
        const ex = entity.x - clamp(entity.x, o.x, o.x + o.w);
        const ey = entity.y - clamp(entity.y, o.y, o.y + o.h);
        const d = Math.hypot(ex, ey);
        if (d >= entity.r) continue;
        if (d > .00001) {
          entity.x += ex / d * (entity.r - d); entity.y += ey / d * (entity.r - d);
        } else {
          const sides = [entity.x - o.x, o.x + o.w - entity.x, entity.y - o.y, o.y + o.h - entity.y];
          const side = sides.indexOf(Math.min(...sides));
          if (side === 0) entity.x = o.x - entity.r;
          if (side === 1) entity.x = o.x + o.w + entity.r;
          if (side === 2) entity.y = o.y - entity.r;
          if (side === 3) entity.y = o.y + o.h + entity.r;
        }
      }
      entity.x = clamp(entity.x, WORLD.margin + entity.r, WORLD.width - WORLD.margin - entity.r);
      entity.y = clamp(entity.y, WORLD.margin + entity.r, WORLD.height - WORLD.margin - entity.r);
    }
  }
  function segmentRect(x, y, nx, ny, o) {
    let low = 0, high = 1;
    for (const [start, delta, min, max] of [[x, nx - x, o.x, o.x + o.w], [y, ny - y, o.y, o.y + o.h]]) {
      if (Math.abs(delta) < 1e-9) { if (start < min || start > max) return null; }
      else {
        const a = (min - start) / delta, b = (max - start) / delta;
        low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b));
        if (low > high) return null;
      }
    }
    return low;
  }
  function segmentCircle(x, y, nx, ny, p, radius) {
    const dx = nx - x, dy = ny - y, fx = x - p.x, fy = y - p.y;
    const c = fx * fx + fy * fy - radius * radius;
    if (c <= 0) return 0;
    const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), disc = b * b - 4 * a * c;
    if (a < 1e-9 || disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
  }
  const api = { WORLD, CONFIG, RULES, TEAMS, OBSTACLES, move, segmentRect, segmentCircle, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NeonShared = api;
})(globalThis);
