'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const S = require('../shared');

// Exercise the browser's actual visual-only helper without constructing its lobby DOM.
const clientSource = fs.readFileSync(require.resolve('../multiplayer'), 'utf8');
const helperSource = clientSource.match(/  function advanceVisualShots\(dt\) \{[\s\S]*?\n  \}/)[0];
function visualShot(x, y, vx, vy) {
  const shot = { x, y, vx, vy, extrapolationLeft: 1 / S.RULES.snapshotRate };
  const context = { NeonShared: S, net: { shots: [shot] } };
  vm.runInNewContext(helperSource, context);
  return { shot, net: context.net, advance: context.advanceVisualShots };
}

test('client extrapolation hides a fast round before it crosses a thin house wall', () => {
  const { net, advance } = visualShot(1570, 1608, 0, S.CONFIG.bulletSpeed);
  advance(1 / 60);
  assert.equal(net.shots.length, 0, 'the visible round must stop at the same wall as the server');
});

test('client extrapolation cannot run beyond one snapshot interval during a stall', () => {
  const { shot, net, advance } = visualShot(1000, 1780, S.CONFIG.bulletSpeed, 0);
  advance(.25);
  assert.equal(shot.x, 1180, 'a stalled frame may only predict 50 ms of travel');
  assert.equal(shot.y, 1780);
  advance(1 / 60);
  assert.equal(net.shots.length, 0, 'stale projectiles should disappear instead of hanging in midair');
  assert.equal(shot.x, 1180);
});

test('client visual travel is smooth and bounded across ordinary frames', () => {
  const { shot, net, advance } = visualShot(1000, 1780, S.CONFIG.bulletSpeed, 0);
  advance(1 / 60); assert.equal(shot.x, 1060);
  advance(1 / 60); assert.equal(shot.x, 1120);
  advance(1 / 60); assert.equal(shot.x, 1180);
  advance(1 / 60); assert.equal(net.shots.length, 0);
});
