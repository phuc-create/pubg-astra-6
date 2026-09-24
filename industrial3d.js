import * as THREE from 'three';

// Static scenery is built from the same footprints used by movement and ballistics.
// Small repeated parts share instanced geometry, including every lattice brace.
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

function randomGenerator(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

function surfaceTexture(type) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d'), random = randomGenerator(type === 'tower' ? 734 : 19);
  c.fillStyle = type === 'tower' ? '#aaa89f' : '#747773'; c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 21000; i++) {
    const v = Math.floor(70 + random() * 150);
    c.fillStyle = `rgba(${v},${v},${v - 8},.19)`;
    c.fillRect(random() * 512, random() * 512, 1 + random() * 2, 1 + random() * 2);
  }
  if (type === 'tower') {
    for (let y = 0; y < 512; y += 20) {
      c.fillStyle = 'rgba(52,55,52,.28)'; c.fillRect(0, y, 512, 1);
      for (let x = (y / 20 % 2) * 22; x < 512; x += 44) c.fillRect(x, y, 1, 20);
    }
    for (let i = 0; i < 160; i++) {
      const x = random() * 512, y = random() * 512, h = 30 + random() * 220;
      const streak = c.createLinearGradient(x, y, x, y + h);
      streak.addColorStop(0, 'rgba(38,45,39,.16)'); streak.addColorStop(1, 'rgba(38,45,39,0)');
      c.fillStyle = streak; c.fillRect(x, y, 1 + random() * 7, h);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(type === 'tower' ? 5 : 1, type === 'tower' ? 3 : 1); texture.anisotropy = 4;
  return texture;
}

function brickTexture() {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const c=canvas.getContext('2d'),random=randomGenerator(872);
  c.fillStyle='#74746a';c.fillRect(0,0,512,256);
  for(let row=0;row<16;row++)for(let col=-1;col<16;col++){
    const x=col*36+(row%2)*18,y=row*16,v=random();
    c.fillStyle=`rgb(${117+Math.floor(v*37)},${89+Math.floor(v*21)},${70+Math.floor(v*18)})`;
    c.fillRect(x+1,y+1,34,14);
  }
  for(let i=0;i<12000;i++){
    c.fillStyle=random()>.5?'rgba(220,210,182,.13)':'rgba(32,37,30,.16)';c.fillRect(random()*512,random()*256,1+random()*3,1+random()*3);
  }
  for(let i=0;i<28;i++){
    const x=random()*512,w=8+random()*40;c.fillStyle='rgba(57,64,52,.10)';c.fillRect(x,120+random()*75,w,136);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(2.5,1.5);texture.anisotropy=4;return texture;
}

class DetailBatches {
  constructor(scene) {
    this.scene = scene; this.batches = new Map(); this.materials = new Map();
    this.box = new THREE.BoxGeometry(1, 1, 1); this.cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
    this.matrix = new THREE.Matrix4(); this.rotation = new THREE.Quaternion();
  }
  material(tint, metal = false) {
    const key = `${tint}:${metal}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color: tint, roughness: metal ? .7 : .93, metalness: metal ? .36 : .02 }));
    return this.materials.get(key);
  }
  add(geometry, tint, position, size, quaternion, metal = false) {
    const key = `${geometry.uuid}:${tint}:${metal}`;
    if (!this.batches.has(key)) this.batches.set(key, { geometry, material: this.material(tint, metal), matrices: [] });
    this.matrix.compose(new THREE.Vector3(...position), quaternion || new THREE.Quaternion(), new THREE.Vector3(...size));
    this.batches.get(key).matrices.push(this.matrix.clone());
  }
  block(position, size, tint, yaw = 0, metal = false) {
    this.add(this.box, tint, position, size, new THREE.Quaternion().setFromAxisAngle(UP, yaw), metal);
  }
  rod(from, to, radius, tint, square = false) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), d = b.clone().sub(a);
    this.add(square ? this.box : this.cylinder, tint, a.add(b).multiplyScalar(.5).toArray(),
      [radius, d.length(), radius], new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), true);
  }
  finish() {
    for (const { geometry, material, matrices } of this.batches.values()) {
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.castShadow = mesh.receiveShadow = true; this.scene.add(mesh);
    }
  }
}

function addRoads(scene, S, batches) {
  const vertices = [], uvs = [], indices = [], paint = [];
  const quad = (out, a, b, width, elevation, dashed = false) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (length < .01) return;
    const nx = -dz / length * width / 2, nz = dx / length * width / 2;
    const points = [[a[0] + nx, a[1] + nz], [a[0] - nx, a[1] - nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz]];
    if (dashed) {
      for (const i of [0, 1, 2, 2, 1, 3]) out.push(points[i][0], S.surfaceHeight(...points[i]) + elevation, points[i][1]);
    } else {
      const offset = vertices.length / 3;
      for (const p of points) vertices.push(p[0], S.surfaceHeight(...p) + elevation, p[1]);
      uvs.push(0, 0, width / 90, 0, 0, length / 90, width / 90, length / 90);
      indices.push(offset, offset + 2, offset + 1, offset + 2, offset + 3, offset + 1);
    }
  };
  for (const road of S.ROADS || []) {
    let travelled = 0;
    for (let segment = 1; segment < road.points.length; segment++) {
      const a = road.points[segment - 1], b = road.points[segment];
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), parts = Math.ceil(length / 34);
      for (let i = 0; i < parts; i++) {
        const p = [a[0] + dx * i / parts, a[1] + dz * i / parts], q = [a[0] + dx * (i + 1) / parts, a[1] + dz * (i + 1) / parts];
        quad(vertices, p, q, road.width, 1.3);
        const nx = -dz / length * road.width * .43, nz = dx / length * road.width * .43;
        for (const side of [-1, 1]) quad(paint, [p[0] + nx * side, p[1] + nz * side], [q[0] + nx * side, q[1] + nz * side], 2, 1.65, true);
        if (road.width > 85 && Math.floor((travelled + length * (i + .5) / parts) / 40) % 2 === 0) quad(paint, p, q, 2.3, 1.7, true);
      }
      travelled += length;
    }
  }
  if (vertices.length) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: surfaceTexture('asphalt'), color: '#6c716e', roughness: 1 }));
    mesh.receiveShadow = true; scene.add(mesh);
    const paintGeo = new THREE.BufferGeometry(); paintGeo.setAttribute('position', new THREE.Float32BufferAttribute(paint, 3)); paintGeo.computeVertexNormals();
    const stripes = new THREE.Mesh(paintGeo, new THREE.MeshStandardMaterial({color:'#bfc1ad',roughness:1,side:THREE.DoubleSide}));
    stripes.receiveShadow = true; scene.add(stripes);
  }
}

function addCoolingTower(scene, tower, batches, concrete) {
  const { x, y: z, radius: r, height: h } = tower, floor = tower.floor ?? 38;
  const group = new THREE.Group(); group.position.set(x, floor, z); scene.add(group);
  const radiusAt = t => r * (1 - .38 * Math.sin(Math.min(1, t * 1.18) * Math.PI / 2) + .13 * Math.pow(t, 6));
  if (!tower.ruined) {
    const profile = [];
    for (let i = 0; i <= 30; i++) { const t = i / 30; profile.push(new THREE.Vector2(radiusAt(t), 50 + t * (h - 50))); }
    const shell = new THREE.Mesh(new THREE.LatheGeometry(profile, 72), concrete); shell.castShadow = shell.receiveShadow = true; group.add(shell);
    const innerProfile = profile.map(p => new THREE.Vector2(p.x - 6, p.y));
    const inside = new THREE.Mesh(new THREE.LatheGeometry(innerProfile, 72), new THREE.MeshStandardMaterial({color:'#575951',roughness:1,side:THREE.BackSide})); group.add(inside);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(radiusAt(1) - 2, 5, 6, 72), batches.material('#b0ada1'));
    lip.rotation.x = Math.PI / 2; lip.position.y = h; group.add(lip);
    const darkWell = new THREE.Mesh(new THREE.CircleGeometry(r * .57, 64), batches.material('#292e2b'));
    darkWell.rotation.x = -Math.PI / 2; darkWell.position.y = h * .68; group.add(darkWell);
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * TAU, b = a + TAU / 56;
      const top = [x + Math.cos(a) * r, floor + 56, z + Math.sin(a) * r];
      for (const offset of [-.055, .055]) batches.rod([x + Math.cos(b + offset) * (r + 9), floor + 7, z + Math.sin(b + offset) * (r + 9)], top, 6, '#878d84', true);
    }
  } else {
    const position = [], uv = [], segments = 80, levels = 16;
    const topAt = a => Math.max(.2, Math.min(1, .57 + Math.sin(a * 3.4) * .22 + Math.cos(a * 7.2) * .18 + Math.sin(a * 13.6) * .06));
    for (let i = 0; i < segments; i++) {
      const a = i / segments * TAU, b = (i + 1) / segments * TAU;
      for (let j = 0; j < levels; j++) {
        const t0 = j / levels, t1 = (j + 1) / levels;
        const coords = [[a,t0],[b,t0],[a,t1],[a,t1],[b,t0],[b,t1]];
        for (const [angle, t] of coords) {
          const v = t * topAt(angle), radius = radiusAt(v);
          position.push(Math.cos(angle) * radius, 15 + v * (h - 15), Math.sin(angle) * radius);
          uv.push(angle / TAU, v);
        }
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
    const shellMat = concrete.clone(); shellMat.side = THREE.DoubleSide; shellMat.color.set('#a9a291');
    const shell = new THREE.Mesh(geo, shellMat); shell.castShadow = shell.receiveShadow = true; group.add(shell);
    const rubbleGeo = new THREE.IcosahedronGeometry(1, 0), random = randomGenerator(372);
    for (let i = 0; i < 23; i++) {
      const a = random() * TAU, d = random() * r * .77, sx = 25 + random() * 52, sy = 20 + random() * 60;
      batches.add(rubbleGeo, '#969889', [x + Math.cos(a) * d, floor + sy * .48, z + Math.sin(a) * d], [sx, sy, sx * .72], new THREE.Quaternion().setFromEuler(new THREE.Euler(random(),random()*TAU,random())));
    }
    for (let i = 0; i < 15; i++) {
      const a = i / 15 * TAU, top = topAt(a) * h;
      batches.rod([x+Math.cos(a)*radiusAt(top/h),floor+top-7,z+Math.sin(a)*radiusAt(top/h)], [x+Math.cos(a)*radiusAt(top/h)+5,floor+top+19,z+Math.sin(a)*radiusAt(top/h)], 1.1, '#5d6258');
    }
  }
  const footing = new THREE.Mesh(new THREE.CylinderGeometry(r + 12, r + 18, 13, 64), batches.material('#8c9287'));
  footing.position.y = 6; footing.castShadow = footing.receiveShadow = true; group.add(footing);
}

function addTank(scene, prop, batches) {
  const {x,y:z,w,h,height,base=38}=prop, radius=Math.min(w,h)/2;
  const group = new THREE.Group(); group.position.set(x+w/2,base,z+h/2); scene.add(group);
  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(radius*.98,radius,height,24),batches.material(prop.color||'#aeb7ae',true));
  cylinder.position.y=height/2; cylinder.castShadow=cylinder.receiveShadow=true; group.add(cylinder);
  const top = new THREE.Mesh(new THREE.ConeGeometry(radius*.98,height*.09,24),batches.material('#849489',true));
  top.position.y=height+height*.045; group.add(top);
  for (const t of [.12,.55,.96]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius+.7,1.1,4,32),batches.material('#6d7d71',true));
    ring.rotation.x=Math.PI/2;ring.position.y=height*t;group.add(ring);
  }
  // Ladder sits inside the authoritative tank footprint.
  const sideX=x+w/2+radius*.94, sideZ=z+h/2;
  for(const dz of[-5,5]) batches.rod([sideX,base,sideZ+dz],[sideX,base+height+8,sideZ+dz],1.2,'#6d7d71');
  for(let j=5;j<height;j+=9)batches.rod([sideX,base+j,sideZ-5],[sideX,base+j,sideZ+5],.9,'#6d7d71');
}

function addContainer(prop,batches) {
  const {x,y:z,w,h,height,base=38}=prop,tint=prop.color||'#567675';
  batches.block([x+w/2,base+height/2,z+h/2],[w,height,h],tint,0,true);
  const alongX=w>h;
  const long=alongX?w:h;
  for(let d=5;d<long;d+=10)for(const sign of[-1,1]){
    const px=alongX?x+d:x+w/2+sign*(w/2+.8),pz=alongX?z+h/2+sign*(h/2+.8):z+d;
    batches.block([px,base+height/2,pz],alongX?[1.7,height-5,1.8]:[1.8,height-5,1.7],tint,0,true);
  }
  for(const sign of[-1,1])batches.block([x+w/2,base+height-2,z+h/2+sign*(h/2-2)],[w,4,4],'#465c5b',0,true);
  if(alongX){
    for(const dz of[-h*.22,h*.22])batches.block([x+.8,base+height/2,z+h/2+dz],[2,height-8,2],'#c4c4ac',0,true);
  }else for(const dx of[-w*.22,w*.22])batches.block([x+w/2+dx,base+height/2,z+.8],[2,height-8,2],'#c4c4ac',0,true);
}

function addBuilding(scene,prop,batches,brick){
  const {x,y:z,w,h,height,base=38}=prop,wall=prop.color||'#afb0a1';
  if(prop.kind==='warehouse'){
    const body=new THREE.Mesh(batches.box,new THREE.MeshStandardMaterial({map:brick,bumpMap:brick,bumpScale:.8,color:'#cbbba4',roughness:1}));
    body.position.set(x+w/2,base+height/2,z+h/2);body.scale.set(w,height,h);body.castShadow=body.receiveShadow=true;scene.add(body);
  }else batches.block([x+w/2,base+height/2,z+h/2],[w,height,h],wall);
  batches.block([x+w/2,base+9,z+h/2],[w+3,18,h+3],'#777e75');
  const roofHeight=Math.min(35,height*.22);
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute([
    x-8,base+height,z-8,x+w/2,base+height+roofHeight,z-8,x-8,base+height,z+h+8,
    x+w/2,base+height+roofHeight,z-8,x+w/2,base+height+roofHeight,z+h+8,x-8,base+height,z+h+8,
    x+w/2,base+height+roofHeight,z-8,x+w+8,base+height,z-8,x+w+8,base+height,z+h+8,
    x+w/2,base+height+roofHeight,z-8,x+w+8,base+height,z+h+8,x+w/2,base+height+roofHeight,z+h+8
  ],3));geo.computeVertexNormals();
  const roof=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:prop.kind==='warehouse'?'#806c5d':'#64706d',roughness:.89,metalness:.24,side:THREE.DoubleSide}));roof.castShadow=roof.receiveShadow=true;scene.add(roof);
  for(let dz=-6;dz<h+8;dz+=10){
    batches.rod([x-8,base+height+.8,z+dz],[x+w/2,base+height+roofHeight+.8,z+dz],.8,'#8d8270');
    batches.rod([x+w/2,base+height+roofHeight+.8,z+dz],[x+w+8,base+height+.8,z+dz],.8,'#8d8270');
  }
  for(let dx=18;dx<w-16;dx+=48)for(const side of[-1,1]){
    const zz=z+h/2+side*(h/2+.7),wy=base+height*.67;
    batches.block([x+dx,wy,zz],[24,24,1.7],'#435659',0,true);
    batches.block([x+dx,wy,zz+side*.9],[2,25,1],'#b4b7a7');
    batches.block([x+dx,wy,zz+side*.9],[25,2,1],'#b4b7a7');
  }
  // Closed roll-up door: solid utility buildings never imply an enterable doorway.
  const dw=Math.min(64,w*.35);
  batches.block([x+w*.5,base+height*.28,z-.7],[dw,height*.5,2],'#68756e',0,true);
  for(let j=4;j<height*.5;j+=7)batches.block([x+w*.5,base+j,z-2],[dw,1,1],'#56645f',0,true);
  batches.block([x+w*.5,base+height*.56,z-3],[dw+8,3,8],'#a9aa91');
  batches.block([x+w*.83,base+height+8,z+h*.73],[16,16,16],'#77847c',0,true);
  if(prop.kind==='warehouse'){
    // A rooftop radio mast is thin decoration above a solid, closed building.
    const mx=x+w*.18,mz=z+h*.69,my=base+height+roofHeight*.4;
    const corners=[[-7,-6],[7,-6],[0,7]];
    for(const [dx,dz]of corners)batches.rod([mx+dx,my,mz+dz],[mx+dx*.28,my+145,mz+dz*.28],1.2,'#7f8a7f');
    for(let j=0;j<6;j++)for(let i=0;i<3;i++){
      const a=corners[i],b=corners[(i+1)%3],ta=j/6,tb=(j+1)/6;
      batches.rod([mx+a[0]*(1-ta*.72),my+ta*145,mz+a[1]*(1-ta*.72)],[mx+b[0]*(1-tb*.72),my+tb*145,mz+b[1]*(1-tb*.72)],.75,'#7f8a7f');
    }
    for(const [dy,side]of[[64,1],[110,-1]]){
      const dish=new THREE.Mesh(new THREE.SphereGeometry(12,16,8,0,TAU,0,Math.PI*.36),new THREE.MeshStandardMaterial({color:'#b9b9a6',roughness:.7,metalness:.2,side:THREE.DoubleSide}));
      dish.scale.y=.48;dish.rotation.z=side*Math.PI/2;dish.position.set(mx+side*10,my+dy,mz);dish.castShadow=true;scene.add(dish);
      batches.rod([mx,my+dy,mz],[mx+side*20,my+dy,mz],.8,'#6e7d73');
    }
  }
}

function addGenerator(prop,batches){
  const {x,y:z,w,h,height,base=38}=prop;
  batches.block([x+w/2,base+4,z+h/2],[w,8,h],'#9b9e8e');
  batches.block([x+w/2,base+height/2,z+h/2],[w-7,height-4,h-7],prop.color||'#757a61',0,true);
  for(let dx=10;dx<w*.6;dx+=6){
    batches.block([x+dx,base+height*.53,z+2.7],[2,height*.58,2],'#424f44',0,true);
    batches.block([x+dx,base+height*.53,z+h-2.7],[2,height*.58,2],'#424f44',0,true);
  }
  batches.block([x+w*.8,base+height*.62,z+2],[w*.22,height*.3,2],'#384b45',0,true);
  batches.block([x+w*.83,base+height*.52,z+.8],[2,3,1],'#cbb06b',0,true);
  batches.rod([x+w*.22,base+height,z+h*.55],[x+w*.22,base+height+17,z+h*.55],3.5,'#536055');
  batches.rod([x+w*.22,base+height+17,z+h*.55],[x+w*.22+9,base+height+17,z+h*.55],3.5,'#536055');
}

function addPylon(prop,batches,cables){
  const {x,y:z,w,h,height,base=38}=prop,cx=x+w/2,cz=z+h/2,steel='#6e7d73';
  const half=Math.min(w,h)*.43;
  batches.block([cx,base+6,cz],[w,12,h],'#989e90');
  const point=(sx,sz,t)=>[cx+sx*half*(1-t*.76),base+12+(height-12)*t,cz+sz*half*(1-t*.76)];
  for(const sx of[-1,1])for(const sz of[-1,1])batches.rod(point(sx,sz,0),point(sx,sz,1),3,steel,true);
  for(let j=0;j<6;j++){
    const a=j/6,b=(j+1)/6;
    for(const side of[-1,1]){
      batches.rod(point(-1,side,a),point(1,side,b),1.5,steel,true);batches.rod(point(1,side,a),point(-1,side,b),1.5,steel,true);
      batches.rod(point(side,-1,a),point(side,1,b),1.5,steel,true);batches.rod(point(side,1,a),point(side,-1,b),1.5,steel,true);
    }
  }
  for(const t of[.68,.88]){
    batches.block([cx,base+height*t,cz],[w*2.25,3,5],steel,0,true);
    for(const side of[-1,1]){
      batches.rod([cx,base+height*(t+.08),cz],[cx+side*w*1.12,base+height*t,cz],2,steel,true);
      batches.rod([cx+side*w*.92,base+height*t-15,cz],[cx+side*w*.92,base+height*t,cz],3,'#515f59');
    }
  }
  cables.push({x:cx,y:base+height*.88-15,z:cz,width:w*.92});
}

function addSubstation(prop,batches){
  const {x,y:z,w,h,height,base=38}=prop;
  batches.block([x+w/2,base+7,z+h/2],[w,14,h],'#979e8e');
  const rows=Math.max(2,Math.floor(h/60)),cols=Math.max(2,Math.floor(w/62));
  for(let r=0;r<rows;r++)for(let col=0;col<cols;col++){
    const px=x+(col+.5)*w/cols,pz=z+(r+.5)*h/rows;
    batches.block([px,base+height*.23,pz],[24,height*.38,29],'#6e8076',0,true);
    for(const dx of[-8,8]){
      batches.rod([px+dx,base+height*.42,pz],[px+dx,base+height*.81,pz],2,'#616963');
      for(let i=0;i<4;i++)batches.add(batches.cylinder,'#9ea9a1',[px+dx,base+height*(.48+i*.075),pz],[4,2.3,4]);
    }
    for(let d=-11;d<=11;d+=5)batches.block([px+d,base+height*.23,pz-15],[2,height*.32,3],'#53695d',0,true);
  }
  for(const zz of[z+9,z+h-9]){
    for(const xx of[x+7,x+w-7])batches.block([xx,base+height/2,zz],[3,height,3],'#6e7d73',0,true);
    batches.block([x+w/2,base+height,zz],[w-10,3,4],'#6e7d73',0,true);
    for(let xx=x+15;xx<x+w-12;xx+=30)batches.rod([xx,base+height*.9,zz],[xx+19,base+height,zz],1.4,'#6e7d73');
  }
}

function addChimney(scene,prop,batches){
  const {x,y:z,w,h,height,base=38}=prop,segments=9,r=Math.min(w,h)/2;
  for(let i=0;i<segments;i++){
    const t=i/segments,geo=new THREE.CylinderGeometry(r*(1-(i+1)/segments*.32),r*(1-t*.32),height/segments,16);
    const mesh=new THREE.Mesh(geo,batches.material(i%2?'#bab9a8':'#a45342'));
    mesh.position.set(x+w/2,base+(i+.5)*height/segments,z+h/2);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
  }
  const mouth=new THREE.Mesh(new THREE.CircleGeometry(r*.65,16),batches.material('#333d35'));
  mouth.rotation.x=-Math.PI/2;mouth.position.set(x+w/2,base+height+.3,z+h/2);scene.add(mouth);
  for(let j=height*.22;j<height;j+=height*.23){
    const radius=r*(1-j/height*.32)+3;
    const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,1.4,4,24),batches.material('#59685e',true));
    ring.rotation.x=Math.PI/2;ring.position.set(x+w/2,base+j,z+h/2);scene.add(ring);
  }
}

function addPipeRack(prop,batches){
  const {x,y:z,w,h,height,base=38}=prop,alongX=w>h;
  batches.block([x+w/2,base+5,z+h/2],[w,10,h],'#959c8d');
  const len=alongX?w:h;
  for(let d=12;d<len;d+=50){
    const px=alongX?x+d:x+w/2,pz=alongX?z+h/2:z+d;
    batches.block([px,base+height*.38,pz],alongX?[5,height*.7,h-6]:[w-6,height*.7,5],'#6e7d73',0,true);
  }
  const count=3;
  for(let i=0;i<count;i++){
    const shift=(i-(count-1)/2)*(Math.min(w,h)-14)/count;
    const from=alongX?[x+5,base+height*.82,z+h/2+shift]:[x+w/2+shift,base+height*.82,z+5];
    const to=alongX?[x+w-5,base+height*.82,z+h/2+shift]:[x+w/2+shift,base+height*.82,z+h-5];
    batches.rod(from,to,Math.min(6,Math.min(w,h)/9),i===1?'#9b9075':'#879b91');
  }
}

export function addIndustrialWorld(scene,S){
  const batches=new DetailBatches(scene),industrial=S.INDUSTRIAL;
  addRoads(scene,S,batches);
  if(!industrial){batches.finish();return;}
  const pad=industrial.pad;
  if(pad){
    const floor=pad.height??S.groundHeight(pad.x+pad.w/2,pad.y+pad.h/2);
    const apron=new THREE.Mesh(new THREE.PlaneGeometry(pad.w,pad.h),new THREE.MeshStandardMaterial({map:surfaceTexture('asphalt'),color:'#c0bdaa',roughness:1}));
    apron.rotation.x=-Math.PI/2;apron.position.set(pad.x+pad.w/2,floor+.45,pad.y+pad.h/2);apron.receiveShadow=true;scene.add(apron);
    const joints=[];
    for(let x=pad.x+100;x<pad.x+pad.w;x+=100)joints.push(x,floor+.65,pad.y,x,floor+.65,pad.y+pad.h);
    for(let z=pad.y+100;z<pad.y+pad.h;z+=100)joints.push(pad.x,floor+.65,z,pad.x+pad.w,floor+.65,z);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(joints,3));
    scene.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:'#79877a',transparent:true,opacity:.28})));
  }
  const towerTexture=surfaceTexture('tower'),concrete=new THREE.MeshStandardMaterial({color:'#b5b3a6',map:towerTexture,bumpMap:towerTexture,bumpScale:1.7,roughness:.99});
  for(const tower of industrial.towers||[])addCoolingTower(scene,tower,batches,concrete);
  const cables=[],brick=brickTexture();
  for(const prop of industrial.props||[]){
    switch(prop.kind){
      case 'tank': case 'silo': addTank(scene,prop,batches);break;
      case 'container': addContainer(prop,batches);break;
      case 'chimney': case 'smokestack': addChimney(scene,prop,batches);break;
      case 'pylon': addPylon(prop,batches,cables);break;
      case 'substation': case 'transformer': addSubstation(prop,batches);break;
      case 'generator': addGenerator(prop,batches);break;
      case 'pipes': case 'pipe': case 'pipeRack': addPipeRack(prop,batches);break;
      case 'barrier': case 'concrete': batches.block([prop.x+prop.w/2,(prop.base??38)+prop.height/2,prop.y+prop.h/2],[prop.w,prop.height,prop.h],prop.color||'#9da495');break;
      default:addBuilding(scene,prop,batches,brick);break;
    }
  }
  cables.sort((a,b)=>a.x-b.x);
  const wires=[];
  for(let i=1;i<cables.length;i++){
    const a=cables[i-1],b=cables[i],span=Math.hypot(b.x-a.x,b.z-a.z);
    if(span>1400)continue;
    for(const sign of[-1,1])for(const side of[-1,1]){
      const point=t=>[THREE.MathUtils.lerp(a.x+sign*a.width,b.x+sign*b.width,t),THREE.MathUtils.lerp(a.y,b.y,t)-Math.sin(t*Math.PI)*span*.045+(side===-1?-28:0),THREE.MathUtils.lerp(a.z,b.z,t)];
      for(let j=0;j<24;j++)wires.push(...point(j/24),...point((j+1)/24));
    }
  }
  if(wires.length){
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(wires,3));
    scene.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:'#505f55',transparent:true,opacity:.7})));
  }
  batches.finish();
}
