/* Shared arena and movement rules: used by the server and browser prediction. */
(function (root) {
  'use strict';
  const WORLD = { width: 5600, height: 4200, margin: 48, name: 'DUYÊN HẢI — TRẠM ĐIỆN' };
  // One body scale for geometry, movement, hit detection and both camera modes.
  const ACTOR_SCALE = .392;
  const ACTOR = { scale: ACTOR_SCALE, radius: 18 * ACTOR_SCALE,
    height: 92 * ACTOR_SCALE, tankHeight: 99 * ACTOR_SCALE,
    muzzleHeight: 58 * ACTOR_SCALE, eyeHeight: 78 * ACTOR_SCALE,
    shoulderHeight: 68 * ACTOR_SCALE };
  const CONFIG = {
    playerSpeed: 285, maxHealth: 100, magazine: 30,
    // Rifle: 600 rounds/minute; fast travel with a finite 2160-unit reach.
    bulletSpeed: 3600, bulletLifetime: .6, bulletDamage: 28, fireInterval: .1,
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
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const SPAWNS = [[770, 1450], [4480, 3300], [2850, 560], [1980, 3470]];
  const SOLO_SPAWN = { x: 3200, y: 3240, angle: -1.31 };
  // The reservoir remains inland; the eastern shore opens onto the sea.
  const LAKE = { x: 2330, y: 1130, rx: 560, ry: 430, level: 5 };
  const BRIDGE = { x: 1720, y: 1160, w: 1230, h: 92, height: 24 };
  const COAST = { level: 5, beachWidth: 145, shelfDepth: 12 };
  const QUARRY = { x: 2150, y: 2540, rx: 465, ry: 390, floor: 8,
    benchHeight: 18, benches: [.32, .56, .79], rampAngle: Math.PI / 2, rampWidth: .48 };
  const coastX = y => 5020 + Math.sin(y * .00145 + .4) * 135 + Math.sin(y * .0038) * 60;
  const coastDistance = (x, y) => coastX(y) - x;
  const quarryDistance = (x, y) => Math.hypot((x-QUARRY.x)/QUARRY.rx,(y-QUARRY.y)/QUARRY.ry);
  const lakeDistance = (x, y) => Math.hypot((x - LAKE.x) / LAKE.rx, (y - LAKE.y) / LAKE.ry);
  const onBridge = (x, y) => x >= BRIDGE.x && x <= BRIDGE.x + BRIDGE.w && y >= BRIDGE.y && y <= BRIDGE.y + BRIDGE.h;
  const HOUSES = [
    { id: 'ranger', name: 'TRẠM QUẢN LÝ HỒ', x: 1510, y: 1370, w: 300, h: 270, color: '#b9ad94', style: 'plaster' },
    { id: 'west', name: 'NHÀ GẠCH PHÍA TÂY', x: 670, y: 870, w: 300, h: 240, color: '#a27861', style: 'brick' },
    { id: 'lake', name: 'NHÀ VEN HỒ', x: 2820, y: 1620, w: 330, h: 250, color: '#c1b99e', style: 'plaster' },
    { id: 'south', name: 'TRẠM TIẾP TẾ', x: 1130, y: 1940, w: 300, h: 250, color: '#a7afb3', style: 'plaster' },
    { id: 'north', name: 'NHÀ TRÊN ĐỒI', x: 2010, y: 360, w: 300, h: 240, color: '#a27f68', style: 'brick' },
    { id: 'camp', name: 'NHÀ ĐI SĂN', x: 480, y: 1870, w: 320, h: 250, color: '#a4ad86', style: 'plaster' },
    { id: 'power-office', name: 'NHÀ ĐIỀU HÀNH', x: 3200, y: 2460, w: 340, h: 270, color: '#a59a83', style: 'brick' },
    { id: 'workshop', name: 'XƯỞNG BẢO TRÌ', x: 3910, y: 2640, w: 350, h: 270, color: '#979d97', style: 'industrial' },
    { id: 'pumping', name: 'TRẠM BƠM VEN BIỂN', x: 4390, y: 1890, w: 300, h: 240, color: '#b89d81', style: 'brick' },
    { id: 'farm', name: 'NÔNG TRẠI PHÍA NAM', x: 1030, y: 3220, w: 300, h: 240, color: '#b6a68c', style: 'plaster' }
  ].map(h => ({ ...h, wall: 14, door: 112, height: 120 }));
  const houseAt = (x, y, padding = 0) => HOUSES.find(h => x > h.x - padding && x < h.x + h.w + padding && y > h.y - padding && y < h.y + h.h + padding);
  const ROADS = [
    { id: 'main', width: 108, points: [[100,1780],[2500,1780],[2790,2030],[3190,2180],[3710,2180],[4310,2300],[4720,2510]] },
    { id: 'reservoir', width: 82, points: [[220,1206],[1720,1206],[2950,1206],[3070,1120],[3400,1120],[4400,1050],[4720,1450]] },
    { id: 'coastal', width: 102, points: [[4360,160],[4440,670],[4650,1120],[4760,1660],[4730,2240],[4670,2810],[4700,3350],[4440,4050]] },
    { id: 'south', width: 92, points: [[280,2820],[1280,2870],[1970,3080],[2590,3390],[3170,3460],[3940,3330],[4700,3350]] },
    { id: 'west-link', width: 78, points: [[540,260],[450,700],[470,1206],[1030,1780],[990,2560],[1160,2870],[1180,3650],[1580,4030]] },
    { id: 'north-link', width: 72, points: [[1200,260],[1310,730],[1590,1050],[1735,1206]] },
    { id: 'yard-entry', width: 86, points: [[3640,2180],[3650,2460],[3680,3010],[3500,3420]] },
    { id: 'power-access', width: 78, points: [[3140,1120],[3230,1430],[3230,1910],[3190,2180]] }
  ];
  const segmentDistance = (x, y, a, b) => {
    const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1),0,1);
    return Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t);
  };
  const roadSegments=ROADS.flatMap(r=>r.points.slice(1).map((b,i)=>[r.points[i],b]));
  function roadDistance(x,y) {
    let nearest=Infinity;
    for(const [a,b] of roadSegments)nearest=Math.min(nearest,segmentDistance(x,y,a,b));
    return nearest;
  }
  function pathDistance(x,y) {
    let nearest=roadDistance(x,y);
    for(const h of HOUSES)nearest=Math.min(nearest,Math.hypot(x-h.x-h.w/2,Math.max(h.y-115-y,0,y-h.y-h.h-150)));
    return nearest;
  }
  const INDUSTRIAL = {
    pad: { x: 3010, y: 1120, w: 1600, h: 1940, height: 38 },
    towers: [
      { id: 'cooling-main', x: 3580, y: 1650, radius: 235, height: 820, floor: 38 },
      { id: 'cooling-ruin', x: 4180, y: 1470, radius: 182, height: 525, ruined: true, floor: 38 }
    ],
    props: [
      { id: 'chimney', kind: 'chimney', x: 4350, y: 1190, w: 65, h: 65, height: 665, color: '#ab5d48' },
      { id: 'warehouse', kind: 'warehouse', x: 3870, y: 1860, w: 340, h: 220, height: 170, color: '#747b77' },
      { id: 'tank-a', kind: 'tank', x: 3280, y: 1930, w: 90, h: 90, height: 130, color: '#9a9b8f' },
      { id: 'tank-b', kind: 'tank', x: 3410, y: 1930, w: 90, h: 90, height: 130, color: '#838d88' },
      { id: 'container-red', kind: 'container', x: 3090, y: 2310, w: 175, h: 73, height: 78, color: '#a25442' },
      { id: 'container-blue', kind: 'container', x: 3340, y: 2290, w: 175, h: 73, height: 78, color: '#5b7279' },
      { id: 'container-grey', kind: 'container', x: 4380, y: 2540, w: 175, h: 73, height: 78, color: '#85897b' },
      { id: 'container-olive', kind: 'container', x: 3790, y: 3100, w: 175, h: 73, height: 78, color: '#797d5a' },
      { id: 'transformer-a', kind: 'transformer', x: 3900, y: 2370, w: 86, h: 105, height: 100, color: '#818c82' },
      { id: 'transformer-b', kind: 'transformer', x: 4060, y: 2370, w: 86, h: 105, height: 100, color: '#818c82' },
      { id: 'transformer-c', kind: 'transformer', x: 4210, y: 2370, w: 86, h: 105, height: 100, color: '#818c82' },
      { id: 'generator-a', kind: 'generator', x: 3650, y: 1960, w: 115, h: 65, height: 58, color: '#757a61' },
      { id: 'generator-b', kind: 'generator', x: 4440, y: 2660, w: 115, h: 65, height: 58, color: '#757a61' },
      { id: 'pylon-west', kind: 'pylon', x: 1450, y: 2520, w: 74, h: 74, height: 395 },
      { id: 'pylon-mid', kind: 'pylon', x: 2500, y: 2750, w: 74, h: 74, height: 395 },
      { id: 'pylon-yard', kind: 'pylon', x: 3740, y: 2500, w: 74, h: 74, height: 395 },
      { id: 'pylon-east', kind: 'pylon', x: 4510, y: 3090, w: 74, h: 74, height: 395 }
    ]
  };
  const smooth = t => { t=clamp(t,0,1);return t*t*(3-2*t); };
  const distanceToRect = (x,y,r) => Math.hypot(Math.max(r.x-x,0,x-r.x-r.w),Math.max(r.y-y,0,y-r.y-r.h));
  function naturalGroundHeight(x, y) {
    const hills=49+Math.sin(x*.00135+.35)*Math.cos(y*.00165)*31+Math.sin(x*.0031+y*.0018)*12+Math.cos(y*.0038-x*.0014)*7;
    const lakeShore=smooth((lakeDistance(x,y)-.84)/.29);
    let height=-12+(hills+12)*lakeShore;
    const quarryRadius=quarryDistance(x,y);
    if(quarryRadius<1) {
      const outer=height,terraces=QUARRY.floor+18*smooth((quarryRadius-.32)/.09)+18*smooth((quarryRadius-.56)/.09);
      const bench=terraces+(outer-QUARRY.floor-36)*smooth((quarryRadius-.79)/.21);
      const angle=Math.atan2((y-QUARRY.y)/QUARRY.ry,(x-QUARRY.x)/QUARRY.rx);
      const ramp=smooth((QUARRY.rampWidth-Math.abs(Math.atan2(Math.sin(angle-QUARRY.rampAngle),Math.cos(angle-QUARRY.rampAngle))))/.24);
      height=bench*(1-ramp)+(QUARRY.floor+(outer-QUARRY.floor)*smooth(quarryRadius))*ramp;
    }
    // Broad graded shoulders keep the bridge and industrial yard connected to the hills.
    if(x>BRIDGE.x-170&&x<BRIDGE.x+BRIDGE.w+170) {
      const ramp=smooth(1-distanceToRect(x,y,{x:BRIDGE.x-40,y:BRIDGE.y-5,w:BRIDGE.w+80,h:BRIDGE.h+10})/135);
      if(!inLakeInterior(x,y))height=height*(1-ramp)+22*ramp;
    }
    const padBlend=smooth(1-distanceToRect(x,y,INDUSTRIAL.pad)/180);
    height=height*(1-padBlend)+INDUSTRIAL.pad.height*padBlend;
    const coast=smooth((coastDistance(x,y)+COAST.beachWidth*.15)/COAST.beachWidth);
    return -COAST.shelfDepth+(height+COAST.shelfDepth)*coast;
  }
  const inLakeInterior = (x,y) => lakeDistance(x,y)<.985;
  for(const h of HOUSES)h.floor=naturalGroundHeight(h.x+h.w/2,h.y+h.h/2)+2;
  function groundHeight(x, y) {
    const h=houseAt(x,y,30);
    if(h)return h.floor-2;
    // Short slopes around foundations remove abrupt steps at a house's flat plot.
    const near=HOUSES.find(h=>distanceToRect(x,y,h)<85);
    const height=naturalGroundHeight(x,y);
    if(!near)return height;
    const blend=smooth((85-distanceToRect(x,y,near))/55);
    return height*(1-blend)+(near.floor-2)*blend;
  }
  const surfaceHeight=(x,y)=>houseAt(x,y)?.floor??(onBridge(x,y)?BRIDGE.height:groundHeight(x,y));
  const inWater=(x,y)=>!onBridge(x,y)&&groundHeight(x,y)<LAKE.level-1;
  for(const prop of INDUSTRIAL.props)prop.base=groundHeight(prop.x+prop.w/2,prop.y+prop.h/2);
  // Fixed seed: browser prediction, solo bots and room simulation share identical cover.
  let seed=71329;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const TREES=[],ROCKS=[],OBSTACLES=[];
  for(const y of [BRIDGE.y-8,BRIDGE.y+BRIDGE.h])OBSTACLES.push({x:BRIDGE.x+12,y,w:BRIDGE.w-24,h:8,height:34,base:BRIDGE.height,kind:'bridge'});
  for(const h of HOUSES) {
    const wing=(h.w-h.door)/2;
    const wall=(x,y,w,depth)=>OBSTACLES.push({x,y,w,h:depth,height:h.height,base:h.floor,kind:'house',house:h.id});
    wall(h.x,h.y,h.wall,h.h);wall(h.x+h.w-h.wall,h.y,h.wall,h.h);
    for(const y of [h.y,h.y+h.h-h.wall]) {wall(h.x,y,wing,h.wall);wall(h.x+wing+h.door,y,wing,h.wall);}
    for(const x of [h.x+26,h.x+h.w-78])OBSTACLES.push({x,y:h.y+28,w:52,h:38,height:96,base:h.floor,kind:'furniture',house:h.id});
  }
  for(const tower of INDUSTRIAL.towers) {
    // Joined narrow strips follow the round foundation without an invisible square fence.
    const rows=12,depth=tower.radius*2/rows;
    for(let i=0;i<rows;i++) {
      const dy=-tower.radius+(i+.5)*depth,half=Math.sqrt(tower.radius*tower.radius-dy*dy);
      OBSTACLES.push({x:tower.x-half,y:tower.y-tower.radius+i*depth,w:half*2,h:depth,height:tower.ruined?100:50,base:tower.floor,kind:'tower',landmark:tower.id});
    }
  }
  for(const p of INDUSTRIAL.props)OBSTACLES.push({...p,kind:'industrial',propKind:p.kind});
  function clearing(x,y,padding=0) {
    return houseAt(x,y,95+padding)||pathDistance(x,y)<84+padding||lakeDistance(x,y)<1.14+padding/500||coastDistance(x,y)<170+padding||
      distanceToRect(x,y,INDUSTRIAL.pad)<95+padding||quarryDistance(x,y)<1.13+padding/430||
      SPAWNS.some(([sx,sy])=>Math.hypot(x-sx,y-sy)<180+padding)||Math.hypot(x-SOLO_SPAWN.x,y-SOLO_SPAWN.y)<220+padding||
      // Clear training lanes are also used by the existing combat checks.
      (x>440-padding&&x<780+padding&&y>345-padding&&y<535+padding);
  }
  for(let y=140;y<WORLD.height-100;y+=225)for(let x=140;x<WORLD.width-100;x+=225) {
    const tx=x+(random()-.5)*100,ty=y+(random()-.5)*100;
    const grove=.5+.5*Math.sin(tx*.0018+.6)*Math.cos(ty*.0021);
    if(clearing(tx,ty)||random()>.7+grove*.25)continue;
    const radius=9+random()*6,height=155+random()*125;
    const tree={x:tx,y:ty,radius,height,crown:45+random()*28,pine:random()>.66,shade:random()};
    TREES.push(tree);OBSTACLES.push({x:tx-radius,y:ty-radius,w:radius*2,h:radius*2,height,kind:'tree'});
  }
  for(let i=0;i<155;i++) {
    const x=180+random()*(WORLD.width-360),y=180+random()*(WORLD.height-360);
    const w=48+random()*70,h=44+random()*55;
    if(clearing(x,y,36)||OBSTACLES.some(o=>x+w/2+28>o.x&&x-w/2-28<o.x+o.w&&y+h/2+28>o.y&&y-h/2-28<o.y+o.h))continue;
    const rock={x:x-w/2,y:y-h/2,w,h,height:45+random()*70,kind:'rock'};
    ROCKS.push(rock);OBSTACLES.push(rock);
  }
  for(const [x,y,w,h,height] of [[2070,2420,85,60,42],[2240,2500,70,55,36],[1900,2400,110,65,50],
    [2310,2300,95,72,56],[2400,2580,86,75,46],[1900,2680,95,65,40]]) {
    const rock={x,y,w,h,height,kind:'rock',quarry:true};
    ROCKS.push(rock);OBSTACLES.push(rock);
  }
  // Match the tapered cooling shells and broken silhouette above their solid foundations.
  // Group bounds keep these detailed covers out of ordinary movement and distant ray checks.
  const LANDMARK_COVER=INDUSTRIAL.towers.map(tower=>{
    const {x,y,radius:r,height:h,floor}=tower,parts=[],segments=40,levels=8;
    const radiusAt=t=>r*(1-.38*Math.sin(Math.min(1,t*1.18)*Math.PI/2)+.13*Math.pow(t,6));
    const topAt=a=>tower.ruined?Math.max(.2,Math.min(1,.57+Math.sin(a*3.4)*.22+Math.cos(a*7.2)*.18+Math.sin(a*13.6)*.06)):1;
    const bottom=tower.ruined?15:50;
    for(let i=0;i<segments;i++)for(let j=0;j<levels;j++) {
      const points=[];
      for(const angle of [i/segments*Math.PI*2,(i+.5)/segments*Math.PI*2,(i+1)/segments*Math.PI*2])for(const t of [j/levels,(j+1)/levels]){
        const v=t*topAt(angle),radius=radiusAt(v);
        points.push([x+Math.cos(angle)*radius,y+Math.sin(angle)*radius,floor+bottom+v*(h-bottom)]);
      }
      const minX=Math.min(...points.map(p=>p[0]))-3,maxX=Math.max(...points.map(p=>p[0]))+3;
      const minY=Math.min(...points.map(p=>p[1]))-3,maxY=Math.max(...points.map(p=>p[1]))+3;
      const minZ=Math.min(...points.map(p=>p[2])),maxZ=Math.max(...points.map(p=>p[2]));
      parts.push({x:minX,y:minY,w:maxX-minX,h:maxY-minY,base:minZ,height:maxZ-minZ});
    }
    return {bounds:{x:x-r-16,y:y-r-16,w:r*2+32,h:r*2+32,base:floor,height:h+8},parts};
  });
  for(const p of INDUSTRIAL.props.filter(p=>p.kind==='warehouse')) {
    const rise=Math.min(35,p.height*.22),parts=[],width=p.w+16,sections=10;
    for(let i=0;i<sections;i++) {
      const a=i/sections,b=(i+1)/sections,peak=Math.min(Math.abs(a-.5),Math.abs(b-.5));
      parts.push({x:p.x-8+a*width,y:p.y-8,w:width/sections,h:p.h+16,base:p.base+p.height,height:rise*(1-peak*2)+2});
    }
    LANDMARK_COVER.push({bounds:{x:p.x-8,y:p.y-8,w:width,h:p.h+16,base:p.base+p.height,height:rise+2},parts});
  }
  const PICKUP_RULES = { health: 35, rapidDuration: 10, rapidMultiplier: 1.75, respawn: 25 };
  const LOOT = HOUSES.flatMap(h => [
    { id: `${h.id}-health`, x: h.x + h.w / 2 - 67, y: h.y + h.h - 70, type: 'health' },
    { id: `${h.id}-rapid`, x: h.x + h.w / 2 + 67, y: h.y + h.h - 70, type: 'rapid' }
  ]).concat([
    { id: 'trail-rapid', x: 3220, y: 3150, type: 'rapid' },
    { id: 'trail-health', x: 3100, y: 3240, type: 'health' },
    { id: 'field-west-health', x: 1020, y: 1206, type: 'health' },
    { id: 'field-east-rapid', x: 3040, y: 1206, type: 'rapid' },
    { id: 'yard-health', x: 3620, y: 2290, type: 'health' },
    { id: 'coast-rapid', x: 4690, y: 2890, type: 'rapid' },
    { id: 'quarry-health', x: 2150, y: 2660, type: 'health' }
  ]);
  const createPickups = () => LOOT.map(p => ({ ...p, cooldown: 0, persistent: true, phase: 0, life: Infinity }));
  function collectPickup(player, item) {
    if (player.hp <= 0 || item.cooldown > 0 || Math.hypot(player.x - item.x, player.y - item.y) > CONFIG.pickupRadius + player.r) return null;
    if (OBSTACLES.some(o => segmentRect(player.x, player.y, item.x, item.y, o) !== null)) return null;
    let amount;
    if (item.type === 'health') {
      amount = Math.min(PICKUP_RULES.health, CONFIG.maxHealth - player.hp);
      if (amount <= 0) return null;
      player.hp += amount;
    } else if (item.type === 'rapid') {
      player.rapid = PICKUP_RULES.rapidDuration; amount = PICKUP_RULES.rapidDuration;
    } else return null;
    item.cooldown = PICKUP_RULES.respawn;
    return { type: item.type, amount };
  }
  // Clip the third-person spring arm against solid cover in 3D, including house walls.
  function thirdPersonCamera(player) {
    const inside = houseAt(player.x, player.y), ads = !!player.aiming;
    const ground = surfaceHeight(player.x, player.y);
    // Aim through the optic at eye height. Keep the camera inside the player's safe
    // footprint so raising the weapon beside a wall cannot reveal the other side.
    if (ads) return { x: player.x, y: player.y, height: ground + ACTOR.eyeHeight, distance: 0, inside: inside?.id || null };
    // Frame the upper body from the right shoulder: helmet just below the reticle,
    // hips at the bottom edge. Use body-relative distances so changing world scale
    // cannot turn this view into a distant, full-body chase camera again.
    // The server uses this exact pose to converge bullets onto the camera reticle.
    const distance = ACTOR.height * (inside ? 1.5 : 1.75);
    const start = { x: player.x, y: player.y, height: ground + ACTOR.shoulderHeight };
    const pitch=clamp(player.pitch || 0,-.75,.75),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const fx = Math.cos(player.angle), fy = Math.sin(player.angle);
    const lift=ACTOR.height*(inside?1.06:1.09)-ACTOR.muzzleHeight;
    const shoulder=ACTOR.height*(inside?.14:.16);
    const clearance=ACTOR.radius*.45;
    const end = { x: player.x - fx * (distance*cp+lift*sp) - fy * shoulder,
      y: player.y - fy * (distance*cp+lift*sp) + fx * shoulder, height: ground + ACTOR.muzzleHeight - distance*sp+lift*cp };
    let fraction = 1;
    const cameraRayStart={x:start.x,y:start.y,z:start.height},cameraRayEnd={x:end.x,y:end.y,z:end.height};
    const landmarks=LANDMARK_COVER.filter(g=>segmentBox3D(cameraRayStart,cameraRayEnd,g.bounds)!==null).flatMap(g=>g.parts);
    const cameraCover = OBSTACLES.concat(landmarks,HOUSES.flatMap(h => [
      ...[h.y,h.y+h.h-h.wall].map(y=>({x:h.x+(h.w-h.door)/2,y,w:h.door,h:h.wall,base:h.floor+106,height:14})),
      ...(h.id === inside?.id ? [] : [{x:h.x-12,y:h.y-12,w:h.w+24,h:h.h+24,base:h.floor+h.height,height:45}])
    ]));
    for (const o of cameraCover) {
      let low = 0, high = 1;
      const base = o.base ?? groundHeight(o.x + o.w / 2, o.y + o.h / 2);
      for (const [a, b, min, max] of [[start.x,end.x,o.x-clearance,o.x+o.w+clearance], [start.y,end.y,o.y-clearance,o.y+o.h+clearance], [start.height,end.height,base-clearance,base+o.height+clearance]]) {
        const delta = b-a;
        if (Math.abs(delta)<1e-8) { if(a<min||a>max) { low=2; break; } }
        else { const t1=(min-a)/delta,t2=(max-a)/delta;low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2)); }
      }
      if (low<=high && low>=0 && low<=1) fraction=Math.min(fraction,Math.max(0,low-.025));
    }
    // Prevent orbiting below the ground when looking up or backing into a hillside.
    const steps=Math.ceil(distance/10);
    for(let i=1;i<=steps;i++) {
      const t=Math.min(i/steps,fraction);
      const x=start.x+(end.x-start.x)*t,y=start.y+(end.y-start.y)*t,z=start.height+(end.height-start.height)*t;
      if(z<surfaceHeight(x,y)+ACTOR.height*.15){fraction=Math.max(0,(i-1)/steps);break;}
      if(t===fraction)break;
    }
    return { x:start.x+(end.x-start.x)*fraction, y:start.y+(end.y-start.y)*fraction,
      height:start.height+(end.height-start.height)*fraction, distance:distance*fraction, inside:inside?.id || null };
  }
  // Trace the centre of the camera view, then converge the muzzle on that exact world point.
  // Both simulations use this, so an over-the-shoulder camera cannot silently misalign shots.
  function aimSolution(player, targets = []) {
    const pose=thirdPersonCamera(player),origin=bulletOrigin(player);
    const camera={x:pose.x,y:pose.y,z:pose.height},direction=shotVelocity(player.angle,clamp(player.pitch||0,-.75,.75),1);
    const reach=CONFIG.bulletSpeed*CONFIG.bulletLifetime+pose.distance;
    const end={x:camera.x+direction.vx*reach,y:camera.y+direction.vy*reach,z:camera.z+direction.vz*reach};
    let hit=segmentCover3D(camera,end)??1;
    for(const p of targets) {
      if(p===player || p.id && p.id===player.id || p.local || p.dead || p.hp<=0 || p.spawn>0)continue;
      const t=segmentActor3D(camera,end,p);if(t!==null)hit=Math.min(hit,t);
    }
    const target={x:camera.x+(end.x-camera.x)*hit,y:camera.y+(end.y-camera.y)*hit,z:camera.z+(end.z-camera.z)*hit};
    const dx=target.x-origin.x,dy=target.y-origin.y,dz=target.z-origin.z;
    const cover=segmentCover3D(origin,target);
    const blocked=cover!==null&&cover<.985;
    return {angle:Math.atan2(dy,dx),pitch:Math.atan2(dz,Math.hypot(dx,dy)),origin,target,
      blockedPoint:blocked?{x:origin.x+dx*cover,y:origin.y+dy*cover,z:origin.z+dz*cover}:null};
  }
  function move(entity, dx, dy) {
    // Shallow water is crossable; the bridge provides a faster route. Shared by all modes.
    if (inWater(entity.x, entity.y)) { dx *= .62; dy *= .62; }
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
  // Ballistics use x/y on the map and z for height; renderers map z to their vertical axis.
  const bulletOrigin = p => ({ x: p.x, y: p.y, z: surfaceHeight(p.x, p.y) + ACTOR.muzzleHeight * (p.type==='tank'?1.08:1) });
  function shotVelocity(angle, pitch = 0, speed = CONFIG.bulletSpeed) {
    const horizontal = Math.cos(pitch) * speed;
    return { vx: Math.cos(angle) * horizontal, vy: Math.sin(angle) * horizontal, vz: Math.sin(pitch) * speed };
  }
  function segmentBox3D(start, end, o) {
    let low = 0, high = 1;
    const base = o.base ?? groundHeight(o.x + o.w / 2, o.y + o.h / 2);
    for (const [a, b, min, max] of [[start.x,end.x,o.x,o.x+o.w], [start.y,end.y,o.y,o.y+o.h], [start.z,end.z,base,base+o.height]]) {
      const delta = b-a;
      if (Math.abs(delta)<1e-9) { if(a<min||a>max) return null; }
      else { const t1=(min-a)/delta,t2=(max-a)/delta;low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));if(low>high)return null; }
    }
    return low;
  }
  const BALLISTIC_COVER = OBSTACLES.concat(HOUSES.flatMap(h => [
    ...[h.y,h.y+h.h-h.wall].map(y=>({x:h.x+(h.w-h.door)/2,y,w:h.door,h:h.wall,base:h.floor+106,height:14})),
    {x:h.x-12,y:h.y-12,w:h.w+24,h:h.h+24,base:h.floor+h.height,height:45},
    {x:h.x,y:h.y,w:h.w,h:h.h,base:h.floor-2,height:2}
  ]), [{x:BRIDGE.x,y:BRIDGE.y,w:BRIDGE.w,h:BRIDGE.h,base:BRIDGE.height-5,height:5}]);
  function segmentCover3D(start, end) {
    let nearest = null;
    for (const o of BALLISTIC_COVER) {
      const hit = segmentBox3D(start, end, o);
      if (hit !== null && (nearest === null || hit < nearest)) nearest = hit;
    }
    for(const group of LANDMARK_COVER) {
      const broad=segmentBox3D(start,end,group.bounds);
      if(broad===null||nearest!==null&&broad>nearest)continue;
      for(const part of group.parts) {
        const hit=segmentBox3D(start,end,part);
        if(hit!==null&&(nearest===null||hit<nearest))nearest=hit;
      }
    }
    // Terrain varies continuously. Short samples followed by bisection prevent fast rounds
    // from crossing a hill, water surface or floor between simulation snapshots.
    const floorAt = (x,y) => Math.max(groundHeight(x,y), inWater(x,y) ? LAKE.level : -Infinity);
    const clearance = t => {
      const x=start.x+(end.x-start.x)*t,y=start.y+(end.y-start.y)*t;
      return start.z+(end.z-start.z)*t-floorAt(x,y);
    };
    if (clearance(0) <= 0) return 0;
    const steps = Math.max(1, Math.ceil(Math.hypot(end.x-start.x,end.y-start.y)/10));
    let before = 0;
    for(let i=1;i<=steps;i++) {
      const t=i/steps;
      if(nearest!==null && before>=nearest)break;
      if(clearance(t)<=0) {
        let low=before,high=t;
        for(let j=0;j<12;j++){const mid=(low+high)/2;if(clearance(mid)>0)low=mid;else high=mid;}
        nearest=nearest===null?high:Math.min(nearest,high);break;
      }
      before=t;
    }
    return nearest;
  }
  function segmentActor3D(start, end, actor, radius = (actor.r || ACTOR.radius) + 2 * ACTOR.scale) {
    const dx=end.x-start.x,dy=end.y-start.y,fx=start.x-actor.x,fy=start.y-actor.y;
    const a=dx*dx+dy*dy,b=2*(fx*dx+fy*dy),c=fx*fx+fy*fy-radius*radius;
    let low=0,high=1;
    if(a<1e-9){if(c>0)return null;}
    else {
      const disc=b*b-4*a*c;if(disc<0)return null;
      const root=Math.sqrt(disc);low=Math.max(low,(-b-root)/(2*a));high=Math.min(high,(-b+root)/(2*a));
    }
    const bottom=surfaceHeight(actor.x,actor.y),top=bottom+(actor.type==='tank'?ACTOR.tankHeight:ACTOR.height),dz=end.z-start.z;
    if(Math.abs(dz)<1e-9){if(start.z<bottom||start.z>top)return null;}
    else {const t1=(bottom-start.z)/dz,t2=(top-start.z)/dz;low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));}
    return low<=high ? low : null;
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
  const api = { WORLD, ACTOR, CONFIG, RULES, TEAMS, OBSTACLES, TREES, ROCKS, HOUSES, houseAt, SPAWNS, SOLO_SPAWN,
    PICKUP_RULES, LOOT, createPickups, collectPickup, thirdPersonCamera, aimSolution,
    LAKE, BRIDGE, COAST, coastX, coastDistance, QUARRY, quarryDistance, ROADS, roadDistance, INDUSTRIAL, groundHeight, surfaceHeight, inWater, lakeDistance, pathDistance, onBridge,
    move, segmentRect, segmentCircle, bulletOrigin, shotVelocity, segmentCover3D, segmentActor3D, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NeonShared = api;
})(globalThis);
