'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const S = require('../shared');
const intersects = (x,y,r) => S.OBSTACLES.some(o => Math.hypot(x-S.clamp(x,o.x,o.x+o.w),y-S.clamp(y,o.y,o.y+o.h)) < r);

test('forest geometry and terrain agree in the browser and the room simulation', () => {
  const browser = {}; vm.runInNewContext(fs.readFileSync(require.resolve('../shared'), 'utf8'), browser);
  assert.equal(JSON.stringify(browser.NeonShared.OBSTACLES), JSON.stringify(S.OBSTACLES));
  for (const [x,y] of [...S.SPAWNS, [S.LAKE.x,S.LAKE.y], [S.BRIDGE.x+100,S.BRIDGE.y+40]]) {
    assert.equal(browser.NeonShared.surfaceHeight(x,y),S.surfaceHeight(x,y));
    const a={x,y,r:18},b={...a};S.move(a,20,10);browser.NeonShared.move(b,20,10);assert.deepEqual(a,b);
  }
});

test('every respawn slot is dry, collision-free and connected to the main paths', () => {
  const size=40,cols=Math.ceil(S.WORLD.width/size),rows=Math.ceil(S.WORLD.height/size);
  const walk=new Uint8Array(cols*rows),seen=new Set(),queue=[];
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++) {
    const px=x*size+20,py=y*size+20;
    walk[y*cols+x]=px>S.WORLD.margin+31&&py>S.WORLD.margin+31&&px<S.WORLD.width-S.WORLD.margin-31&&py<S.WORLD.height-S.WORLD.margin-31&&!S.OBSTACLES.some(o=>px>o.x-31&&px<o.x+o.w+31&&py>o.y-31&&py<o.y+o.h+31);
  }
  const cell=(x,y)=>Math.floor(y/size)*cols+Math.floor(x/size);
  queue.push(cell(S.SOLO_SPAWN.x,S.SOLO_SPAWN.y));seen.add(queue[0]);
  for(let head=0;head<queue.length;head++) {
    const i=queue[head],x=i%cols,y=Math.floor(i/cols);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx,ny=y+dy,j=ny*cols+nx;
      if(nx<0||ny<0||nx>=cols||ny>=rows||!walk[j]||seen.has(j))continue;
      seen.add(j);queue.push(j);
    }
  }
  for(const [x,y] of S.SPAWNS)for(const [dx,dy] of [[0,0],[0,-48],[0,48],[-48,0],[48,0]]) {
    assert.equal(intersects(x+dx,y+dy,28),false,'spawn intersects cover');
    assert.equal(S.inWater(x+dx,y+dy),false,'spawn submerged');
    assert.ok(seen.has(cell(x+dx,y+dy)),'spawn cannot reach the rest of the map');
  }
  for(const h of S.HOUSES)assert.ok(seen.has(cell(h.x+h.w/2,h.y+h.h/2)),`${h.id}: bots cannot navigate through doorway`);
  for(const item of S.LOOT)assert.ok(seen.has(cell(item.x,item.y)),`${item.id}: pickup is unreachable`);
});

test('lake remains crossable but the bridge preserves normal walking and dash speed', () => {
  const water={x:S.LAKE.x,y:S.LAKE.y,r:18};assert.ok(S.inWater(water.x,water.y));
  S.move(water,100,0);assert.ok(Math.abs(water.x-S.LAKE.x-62)<.001);
  const bridge={x:S.LAKE.x,y:S.BRIDGE.y+S.BRIDGE.h/2,r:18};assert.equal(S.inWater(bridge.x,bridge.y),false);
  S.move(bridge,100,0);assert.ok(Math.abs(bridge.x-S.LAKE.x-100)<.001);
  assert.equal(S.surfaceHeight(bridge.x,bridge.y),S.BRIDGE.height);
});

test('tree trunks stop a fast dash and a bullet using the same footprint', () => {
  const tree=S.OBSTACLES.find(o=>o.kind==='tree'&&o.x>300&&o.y>300&&!intersects(o.x-40,o.y+o.h/2,18));
  const y=tree.y+tree.h/2,p={x:tree.x-40,y,r:18};
  assert.equal(intersects(p.x,p.y,p.r),false);
  S.move(p,150,0);assert.ok(p.x<=tree.x-p.r+.001);
  assert.notEqual(S.segmentRect(tree.x-40,y,tree.x+tree.w+40,y,tree),null);
});

test('houses have usable doors, solid walls and clear pickup positions', () => {
  assert.ok(S.TREES.length < 260, 'forest should be substantially more open');
  assert.equal(new Set(S.LOOT.map(p=>p.id)).size,S.LOOT.length,'pickup IDs must be unique');
  for (const h of S.HOUSES) {
    const p={x:h.x+h.w/2,y:h.y+h.h+60,r:18};
    S.move(p,0,-h.h-120);
    assert.ok(Math.abs(p.y-(h.y-60))<.01,`${h.id}: cannot walk through both doors`);
    assert.equal(S.OBSTACLES.some(o=>S.segmentRect(h.x+h.w/2,h.y-40,h.x+h.w/2,h.y+h.h+40,o)!==null),false);
    const wall={x:h.x-35,y:h.y+h.h/2,r:18};S.move(wall,150,0);
    assert.ok(wall.x<=h.x-18+.001,`${h.id}: wall permits walking through`);
    const pose=S.thirdPersonCamera({x:h.x+40,y:h.y+h.h/2,angle:0});
    assert.equal(pose.inside,h.id);assert.ok(pose.x>h.x+h.wall,'camera crossed an interior wall');
    assert.ok(pose.distance<145,'camera should shorten near a wall');
    for(const item of S.LOOT.filter(item=>item.id.startsWith(h.id+'-'))) {
      assert.equal(intersects(item.x,item.y,18),false);assert.equal(S.inWater(item.x,item.y),false);
      assert.equal(S.houseAt(item.x,item.y)?.id,h.id);
    }
  }
});

test('pickups cannot be collected through walls, by dead players or at full health', () => {
  const h=S.HOUSES[0],item={x:h.x+20,y:h.y+h.h/2,type:'health',cooldown:0};
  const p={x:h.x-20,y:item.y,r:18,hp:50,rapid:0};
  assert.equal(S.collectPickup(p,item),null);assert.equal(p.hp,50);
  p.x=item.x;p.hp=100;assert.equal(S.collectPickup(p,item),null);assert.equal(item.cooldown,0);
  p.hp=0;assert.equal(S.collectPickup(p,{...item,type:'rapid'}),null);
  p.hp=80;assert.deepEqual(S.collectPickup(p,item),{type:'health',amount:20});assert.equal(p.hp,100);
  assert.equal(S.collectPickup(p,item),null);
});
