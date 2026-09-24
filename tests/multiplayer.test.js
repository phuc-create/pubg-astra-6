'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { Arena, createServer, cleanName } = require('../server');
const { WORLD, RULES, CONFIG, move, OBSTACLES } = require('../shared');

function fixture(count = 3) {
  const arena = new Arena();
  const clients = Array.from({ length: count }, () => {
    const messages = [];
    const client = arena.connect({ readyState: 1, bufferedAmount: 0, send: text => messages.push(JSON.parse(text)), close() {} });
    client.messagesReceived = messages; return client;
  });
  const send = (i, message) => arena.receive(clients[i], JSON.stringify(message));
  send(0, { type: 'create', name: 'Chủ phòng' });
  const room = clients[0].room;
  for (let i = 1; i < count; i++) send(i, { type: 'join', name: `Người ${i}`, code: room.code.toLowerCase() });
  const last = i => clients[i].messagesReceived.at(-1);
  return { arena, clients, send, room, last };
}
function match() {
  const f = fixture();
  f.send(0, { type: 'createTeam' }); f.send(1, { type: 'joinTeam', team: 'mint' }); f.send(2, { type: 'createTeam' });
  for (let i = 0; i < 3; i++) f.send(i, { type: 'ready', ready: true });
  f.send(0, { type: 'start' });
  assert.equal(f.room.phase, 'playing');
  f.players = [...f.room.players.values()];
  return f;
}
function fireAt(f, shooter, target, options = {}) {
  Object.assign(shooter, { x: 550, y: 450, hp: 100, invulnerable: 0 });
  Object.assign(target, { x: 610, y: 450, hp: 100, invulnerable: 0 }, options);
  shooter.client.lastInput = Date.now();
  shooter.input = { x: 0, y: 0, angle: 0, fire: true, reload: false, dash: false };
}

test('room codes, team capacity, unique palette and readiness are enforced on the server', () => {
  const f = fixture(5);
  assert.match(f.room.code, /^[A-HJ-NP-Z2-9]{6}$/);
  f.send(0, { type: 'createTeam' });
  f.send(1, { type: 'joinTeam', team: 'mint' }); f.send(2, { type: 'joinTeam', team: 'mint' });
  f.send(3, { type: 'joinTeam', team: 'mint' });
  assert.match(f.last(3).message, /đủ 3/); assert.equal(f.room.players.get(f.clients[3].id).team, null);
  f.send(3, { type: 'createTeam' }); f.send(4, { type: 'createTeam' });
  assert.equal(new Set(f.room.teams.map(t => t.color)).size, 3);
  f.send(1, { type: 'start' }); assert.match(f.last(1).message, /Chỉ chủ phòng/);
  f.send(0, { type: 'start' }); assert.match(f.last(0).message, /sẵn sàng/);
  f.send(1, { type: 'ready', ready: true });
  f.send(1, { type: 'joinTeam', team: 'coral' });
  assert.equal(f.room.players.get(f.clients[1].id).ready, false);
});

test('a room caps at 12 players; two teams and all ready are required', () => {
  const f = fixture(13);
  assert.equal(f.room.players.size, 12); assert.match(f.last(12).message, /đủ 12/);
  const solo = fixture(1); solo.send(0, { type: 'createTeam' }); solo.send(0, { type: 'ready', ready: true });
  solo.send(0, { type: 'start' }); assert.match(solo.last(0).message, /ít nhất 2 đội/);
});

test('invalid names, malformed packets and nonexistent rooms fail without crashing', () => {
  assert.equal(cleanName(' <Sam>\u0000\u202e '), 'Sam'); assert.equal(cleanName(null), '');
  assert.equal(Array.from(cleanName('A'.repeat(100))).length, 18);
  const f = fixture(1);
  f.arena.receive(f.clients[0], '{'); assert.equal(f.last(0).type, 'error');
  f.arena.receive(f.clients[0], 'null');
  f.send(0, { type: 'leave' }); f.send(0, { type: 'join', code: 'ZZZZZZ', name: 'Sam' });
  assert.match(f.last(0).message, /Không tìm thấy/);
});

test('joining or changing teams mid-match is rejected', () => {
  const f = match(); f.send(1, { type: 'createTeam' }); assert.match(f.last(1).message, /trận đấu đã bắt đầu/);
  let extraMessage;
  const extra = f.arena.connect({ readyState: 1, bufferedAmount: 0, send: text => { extraMessage = JSON.parse(text); } });
  f.arena.receive(extra, JSON.stringify({ type: 'join', code: f.room.code, name: 'Late' }));
  assert.match(extraMessage.message, /đang diễn ra/);
});

test('snapshots only carry overhead names for teammates', () => {
  const f = match(); f.arena.snapshot(f.room);
  const snapshot = f.last(0);
  assert.equal(snapshot.players.find(p => p.id === f.clients[1].id).name, 'Người 1');
  assert.equal(snapshot.players.find(p => p.id === f.clients[2].id).name, '');
});

test('input cannot teleport or change stats; invalid/stale inputs are ignored', () => {
  const f = match(), p = f.players[0], start = { x: p.x, y: p.y };
  f.send(0, { type: 'input', seq: 1, x: 999999, y: 0, angle: 0, hp: 9999, team: 'coral' });
  f.arena.step(1 / 60);
  assert.ok(Math.hypot(p.x - start.x, p.y - start.y) <= CONFIG.playerSpeed / 60 + .001);
  assert.equal(p.hp, 100); assert.equal(p.team, 'mint');
  f.send(0, { type: 'input', seq: 0, x: -1, y: 0, angle: 0 }); assert.equal(p.input.x, 1);
  f.send(0, { type: 'input', seq: 2, x: null, y: 0, angle: 0 }); assert.equal(p.seq, 1);
  const x = p.x; f.arena.step(1 / 60, Date.now() + 1000); assert.equal(p.x, x);
});

test('movement and dashes collide with cover and world bounds', () => {
  const wall = OBSTACLES.find(o => o.kind === 'rock'), p = { x: wall.x - 30, y: wall.y + wall.h / 2, r: 18 };
  move(p, 140, 0); assert.ok(p.x <= wall.x - p.r + .001);
  move(p, -5000, -5000); assert.ok(p.x >= WORLD.margin + p.r && p.y >= WORLD.margin + p.r);
});

test('friendly fire is ignored; enemy hits score once and victims respawn', () => {
  const f = match(), [shooter, ally, enemy] = f.players;
  fireAt(f, shooter, enemy); Object.assign(ally, { x: 580, y: 450, invulnerable: 0 });
  for (let i = 0; i < 36; i++) f.arena.step(1 / 60);
  assert.equal(ally.hp, 100); assert.equal(enemy.hp, 0); assert.equal(enemy.deaths, 1);
  assert.equal(shooter.kills, 1); assert.equal(f.room.teams[0].score, 1);
  shooter.input.fire = false;
  for (let i = 0; i < 190; i++) f.arena.step(1 / 60);
  assert.equal(enemy.hp, 100); assert.ok(enemy.invulnerable > 0); assert.equal(enemy.ammo, 30);
});

test('cover blocks projectiles before an enemy and spawn protection blocks damage', () => {
  const f = match(), [shooter, ally, enemy] = f.players;
  fireAt(f, shooter, enemy); ally.y = 100;
  const wall = OBSTACLES.find(o => o.kind === 'rock');
  Object.assign(shooter, { x: wall.x - 50, y: wall.y + wall.h / 2 });
  Object.assign(enemy, { x: wall.x + wall.w + 50, y: wall.y + wall.h / 2 });
  for (let i = 0; i < 40; i++) f.arena.step(1 / 60);
  assert.equal(enemy.hp, 100);
  f.room.bullets = []; fireAt(f, shooter, enemy, { invulnerable: 1.5 });
  for (let i = 0; i < 30; i++) f.arena.step(1 / 60);
  assert.equal(enemy.hp, 100);
});

test('reload, firing cadence and dash cooldown are server-authoritative', () => {
  const f = match(), p = f.players[0];
  p.ammo = 1; p.client.lastInput = Date.now();
  p.input = { x: 0, y: 0, angle: 0, fire: true, dash: true, reload: false };
  f.arena.step(1 / 60); assert.equal(p.ammo, 0); assert.ok(p.reload > 1); assert.ok(p.dashCooldown > 2);
  const bullets = f.room.bullets.length; p.input.dash = true;
  f.arena.step(1 / 60); assert.equal(f.room.bullets.length, bullets); assert.ok(p.dashCooldown < 2.1);
  p.input.fire = false;
  for (let i = 0; i < 75; i++) f.arena.step(1 / 60);
  assert.equal(p.ammo, 30);
});

test('held rifle fire maintains 600 RPM across simulation tick sizes', () => {
  for (const ticksPerSecond of [30, 60, 120]) {
    const f = match(), p = f.players[0], now = Date.now();
    Object.assign(p, { x: 1000, y: 1780, invulnerable: 0 });
    p.client.lastInput = now;
    p.input = { x: 0, y: 0, angle: 0, fire: true };
    for (let i = 0; i < ticksPerSecond; i++) f.arena.step(1 / ticksPerSecond, now);
    assert.equal(30 - p.ammo, 10, `${ticksPerSecond} Hz should fire ten rounds per second`);
  }
});

test('a fast rifle round hits a small target between ticks without tunnelling', () => {
  const f = match(), [shooter, ally, enemy] = f.players;
  Object.assign(shooter, { x: 1000, y: 1780, invulnerable: 0 });
  Object.assign(enemy, { x: 1630, y: 1780, invulnerable: 0 });
  ally.y = 1700;
  shooter.client.lastInput = Date.now();
  shooter.input = { x: 0, y: 0, angle: 0, fire: true };
  f.arena.step(1 / 60); shooter.input.fire = false;
  for (let i = 0; i < 9; i++) f.arena.step(1 / 60);
  assert.equal(enemy.hp, 100, 'the round has not reached the target yet');
  f.arena.step(1 / 60);
  assert.equal(enemy.hp, 100 - CONFIG.bulletDamage, 'the swept path must hit even when both endpoints miss');
  assert.equal(f.room.bullets.length, 0);
});

test('fast rounds hit thin house walls and cannot damage beyond their remaining range', () => {
  const f = match(), [shooter, ally, enemy] = f.players;
  // Both the wall and target are inside one 60-unit tick of travel.
  Object.assign(shooter, { x: 1570, y: 1608, invulnerable: 0 });
  Object.assign(enemy, { x: 1570, y: 1665, invulnerable: 0 });
  ally.y = 1700;
  shooter.client.lastInput = Date.now();
  shooter.input = { x: 0, y: 0, angle: Math.PI / 2, fire: true };
  f.arena.step(1 / 60); shooter.input.fire = false;
  assert.equal(enemy.hp, 100, 'the 14-unit wall must block a faster round');
  assert.equal(f.room.bullets.length, 0);

  Object.assign(shooter, { x: 600, y: 1780 });
  Object.assign(enemy, { x: 645, y: 1780 });
  f.room.bullets.push({ id: 1000, owner: shooter.id, team: shooter.team,
    x: 600, y: 1780, vx: CONFIG.bulletSpeed, vy: 0, life: .005 });
  f.arena.step(1 / 60);
  assert.equal(enemy.hp, 100, 'only the remaining 18 units may be swept on the final tick');
  assert.equal(f.room.bullets.length, 0);
});

test('score limit, rematch and timeout produce deterministic results', () => {
  const f = match(), [shooter, ally, enemy] = f.players;
  ally.y = 100; fireAt(f, shooter, enemy); enemy.hp = 28; f.room.teams[0].score = 19;
  for (let i = 0; i < 8; i++) f.arena.step(1 / 60);
  assert.equal(f.room.phase, 'ended'); assert.equal(f.room.result.winner, 'mint');
  f.send(2, { type: 'back' }); assert.equal(f.room.phase, 'ended');
  f.send(0, { type: 'back' }); assert.equal(f.room.phase, 'lobby');
  f.players[0].seq = 1000;
  for (let i = 0; i < 3; i++) f.send(i, { type: 'ready', ready: true });
  f.send(0, { type: 'start' }); assert.equal(f.room.phase, 'playing'); assert.equal(f.players[0].seq, -1);
  assert.equal(f.room.teams[0].score, 0); assert.equal(shooter.kills, 0);
  f.room.elapsed = RULES.duration; f.arena.step(1 / 60);
  assert.equal(f.room.phase, 'ended'); assert.equal(f.room.result.winner, null);
});

test('disconnect transfers ownership, ends a match without opponents and cleans empty rooms', () => {
  const f = match();
  f.arena.disconnect(f.clients[0]); assert.equal(f.room.host, f.clients[1].id); assert.equal(f.room.phase, 'playing');
  f.arena.disconnect(f.clients[2]); assert.equal(f.room.phase, 'ended'); assert.equal(f.room.result.winner, 'mint');
  f.send(1, { type: 'back' }); assert.equal(f.room.teams.length, 1);
  f.send(1, { type: 'ready', ready: true }); f.send(1, { type: 'start' }); assert.equal(f.room.phase, 'lobby');
  f.arena.disconnect(f.clients[1]); assert.equal(f.arena.rooms.size, 0);
});

test('independent WebSocket clients share rooms, movement and combat on the real server', { timeout: 15000 }, async t => {
  const app = createServer(); t.after(() => app.close());
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const base = `http://127.0.0.1:${app.server.address().port}`;
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await fetch(base + '/server.js')).status, 404);
  const peers = [];
  for (let i = 0; i < 3; i++) {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws', { origin: base }), messages = [];
    ws.on('message', data => messages.push(JSON.parse(data)));
    peers.push({ ws, messages, send: data => ws.send(JSON.stringify(data)) });
    await once(ws, 'open');
  }
  async function wait(i, predicate) {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const found = peers[i].messages.find(predicate); if (found) return found;
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    assert.fail(`Client ${i}: timed out waiting for protocol event`);
  }
  peers[0].send({ type: 'create', name: 'Alpha' });
  const lobby = await wait(0, m => m.type === 'room');
  peers[1].send({ type: 'join', name: 'Bravo', code: lobby.code });
  peers[2].send({ type: 'join', name: 'Charlie', code: lobby.code });
  await wait(0, m => m.type === 'room' && m.players.length === 3);
  peers[0].send({ type: 'createTeam' }); await wait(0, m => m.type === 'room' && m.teams.length === 1);
  peers[1].send({ type: 'joinTeam', team: 'mint' }); peers[2].send({ type: 'createTeam' });
  await wait(0, m => m.type === 'room' && m.teams.length === 2 && m.players.every(p => p.team));
  for (const peer of peers) peer.send({ type: 'ready', ready: true });
  await wait(0, m => m.type === 'room' && m.players.every(p => p.ready));
  peers[0].send({ type: 'start' });
  const initial = await wait(0, m => m.type === 'snapshot');
  assert.equal(initial.players.find(p => p.team === 'coral').name, '');
  const selfId = (await wait(0, m => m.type === 'hello')).id;
  // Arrange a clear firing lane; forest bases deliberately have no spawn-to-spawn sightline.
  const room = app.arena.rooms.get(lobby.code);
  for (const p of room.players.values()) {
    p.x = p.id === selfId ? 1000 : p.team === 'coral' ? 1240 : 1120;
    p.y = 1780; p.invulnerable = 0;
  }
  let seq = 0;
  const input = setInterval(() => peers[0].send({ type: 'input', seq: ++seq, x: 0, y: 0, angle: 0, fire: true }), 40);
  t.after(() => clearInterval(input));
  const hit = await wait(2, m => m.type === 'snapshot' && m.players.some(p => p.team === 'coral' && p.hp < 100));
  assert.ok(hit.players.some(p => p.team === 'coral' && p.hp < 100));
  const scored = await wait(0, m => m.type === 'snapshot' && m.teams.some(team => team.score > 0));
  assert.equal(scored.teams.find(t => t.id === 'mint').score, 1);
  clearInterval(input);
  peers[0].send({ type: 'input', seq: ++seq, x: 1, y: 0, angle: 0, fire: false });
  await wait(1, m => m.type === 'snapshot' && m.players.find(p => p.id === selfId).x > 1010);
  peers[0].ws.close();
  await wait(1, m => m.type === 'room' && m.host !== selfId);
  peers[2].ws.close();
  const ended = await wait(1, m => m.type === 'room' && m.phase === 'ended');
  assert.equal(ended.result.winner, 'mint');
});

test('only one player collects each pickup and snapshots agree; items respawn per room', () => {
  const f=match(),[a,b]=f.players, item=f.room.pickups.find(p=>p.type==='health');
  Object.assign(a,{x:item.x,y:item.y,hp:50});Object.assign(b,{x:item.x,y:item.y,hp:50});
  f.arena.step(1/60);
  assert.equal(a.hp,85);assert.equal(b.hp,50);assert.ok(item.cooldown>24);
  f.arena.snapshot(f.room);
  for(let i=0;i<3;i++)assert.ok(!f.last(i).pickups.some(p=>p.id===item.id));
  assert.equal(f.last(0).events.filter(e=>e.type==='pickup'&&e.item===item.id).length,1);
  const other=match();assert.equal(other.room.pickups.find(p=>p.id===item.id).cooldown,0);
  a.x=b.x=1000;a.y=b.y=1780;
  for(let i=0;i<26;i++)f.arena.step(1);
  f.arena.snapshot(f.room);assert.ok(f.last(0).pickups.some(p=>p.id===item.id));
});

test('rapid-fire loot increases authoritative cadence, expires and resets on respawn/rematch', () => {
  const f=match(),p=f.players[0],item=f.room.pickups.find(p=>p.type==='rapid');
  Object.assign(p,{x:item.x,y:item.y,invulnerable:0});f.arena.step(1/60);
  assert.equal(p.rapid,10);assert.ok(item.cooldown>0);
  p.x=1000;p.y=1780;p.client.lastInput=Date.now();p.input={x:0,y:0,angle:0,fire:true};
  for(let i=0;i<60;i++)f.arena.step(1/60);
  const boosted=30-p.ammo;
  assert.ok(boosted>=17&&boosted<=18);
  f.arena.snapshot(f.room);assert.ok(f.last(0).players.find(x=>x.id===p.id).rapid>8);
  p.input.fire=false;for(let i=0;i<10;i++)f.arena.step(1);
  assert.equal(p.rapid,0);
  p.ammo=30;p.reload=0;p.fireCooldown=0;p.client.lastInput=Date.now();p.input.fire=true;
  for(let i=0;i<60;i++)f.arena.step(1/60);
  assert.ok(30-p.ammo<boosted);
  p.rapid=8;f.arena.spawn(f.room,p);assert.equal(p.rapid,0);
  f.arena.finish(f.room,'test');f.send(0,{type:'back'});
  for(let i=0;i<3;i++)f.send(i,{type:'ready',ready:true});f.send(0,{type:'start'});
  assert.ok(f.room.pickups.every(p=>p.cooldown===0));
});
