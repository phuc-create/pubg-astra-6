'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomInt, randomUUID } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { WORLD, CONFIG: C, RULES: R, TEAMS, OBSTACLES, move, segmentRect, segmentCircle } = require('./shared');

const EMPTY_INPUT = () => ({ x: 0, y: 0, angle: 0, fire: false, reload: false, dash: false });
function cleanName(value) {
  return typeof value === 'string' ? Array.from(value.normalize('NFC').replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim()).slice(0, 18).join('') : '';
}

class Arena {
  constructor() { this.rooms = new Map(); this.clients = new Map(); this.bulletId = 0; }
  connect(ws) {
    const client = { id: randomUUID(), ws, room: null, lastInput: 0, messages: 0, window: Date.now() };
    this.clients.set(client.id, client);
    this.send(client, { type: 'hello', id: client.id });
    return client;
  }
  send(client, message) {
    if (client.ws.readyState === WebSocket.OPEN) {
      if (client.ws.bufferedAmount > 256 * 1024) { client.ws.close(1013, 'Connection too slow'); return; }
      client.ws.send(JSON.stringify(message));
    }
  }
  error(client, message) { this.send(client, { type: 'error', message }); }
  lobby(room) {
    return { type: 'room', code: room.code, host: room.host, phase: room.phase,
      result: room.result, teams: room.teams.map(t => ({ ...t })),
      players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, ready: p.ready, kills: p.kills, deaths: p.deaths })) };
  }
  broadcastRoom(room) { const data = this.lobby(room); for (const p of room.players.values()) this.send(p.client, data); }
  receive(client, data) {
    const now = Date.now();
    if (now - client.window >= 1000) { client.window = now; client.messages = 0; }
    if (++client.messages > 100) { client.ws.close(1008, 'Too many messages'); return; }
    let msg;
    try { msg = JSON.parse(data); } catch { return this.error(client, 'Dữ liệu không hợp lệ.'); }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
    if (msg.type === 'ping') return this.send(client, { type: 'pong', at: typeof msg.at === 'number' ? msg.at : 0 });
    if (msg.type === 'leave') { this.leave(client); return this.send(client, { type: 'left' }); }
    if (msg.type === 'create' || msg.type === 'join') {
      if (client.room) return this.error(client, 'Hãy rời phòng hiện tại trước.');
      const name = cleanName(msg.name);
      if (!name) return this.error(client, 'Nhập tên người chơi (tối đa 18 ký tự).');
      let room;
      if (msg.type === 'create') {
        if (this.rooms.size >= 100) return this.error(client, 'Máy chủ đã đầy. Hãy thử lại sau.');
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code;
        do { code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (this.rooms.has(code));
        room = { code, host: client.id, players: new Map(), teams: [], phase: 'lobby', elapsed: 0, bullets: [], result: null, events: [] };
        this.rooms.set(code, room);
      } else {
        const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
        room = this.rooms.get(code);
        if (!room) return this.error(client, 'Không tìm thấy phòng. Kiểm tra mã 6 ký tự.');
        if (room.phase !== 'lobby') return this.error(client, 'Trận đấu đang diễn ra. Hãy chờ phòng trở về sảnh.');
        if (room.players.size >= R.maxPlayers) return this.error(client, 'Phòng đã đủ 12 người.');
      }
      client.room = room;
      room.players.set(client.id, { id: client.id, client, name, team: null, ready: false, kills: 0, deaths: 0,
        input: EMPTY_INPUT(), seq: -1, x: 800, y: 450, r: 18, hp: C.maxHealth, angle: 0, ammo: C.magazine,
        reload: 0, fireCooldown: 0, dash: 0, dashCooldown: 0, dashX: 0, dashY: 0, invulnerable: 0, respawn: 0 });
      return this.broadcastRoom(room);
    }
    const room = client.room, p = room?.players.get(client.id);
    if (!p) return this.error(client, 'Bạn chưa vào phòng.');
    if (msg.type === 'input') {
      if (room.phase !== 'playing' || !Number.isSafeInteger(msg.seq) || msg.seq <= p.seq) return;
      if (![msg.x, msg.y, msg.angle].every(Number.isFinite) || Math.abs(msg.angle) > 1e6) return;
      const len = Math.max(1, Math.hypot(msg.x, msg.y));
      p.seq = msg.seq; p.input.x = msg.x / len; p.input.y = msg.y / len;
      p.input.angle = msg.angle % (Math.PI * 2); p.input.fire = msg.fire === true;
      p.input.reload ||= msg.reload === true; p.input.dash ||= msg.dash === true;
      client.lastInput = now;
      return;
    }
    if (msg.type === 'back') {
      if (room.host !== client.id || room.phase !== 'ended') return this.error(client, 'Chỉ chủ phòng được đưa cả phòng về sảnh sau trận.');
      room.phase = 'lobby'; room.result = null; room.bullets = [];
      for (const member of room.players.values()) { member.ready = false; member.input = EMPTY_INPUT(); }
      return this.broadcastRoom(room);
    }
    if (room.phase !== 'lobby') return this.error(client, 'Không thể đổi đội khi trận đấu đã bắt đầu.');
    if (msg.type === 'createTeam' || msg.type === 'joinTeam') {
      let team;
      if (msg.type === 'createTeam') {
        const preset = TEAMS.find(t => !room.teams.some(current => current.id === t.id));
        if (!preset) return this.error(client, 'Phòng đã có đủ 4 đội.');
        team = { ...preset, score: 0 }; room.teams.push(team);
      } else {
        team = room.teams.find(t => t.id === msg.team);
        if (!team) return this.error(client, 'Đội không còn tồn tại.');
        if (team.id === p.team) return;
        if ([...room.players.values()].filter(member => member.team === team.id).length >= R.teamSize)
          return this.error(client, 'Đội đã đủ 3 người. Hãy chọn hoặc tạo đội khác.');
      }
      p.team = team.id; p.ready = false;
      room.teams = room.teams.filter(t => [...room.players.values()].some(member => member.team === t.id));
      return this.broadcastRoom(room);
    }
    if (msg.type === 'ready') {
      if (!p.team) return this.error(client, 'Hãy chọn hoặc tạo một đội trước.');
      p.ready = msg.ready === true; return this.broadcastRoom(room);
    }
    if (msg.type === 'start') {
      if (room.host !== client.id) return this.error(client, 'Chỉ chủ phòng được bắt đầu trận.');
      if (room.teams.length < 2) return this.error(client, 'Cần ít nhất 2 đội để bắt đầu.');
      if ([...room.players.values()].some(member => !member.team || !member.ready))
        return this.error(client, 'Tất cả người chơi cần chọn đội và sẵn sàng.');
      room.phase = 'playing'; room.elapsed = 0; room.bullets = []; room.events = []; room.result = null;
      for (const t of room.teams) t.score = 0;
      for (const member of room.players.values()) { member.kills = 0; member.deaths = 0; member.seq = -1; this.spawn(room, member); }
      this.broadcastRoom(room); this.snapshot(room);
    }
  }
  spawn(room, p) {
    const index = TEAMS.findIndex(t => t.id === p.team);
    const bases = [[110, 450], [1490, 450], [800, 100], [800, 800]];
    const [bx, by] = bases[index];
    const candidates = [[bx, by], [bx, by - 48], [bx, by + 48], [bx - 48, by], [bx + 48, by]];
    const others = [...room.players.values()].filter(o => o.id !== p.id && o.hp > 0);
    const rank = ([x, y]) => others.reduce((min, o) => Math.min(min, Math.hypot(o.x - x, o.y - y)), 2000);
    candidates.sort((a, b) => rank(b) - rank(a));
    [p.x, p.y] = candidates[0]; p.angle = Math.atan2(450 - p.y, 800 - p.x);
    Object.assign(p, { hp: C.maxHealth, ammo: C.magazine, reload: 0, fireCooldown: 0, dash: 0,
      dashCooldown: 0, invulnerable: R.spawnShield, respawn: 0, input: EMPTY_INPUT() });
    p.input.angle = p.angle;
  }
  leave(client) {
    const room = client.room;
    if (!room) return;
    room.players.delete(client.id); client.room = null;
    room.bullets = room.bullets.filter(b => b.owner !== client.id);
    if (!room.players.size) { this.rooms.delete(room.code); return; }
    if (room.host === client.id) room.host = room.players.keys().next().value;
    if (room.phase === 'lobby') room.teams = room.teams.filter(t => [...room.players.values()].some(p => p.team === t.id));
    if (room.phase === 'playing') {
      const active = new Set([...room.players.values()].map(p => p.team));
      if (active.size < 2) this.finish(room, 'Đối thủ đã rời phòng.', [...active][0]);
    }
    this.broadcastRoom(room);
  }
  disconnect(client) { this.leave(client); this.clients.delete(client.id); }
  finish(room, reason, winner) {
    if (room.phase !== 'playing') return;
    room.phase = 'ended'; room.bullets = [];
    if (winner === undefined) {
      const leaders = room.teams.filter(t => t.score === Math.max(...room.teams.map(t => t.score)));
      winner = leaders.length === 1 ? leaders[0].id : null;
    }
    room.result = { reason, winner };
    for (const p of room.players.values()) p.input = EMPTY_INPUT();
    this.broadcastRoom(room);
  }
  step(dt, now = Date.now()) {
    for (const room of this.rooms.values()) {
      if (room.phase !== 'playing') continue;
      room.elapsed += dt;
      for (const p of room.players.values()) {
        if (now - p.client.lastInput > 500) p.input = { ...EMPTY_INPUT(), angle: p.angle };
        if (p.hp <= 0) { p.respawn = Math.max(0, p.respawn - dt); if (!p.respawn) this.spawn(room, p); continue; }
        for (const key of ['fireCooldown', 'dashCooldown', 'invulnerable']) p[key] = Math.max(0, p[key] - dt);
        if (p.reload > 0) { p.reload = Math.max(0, p.reload - dt); if (!p.reload) p.ammo = C.magazine; }
        const input = p.input; p.angle = input.angle;
        if (input.dash && p.dashCooldown <= 0) {
          const len = Math.hypot(input.x, input.y);
          p.dashX = len ? input.x / len : Math.cos(p.angle); p.dashY = len ? input.y / len : Math.sin(p.angle);
          p.dash = C.dashDuration; p.dashCooldown = C.dashCooldown;
        }
        if (p.dash > 0) {
          const duration = Math.min(dt, p.dash); move(p, p.dashX * C.dashSpeed * duration, p.dashY * C.dashSpeed * duration);
          p.dash = Math.max(0, p.dash - dt);
        } else move(p, input.x * C.playerSpeed * dt, input.y * C.playerSpeed * dt);
        if (input.reload && !p.reload && p.ammo < C.magazine) p.reload = C.reloadDuration;
        input.dash = false; input.reload = false;
        if (input.fire && !p.reload && !p.fireCooldown && p.ammo > 0) {
          // A protected player loses their spawn shield as soon as they attack.
          p.invulnerable = 0; p.ammo--; p.fireCooldown = C.fireInterval;
          room.bullets.push({ id: ++this.bulletId, owner: p.id, team: p.team, x: p.x, y: p.y,
            vx: Math.cos(p.angle) * C.bulletSpeed, vy: Math.sin(p.angle) * C.bulletSpeed, life: 1.6 });
          if (!p.ammo) p.reload = C.reloadDuration;
        }
      }
      for (const b of room.bullets) {
        const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
        let hit = 2, target = null;
        for (const o of OBSTACLES) { const t = segmentRect(b.x, b.y, nx, ny, o); if (t !== null && t < hit) hit = t; }
        for (const p of room.players.values()) {
          if (p.hp <= 0 || p.team === b.team || p.invulnerable > 0) continue;
          const t = segmentCircle(b.x, b.y, nx, ny, p, p.r + 2);
          if (t !== null && t < hit) { hit = t; target = p; }
        }
        b.x = nx; b.y = ny; b.life -= dt;
        if (hit <= 1) {
          b.life = 0;
          if (target) {
            target.hp = Math.max(0, target.hp - C.bulletDamage);
            room.events.push({ type: 'hit', shooter: b.owner, target: target.id });
            if (!target.hp) {
              target.deaths++; target.respawn = R.respawn; target.input = EMPTY_INPUT();
              const shooter = room.players.get(b.owner); if (shooter) shooter.kills++;
              const team = room.teams.find(t => t.id === b.team); if (team) team.score++;
              room.events.push({ type: 'kill', shooter: b.owner, target: target.id, team: b.team });
              if (team?.score >= R.scoreLimit) { this.finish(room, 'Đã đạt 20 điểm hạ gục.', team.id); break; }
            }
          }
        }
      }
      room.bullets = room.bullets.filter(b => b.life > 0 && b.x > WORLD.margin && b.x < WORLD.width - WORLD.margin && b.y > WORLD.margin && b.y < WORLD.height - WORLD.margin);
      if (room.elapsed >= R.duration) this.finish(room, 'Hết thời gian 5 phút.');
    }
  }
  snapshot(room) {
    if (room.phase !== 'playing') return;
    const round = n => Math.round(n * 1000) / 1000;
    const players = [...room.players.values()].map(p => {
      const result = { id: p.id, team: p.team, seq: p.seq, kills: p.kills, deaths: p.deaths };
      for (const k of ['x', 'y', 'angle', 'hp', 'ammo', 'reload', 'dash', 'dashX', 'dashY', 'dashCooldown', 'fireCooldown', 'invulnerable', 'respawn']) result[k] = round(p[k]);
      return result;
    });
    for (const viewer of room.players.values()) this.send(viewer.client, { type: 'snapshot', elapsed: round(room.elapsed),
      teams: room.teams, events: room.events,
      // Enemy nameplates cannot accidentally leak through the rendering layer.
      players: players.map(p => ({ ...p, name: p.team === viewer.team ? room.players.get(p.id).name : '' })),
      bullets: room.bullets.map(b => ({ id: b.id, team: b.team, x: round(b.x), y: round(b.y), vx: round(b.vx), vy: round(b.vy) })) });
    room.events = [];
  }
}

function createServer() {
  const arena = new Arena();
  const files = new Map([
    ['/', ['neon-strike.html', 'text/html']], ['/neon-strike.html', ['neon-strike.html', 'text/html']],
    ['/shared.js', ['shared.js', 'text/javascript']], ['/multiplayer.js', ['multiplayer.js', 'text/javascript']],
    ['/multiplayer.css', ['multiplayer.css', 'text/css']]
  ]);
  const server = http.createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}'); }
    const file = files.get(url.pathname);
    if (!file) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(path.join(__dirname, file[0])).on('error', () => res.destroy()).pipe(res);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    let allowed = req.url === '/ws';
    if (req.headers.origin) {
      try { allowed &&= new URL(req.headers.origin).host === req.headers.host; } catch { allowed = false; }
    }
    if (!allowed || wss.clients.size >= 1200) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    const client = arena.connect(ws); ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (data, binary) => { if (!binary) arena.receive(client, data.toString()); });
    ws.on('close', () => arena.disconnect(client));
    ws.on('error', () => ws.terminate());
  });
  let previous = performance.now(), accumulator = 0, ticks = 0;
  const timer = setInterval(() => {
    const now = performance.now(); accumulator += Math.min((now - previous) / 1000, .1); previous = now;
    while (accumulator >= 1 / R.tickRate) {
      arena.step(1 / R.tickRate); accumulator -= 1 / R.tickRate;
      if (++ticks % (R.tickRate / R.snapshotRate) === 0) for (const room of arena.rooms.values()) arena.snapshot(room);
    }
  }, 1000 / R.tickRate);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } }
  }, 10000);
  async function close() {
    clearInterval(timer); clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  }
  return { server, arena, close };
}
if (require.main === module) {
  const app = createServer(), port = Number(process.env.PORT || 3000), host = process.env.HOST || '0.0.0.0';
  app.server.listen(port, host, () => console.log(`NEON STRIKE: http://localhost:${port} — dùng địa chỉ LAN của máy này để mời bạn bè.`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close().then(() => process.exit(0)));
}
module.exports = { Arena, createServer, cleanName };
