'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { buildStatic } = require('../scripts/build-static');

test('Vercel build serves the game as static files without publishing server code', t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-deploy-test-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  buildStatic({ output });
  const files = fs.readdirSync(output);
  assert.ok(files.includes('index.html'));
  assert.ok(!files.includes('server.js')); assert.ok(!files.includes('api'));
  assert.ok(!files.includes('runtime-config.js'));
  const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  for (const [, script] of html.matchAll(/<script src="([^"]+)"/g)) assert.ok(files.includes(script), script);
  for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(code);
  const config = require('../vercel.json');
  assert.equal(config.framework, null);
  assert.equal(config.fluid, true);
  assert.equal(config.functions['api/ws.mjs'].maxDuration, 300);
});

test('the actual Vercel export accepts same-site WebSockets, room joins and gameplay', { timeout: 8000 }, async t => {
  const { default: server } = await import('../api/ws.mjs');
  // Regression: Vercel must receive an HTTP server, not the old object of helpers.
  assert.ok(server instanceof http.Server);
  assert.equal(server.listening, false);
  const clients = [];
  t.after(async () => {
    const closed = clients.map(ws => ws.readyState === WebSocket.CLOSED ? Promise.resolve() : once(ws, 'close'));
    for (const ws of clients) ws.terminate();
    await Promise.all(closed);
    await new Promise(resolve => server.close(resolve));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(base + '/api/ws');
  assert.equal(health.status, 426);
  assert.equal((await health.json()).endpoint, '/api/ws');
  assert.equal((await fetch(base + '/server.js')).status, 404);
  async function peer(endpoint) {
    const ws = new WebSocket(base.replace('http:', 'ws:') + endpoint, { origin: base }), messages = [];
    ws.on('message', bytes => messages.push(JSON.parse(bytes))); clients.push(ws);
    await once(ws, 'open');
    return { ws, messages, send: value => ws.send(JSON.stringify(value)) };
  }
  async function wait(peer, predicate) {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const message = peer.messages.find(predicate); if (message) return message;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail('Timed out waiting for WebSocket state');
  }
  const a = await peer('/api/ws'), b = await peer('/ws');
  const hello = await wait(a, m => m.type === 'hello');
  assert.equal(hello.inviteBase, null); // No internal LAN/IP links on Vercel.
  a.send({ type: 'create', name: 'Vercel Alpha' });
  const room = await wait(a, m => m.type === 'room');
  b.send({ type: 'join', name: 'Vercel Bravo', code: room.code });
  await wait(a, m => m.type === 'room' && m.players.length === 2);
  a.send({ type: 'createTeam' }); await wait(a, m => m.type === 'room' && m.teams.length === 1);
  b.send({ type: 'createTeam' }); await wait(a, m => m.type === 'room' && m.teams.length === 2);
  a.send({ type: 'ready', ready: true }); b.send({ type: 'ready', ready: true });
  await wait(a, m => m.type === 'room' && m.players.every(p => p.ready));
  a.send({ type: 'start' });
  const initial = await wait(a, m => m.type === 'snapshot');
  const self = initial.players.find(p => p.id === hello.id);
  assert.equal(initial.players.find(p => p.id !== hello.id).name, '');
  a.send({ type: 'input', seq: 1, x: 1, y: 0, angle: 0 });
  await wait(b, m => m.type === 'snapshot' && m.players.find(p => p.id === hello.id).x > self.x + 5);
  for (const origin of ['https://foreign.example', 'null']) {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/api/ws', { origin });
    ws.on('error', () => {});
    const [error] = await once(ws, 'error'); assert.match(error.message, /403/);
  }
});
