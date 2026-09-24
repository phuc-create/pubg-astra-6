import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { addIndustrialWorld } from './industrial3d.js';

// Rendering only. Gameplay and collision remain in the deterministic shared world.
const S = globalThis.NeonShared;
const TAU = Math.PI * 2;
const color = value => new THREE.Color(value);
const dummy = new THREE.Object3D();
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereGeometry = new THREE.SphereGeometry(1, 12, 8);
const roundedGeometry = new RoundedBoxGeometry(1, 1, 1, 2, .14);
const plateShape = new THREE.Shape();
plateShape.moveTo(-.32,-.42);plateShape.lineTo(.32,-.42);plateShape.lineTo(.43,-.26);plateShape.lineTo(.43,.27);
plateShape.lineTo(.26,.42);plateShape.lineTo(-.26,.42);plateShape.lineTo(-.43,.27);plateShape.lineTo(-.43,-.26);plateShape.closePath();
const plateGeometry = new THREE.ExtrudeGeometry(plateShape,{depth:.72,steps:1,bevelEnabled:true,bevelThickness:.14,bevelSize:.07,bevelSegments:1});
plateGeometry.center();
const shadowGeometry = new THREE.CircleGeometry(24, 20);
const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#19291d', transparent: true, opacity: .22, depthWrite: false });
const pickupRing = new THREE.RingGeometry(22, 25, 32);
const flashGeometry = new THREE.ConeGeometry(2.3, 8, 6);
const flashMaterial = new THREE.MeshBasicMaterial({color:'#fff1a0'});
// A jacketed projectile, with its pointed nose along local +Z. No cartridge case flies with it.
const bulletGeometry = new THREE.LatheGeometry([
  new THREE.Vector2(0, -2.2), new THREE.Vector2(.52, -2.2),
  new THREE.Vector2(.7, -1.65), new THREE.Vector2(.7, .6),
  new THREE.Vector2(.5, 1.5), new THREE.Vector2(.22, 2.1), new THREE.Vector2(0, 2.45)
], 10);
bulletGeometry.rotateX(Math.PI / 2);
const barrelGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
barrelGeometry.rotateX(Math.PI / 2);
const materials = new Map();
function material(hex, metalness = 0) {
  const key = `${hex}:${metalness}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness: .86 - metalness * .5, metalness }));
  return materials.get(key);
}
function box(parent, size, position, mat, geometry = boxGeometry) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.scale.set(...size); mesh.position.set(...position);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function limb(parent, from, to, width, depth, mat) {
  const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to), direction = end.clone().sub(start);
  const mesh = box(parent, [width, direction.length(), depth], start.clone().add(end).multiplyScalar(.5).toArray(), mat, roundedGeometry);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}
function instance(mesh, i, x, y, z, sx, sy, sz, rotation = 0, tint, pitch = 0) {
  dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(-pitch, rotation, 0, 'YXZ');
  dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  if (tint) mesh.setColorAt(i, color(tint));
}
function batch(scene, geometry, mat, count) {
  const mesh = new THREE.InstancedMesh(geometry, mat, count);
  mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh;
}
function randomGenerator(seed = 382) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function groundTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d'), random = randomGenerator(831);
  c.fillStyle = '#d2cbb5'; c.fillRect(0, 0, 512, 512);
  // Fine soil, dry blades and small stones, without a conspicuous repeating grid.
  for (let i = 0; i < 21000; i++) {
    const x=random()*512,y=random()*512,shade=Math.floor(105+random()*125);
    c.fillStyle=`rgba(${shade},${shade},${shade-12},${.15+random()*.25})`;
    c.fillRect(x,y,.6+random()*2,.7+random()*3);
    if(i%3===0){c.strokeStyle=`rgba(87,89,59,${random()*.25})`;c.beginPath();c.moveTo(x,y);c.lineTo(x+random()*4-2,y-2-random()*6);c.stroke();}
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(S.WORLD.width / 270, S.WORLD.height / 270);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}
function forestTexture(bark = false) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d'), random = randomGenerator(bark ? 24 : 79);
  if(bark){
    c.fillStyle='#b2a899';c.fillRect(0,0,256,256);
    for(let i=0;i<1400;i++){
      const shade=Math.floor(65+random()*150);c.fillStyle=`rgba(${shade},${shade-5},${shade-10},.4)`;
      c.fillRect(random()*256,random()*256,.4+random()*2.6,5+random()*48);
    }
  }else{
    // A perforated leaf canopy breaks up the silhouette and lets branch/light gaps show.
    c.fillStyle='rgba(153,169,120,.55)';c.fillRect(0,0,256,256);
    for(let i=0;i<1450;i++){
      const shade=Math.floor(130+random()*115);c.fillStyle=`rgba(${shade-15},${shade},${shade-28},${.5+random()*.5})`;
      c.beginPath();c.ellipse(random()*256,random()*256,2+random()*6,1+random()*3,random()*TAU,0,TAU);c.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(bark ? 2 : 1, bark ? 3 : 1); texture.anisotropy = 4; return texture;
}

class ForestRenderer {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = color('#b6cedc');
    this.scene.fog = new THREE.FogExp2('#b6c5cb', .000105);
    this.camera = new THREE.PerspectiveCamera(60, 1, 1, 26000);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight('#dbe7ed', '#77715c', 1.75));
    this.sun = new THREE.DirectionalLight('#fff3dd', 2.7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1536, 1536);
    Object.assign(this.sun.shadow.camera, { left: -900, right: 900, top: 900, bottom: -900, near: 20, far: 3500 });
    this.sun.shadow.bias = -.0004; this.sun.shadow.normalBias = 2;
    this.scene.add(this.sun, this.sun.target);
    this.time = { value: 0 };
    this.actors = new Map(); this.labels = []; this.botIds = new WeakMap(); this.nextBotId = 0;
    this.makeTerrain(); this.makeMountains(); this.makeForest(); this.makeLake(); this.makeBridge();
    this.makeHouses(); addIndustrialWorld(this.scene, S); this.makeDetails(); this.makeSky();
    this.projectiles = batch(this.scene, bulletGeometry, material('#bd8b51', .72), 256);
    this.projectiles.castShadow = false; this.projectiles.count = 0; this.projectiles.frustumCulled = false;
    this.tracers = batch(this.scene, boxGeometry, new THREE.MeshBasicMaterial({color:'#ffe4ac',transparent:true,opacity:.42,depthWrite:false}), 256);
    this.tracers.castShadow = this.tracers.receiveShadow = false; this.tracers.count = 0; this.tracers.frustumCulled = false;
    this.makeAimWeapon();
    this.pickups = new Map();
    this.lastTime = 0;
    this.ready = true;
    this.renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); this.ready = false; });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => { this.ready = true; });
  }
  makeTerrain() {
    const { width, height } = S.WORLD;
    const geo = new THREE.PlaneGeometry(width, height, Math.ceil(width/22), Math.ceil(height/22));
    geo.rotateX(-Math.PI / 2); geo.translate(width / 2, 0, height / 2);
    const p = geo.attributes.position, colors = [];
    const grass=color('#8b9060'),soil=color('#ae8b68'),sand=color('#c0b391'),gravel=color('#918c7c');
    const pads=S.INDUSTRIAL?.pad?[S.INDUSTRIAL.pad]:[];
    for (let i = 0; i < p.count; i++) {
      const x=p.getX(i),z=p.getZ(i),y=S.groundHeight(x,z);p.setY(i,y);
      const patch=(Math.sin(x*.006+Math.cos(z*.004))*Math.sin(z*.008)+1)*.5;
      const tint=grass.clone().lerp(soil,.22+patch*.36);
      tint.lerp(soil,Math.max(0,1-S.pathDistance(x,z)/90)*.56);
      const coast=S.coastDistance?.(x,z)??9999,lake=S.lakeDistance(x,z);
      if(lake<1.19)tint.lerp(sand,Math.max(0,1-Math.abs(lake-1.03)*6));
      if(coast<130)tint.lerp(gravel,Math.max(0,1-Math.max(0,coast)/130)*.7);
      if(pads.some(a=>x>a.x-20&&x<a.x+a.w+20&&z>a.y-20&&z<a.y+a.h+20))tint.lerp(gravel,.8);
      if(S.QUARRY){
        const q=S.QUARRY,r=Math.hypot((x-q.x)/q.rx,(z-q.y)/q.ry),blend=S.clamp((1.1-r)/.14,0,1);
        const ochre=color('#b07852').lerp(color('#d1b086'),S.clamp(1-r*1.3,0,1)*.6);
        ochre.offsetHSL(0,0,Math.sin(x*.073+z*.016)*.02);tint.lerp(ochre,blend);
      }
      if(y<S.LAKE.level)tint.lerp(color('#727964'),.55);
      tint.offsetHSL(0,0,Math.sin(x*.045+z*.03)*.018+Math.sin(z*.11)*.012);colors.push(tint.r,tint.g,tint.b);
    }
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
    const texture=groundTexture();
    const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:texture,bumpMap:texture,bumpScale:.85,vertexColors:true,roughness:1}));
    mesh.receiveShadow=true;this.scene.add(mesh);
  }
  makeMountains() {
    const {width,height}=S.WORLD;
    // Continuous, low ridgelines frame the west and north; the east opens onto the sea.
    const geo=new THREE.PlaneGeometry(width+15000,height+14000,190,160);
    geo.rotateX(-Math.PI/2);geo.translate(width/2,0,height/2);
    const p=geo.attributes.position,colors=[];
    const ridgeHeight=(x,z)=>{
      const edgeX=Math.max(0,-x,x-width),edgeZ=Math.max(0,-z,z-height);
      const coast=S.coastX?.(S.clamp(z,0,height))??width-250;
      const inland=Math.max(0,Math.min(1,(coast-x)/700));
      const rolling=(Math.sin(x*.00062+z*.00025)+1)*.5;
      let y=-35;
      if(edgeX>0||edgeZ>0){
        const blend=Math.min(1,Math.max(edgeX,edgeZ)/500);
        const western=Math.exp(-Math.pow((x+2100)/2200,2))*(210+rolling*450);
        const northern=Math.exp(-Math.pow((z+1900)/1900,2))*(180+Math.sin(x*.0008)*85);
        const southern=Math.exp(-Math.pow((z-height-2100)/1900,2))*(140+Math.cos(x*.0008)*75);
        y=S.groundHeight(S.clamp(x,0,width),S.clamp(z,0,height))-8;
        y=y*(1-blend)+(-25+inland*(western+northern+southern+45))*blend;
      }
      return y;
    };
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),z=p.getZ(i),rolling=(Math.sin(x*.00062+z*.00025)+1)*.5;
      p.setY(i,ridgeHeight(x,z));
      const tint=color('#92977b').lerp(color('#b2aa8b'),rolling*.55);
      tint.offsetHSL(0,0,Math.sin(z*.003)*.025+Math.sin(x*.008+Math.sin(z*.009))*Math.cos(z*.005)*.035);
      colors.push(tint.r,tint.g,tint.b);
    }
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
    const ridgeTexture=groundTexture();ridgeTexture.repeat.set((width+15000)/430,(height+14000)/430);
    const land=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:ridgeTexture,vertexColors:true,roughness:1}));land.receiveShadow=true;this.scene.add(land);
    // Tiny tree silhouettes give distant ridges a natural scale, without physical cover.
    const random=randomGenerator(724),far=[];
    for(let i=0;i<260;i++){
      const x=-650-random()*2100,z=-1600+random()*(height+3200);
      far.push([x,ridgeHeight(x,z),z,40+random()*45]);
    }
    const trunks=batch(this.scene,new THREE.CylinderGeometry(.5,1,1,5),material('#797264'),far.length);trunks.castShadow=false;
    const crowns=batch(this.scene,new THREE.IcosahedronGeometry(1,1),material('#65765f'),far.length);crowns.castShadow=false;
    far.forEach(([x,y,z,h],i)=>{
      instance(trunks,i,x,y+h*.44-3,z,h*.055,h*.88+6,h*.055,i);
      instance(crowns,i,x,y+h*.96,z,h*.40,h*.55,h*.43,i);
    });
  }
  makeForest() {
    const trees=S.TREES,bark=forestTexture(true),leaf=forestTexture();
    const trunkMat=new THREE.MeshStandardMaterial({color:'#7e7462',map:bark,bumpMap:bark,bumpScale:1.2,roughness:1});
    const trunks=batch(this.scene,new THREE.CylinderGeometry(.55,1,1,8),trunkMat,trees.length);
    const branches=batch(this.scene,new THREE.CylinderGeometry(.4,1,1,6),trunkMat,trees.length*5);
    const foliageMat=new THREE.MeshStandardMaterial({color:'#ffffff',map:leaf,alphaTest:.58,side:THREE.DoubleSide,roughness:1});
    foliageMat.onBeforeCompile=shader=>{
      shader.uniforms.uForestTime=this.time;shader.vertexShader='uniform float uForestTime;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.x += sin(uForestTime*.85+instanceMatrix[3].x*.008+position.y)*.015*max(0.0,position.y);');
    };
    const crownGeo=new THREE.IcosahedronGeometry(1,1),cp=crownGeo.attributes.position;
    for(let i=0;i<cp.count;i++){const x=cp.getX(i),y=cp.getY(i),z=cp.getZ(i),r=1+Math.sin(x*16+y*11+z*7)*.12;cp.setXYZ(i,x*r,y*r,z*r);}crownGeo.computeVertexNormals();
    const foliage=batch(this.scene,crownGeo,foliageMat,trees.length*11);
    const axis=new THREE.Vector3(0,1,0),start=new THREE.Vector3(),end=new THREE.Vector3();
    trees.forEach((t,i)=>{
      const ground=S.groundHeight(t.x,t.y),crown=t.crown*(t.pine?.9:1.2);
      instance(trunks,i,t.x,ground+t.height*.43,t.y,t.radius*.8,t.height*.86,t.radius*.8,t.shade*TAU);
      for(let j=0;j<5;j++){
        const a=j*2.4+t.shade*TAU,branchY=t.height*(.42+j*.075),spread=crown*(.9-j*.09);
        start.set(t.x,ground+branchY,t.y);end.set(t.x+Math.cos(a)*spread,ground+branchY+t.height*.15,t.y+Math.sin(a)*spread);
        const direction=end.clone().sub(start);dummy.position.copy(start).add(end).multiplyScalar(.5);dummy.scale.set(t.radius*.3,direction.length(),t.radius*.3);dummy.quaternion.setFromUnitVectors(axis,direction.normalize());dummy.updateMatrix();branches.setMatrixAt(i*5+j,dummy.matrix);
      }
      for(let j=0;j<11;j++){
        const a=j*2.399+t.shade*TAU,level=j/10;
        const spread=crown*(t.pine?(1-level)*.68:.58)*(j===10?0:1);
        const size=crown*(t.pine?.50-level*.23:.47+(j%3)*.065);
        const yy=t.pine?t.height*(.47+level*.51):t.height*(.64+level*.25);
        const tint=color(t.pine?'#4d6141':'#687447').lerp(color('#8c9360'),t.shade*.48+(j%4)*.05);
        instance(foliage,i*11+j,t.x+Math.cos(a)*spread,ground+yy,t.y+Math.sin(a)*spread,size,size*(t.pine?.94:.82),size*(.85+(j%3)*.1),a,tint);
      }
    });
    // One fractured stone silhouette, with broad facets and a planted base.
    // Normalize every variant into the existing physical footprint/height.
    const stoneMat=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,flatShading:true});
    for(let variant=0;variant<4;variant++){
      const geo=new THREE.IcosahedronGeometry(1,1),p=geo.attributes.position;
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i),fracture=1+Math.sin(x*8.1+y*4.3+z*7.7+variant*1.9)*.2;
        p.setXYZ(i,x*fracture+(y+.3)*.07*Math.sin(variant+1),y*fracture,z*fracture+(y-.2)*.09*Math.cos(variant+1));
      }
      geo.computeBoundingBox();const bounds=geo.boundingBox,size=new THREE.Vector3();bounds.getSize(size);
      for(let i=0;i<p.count;i++){
        const y=(p.getY(i)-bounds.min.y)/size.y;
        p.setXYZ(i,(p.getX(i)-bounds.min.x)/size.x-.5,y<.16?0:(y-.16)/.84,(p.getZ(i)-bounds.min.z)/size.z-.5);
      }
      geo.computeVertexNormals();geo.computeBoundingBox();geo.computeBoundingSphere();
      const rocks=S.ROCKS.filter((_,i)=>i%4===variant),mesh=batch(this.scene,geo,stoneMat,rocks.length);
      rocks.forEach((r,i)=>{
        const x=r.x+r.w/2,z=r.y+r.h/2,quarry=S.quarryDistance?.(x,z)<1.12;
        instance(mesh,i,x,S.groundHeight(x,z),z,r.w,r.height,r.h,0,quarry?(i%2?'#9e8266':'#b59c7c'):(i%2?'#999989':'#858b7f'));
      });
    }
  }
  makeLake() {
    const waterMaterial=new THREE.ShaderMaterial({
      uniforms:{uTime:this.time,uSun:{value:new THREE.Vector3(-.45,.65,-.5).normalize()}},
      vertexShader:`uniform float uTime;varying vec3 vWorld;void main(){vec3 p=position;p.y+=sin(p.x*.016+uTime*.6)*.3+cos(p.z*.021+uTime*.5)*.25;vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
      fragmentShader:`uniform float uTime;uniform vec3 uSun;varying vec3 vWorld;
        void main(){vec2 p=vWorld.xz;float wave=sin(p.x*.047+p.y*.022+uTime*.8)*.5+cos(p.y*.035-p.x*.012+uTime*.65)*.5;
        vec3 n=normalize(vec3(cos(p.x*.027+p.y*.015+uTime*.7)*.065,1.,sin(p.y*.025+uTime*.6)*.05));
        vec3 view=normalize(cameraPosition-vWorld);float fresnel=pow(1.-max(dot(n,view),0.),3.);
        vec3 water=mix(vec3(.14,.27,.31),vec3(.48,.63,.70),fresnel*.86);
        float sun=pow(max(dot(reflect(-uSun,n),view),0.),170.);water+=wave*.012+sun*vec3(1.,.93,.78)*.9;
        float haze=1.-exp(-pow(distance(cameraPosition,vWorld)*.000095,1.5));water=mix(water,vec3(.61,.70,.75),haze*.84);
        gl_FragColor=vec4(water,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`
    });
    const geo=new THREE.CircleGeometry(1,96);geo.rotateX(-Math.PI/2);geo.scale(S.LAKE.rx*1.06,1,S.LAKE.ry*1.06);
    this.water=new THREE.Mesh(geo,waterMaterial);this.water.position.set(S.LAKE.x,S.LAKE.level,S.LAKE.y);this.scene.add(this.water);
    if(S.COAST){
      const seaGeo=new THREE.PlaneGeometry(23000,34000,48,48);seaGeo.rotateX(-Math.PI/2);
      const seaStart=Math.min(...Array.from({length:45},(_,i)=>S.coastX(S.WORLD.height*i/44)))-120;
      const sea=new THREE.Mesh(seaGeo,waterMaterial);sea.position.set(seaStart+11500,S.COAST.level,S.WORLD.height/2);this.scene.add(sea);
      const rockGeo=new THREE.IcosahedronGeometry(1,1),random=randomGenerator(601),positions=[];
      for(let y=30;y<S.WORLD.height;y+=58){
        const x=S.coastX(y)+random()*35,top=S.groundHeight(x-50,y),depth=Math.max(18,top-S.COAST.level);
        positions.push([x,top-depth*.55,y,27+random()*22,depth*.7,40+random()*20]);
      }
      const coastRocks=batch(this.scene,rockGeo,material('#8b897a'),positions.length);
      positions.forEach(([x,y,z,sx,sy,sz],i)=>instance(coastRocks,i,x,y,z,sx,sy,sz,i*.37,i%3===0?'#aaa48e':'#82857d'));
      const foamPositions=[];
      for(let y=0;y<S.WORLD.height;y+=28){
        const x=S.coastX(y)+45;
        foamPositions.push(x, S.COAST.level+.8,y,x+11,S.COAST.level+.8,y,x,S.COAST.level+.8,y+28,x+11,S.COAST.level+.8,y,x+11,S.COAST.level+.8,y+28,x,S.COAST.level+.8,y+28);
      }
      const foamGeo=new THREE.BufferGeometry();foamGeo.setAttribute('position',new THREE.Float32BufferAttribute(foamPositions,3));
      const foam=new THREE.Mesh(foamGeo,new THREE.MeshBasicMaterial({color:'#d5dfd6',transparent:true,opacity:.23,side:THREE.DoubleSide,depthWrite:false}));this.scene.add(foam);
    }
  }
  makeBridge() {
    const b=S.BRIDGE,deck=material('#8d8c7d'),steel=material('#5b6967',.4);
    box(this.scene,[b.w,10,b.h],[b.x+b.w/2,b.height-5,b.y+b.h/2],deck);
    const sections=7,span=(b.w-24)/sections;
    for(const z of [b.y-4,b.y+b.h+4]){
      box(this.scene,[b.w-24,34,8],[b.x+b.w/2,b.height+17,z],steel);
      box(this.scene,[b.w-24,7,7],[b.x+b.w/2,b.height+133,z],steel);
      for(let i=0;i<=sections;i++){
        const x=b.x+12+i*span;box(this.scene,[7,126,7],[x,b.height+70,z],steel);
        if(i<sections)limb(this.scene,[x,b.height+(i%2?130:38),z],[x+span,b.height+(i%2?38:130),z],5,5,steel);
      }
    }
    for(let i=1;i<sections;i++){
      const x=b.x+12+i*span;box(this.scene,[7,7,b.h+15],[x,b.height+133,b.y+b.h/2],steel);
      box(this.scene,[20,40,b.h*.75],[x,b.height-28,b.y+b.h/2],deck);
    }
    for(let x=b.x+32;x<b.x+b.w-20;x+=52)box(this.scene,[26,.5,2],[x,b.height+.3,b.y+b.h/2],material('#d2c7a5'));
  }
  makeDetails() {
    const random=randomGenerator(812),blades=[],pads=S.INDUSTRIAL?.pad?[S.INDUSTRIAL.pad]:[];
    for(let i=0;i<20000;i++){
      const x=55+random()*(S.WORLD.width-110),z=55+random()*(S.WORLD.height-110);
      if(S.houseAt(x,z,24)||S.inWater(x,z)||S.onBridge(x,z)||S.pathDistance(x,z)<58||S.lakeDistance(x,z)<1.04||(S.coastDistance?.(x,z)??9999)<70||pads.some(p=>x>p.x-15&&x<p.x+p.w+15&&z>p.y-15&&z<p.y+p.h+15))continue;
      if(S.QUARRY&&Math.hypot((x-S.QUARRY.x)/S.QUARRY.rx,(z-S.QUARRY.y)/S.QUARRY.ry)<1.12)continue;
      if(Math.sin(x*.008+z*.002)*Math.cos(z*.011)>.5)continue;
      blades.push([x,z,5+random()*11,random()*TAU]);
    }
    const grassGeo=new THREE.BufferGeometry();
    grassGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.23,0,0,.23,0,0,.18,1,0,0,0,-.24,0,0,.24,0,.86,-.12,-.4,0,.18,-.15,0,.18,-.36,.62,.18],3));grassGeo.computeVertexNormals();
    const grass=batch(this.scene,grassGeo,new THREE.MeshStandardMaterial({color:'#ffffff',side:THREE.DoubleSide,roughness:1}),blades.length);grass.castShadow=false;
    blades.forEach(([x,z,h,a],i)=>instance(grass,i,x,S.groundHeight(x,z)-.4,z,h*.65,h,h*.65,a,i%5===0?'#a7a47c':i%3===0?'#938e61':'#7c8254'));
    const reeds=batch(this.scene,new THREE.CylinderGeometry(.7,1,1,4),material('#999575'),150);
    for(let i=0;i<150;i++){
      const a=random()*TAU,r=.99+random()*.065,x=S.LAKE.x+Math.cos(a)*S.LAKE.rx*r,z=S.LAKE.y+Math.sin(a)*S.LAKE.ry*r,h=16+random()*18;
      instance(reeds,i,x,S.groundHeight(x,z)+h/2,z,1,S.onBridge(x,z)?0:h,1);
    }
    if(S.QUARRY){
      const q=S.QUARRY,gravel=[];
      for(let i=0;i<320;i++){
        const a=random()*TAU,r=Math.sqrt(random())*.98,x=q.x+Math.cos(a)*q.rx*r,z=q.y+Math.sin(a)*q.ry*r;
        gravel.push([x,z,1.3+random()*3.2,a]);
      }
      const rubble=batch(this.scene,new THREE.IcosahedronGeometry(1,0),material('#a88e70'),gravel.length);rubble.castShadow=false;
      gravel.forEach(([x,z,size,a],i)=>instance(rubble,i,x,S.groundHeight(x,z)+size*.28,z,size,size*.45,size*.8,a,i%3===0?'#bdac90':'#9f8062'));
    }
    // Low stone markers at the inland boundary; avoid an artificial wall around the coast.
    const bounds=[];
    for(let x=65;x<S.WORLD.width-300;x+=220){if((S.coastDistance?.(x,65)??9999)>100)bounds.push([x,48]);if((S.coastDistance?.(x,S.WORLD.height-48)??9999)>100)bounds.push([x,S.WORLD.height-48]);}
    for(let z=230;z<S.WORLD.height-150;z+=220)bounds.push([48,z]);
    const stones=batch(this.scene,new THREE.IcosahedronGeometry(1,0),material('#989888'),bounds.length);
    bounds.forEach(([x,z],i)=>instance(stones,i,x,S.groundHeight(x,z)+8,z,20,13+(i%3)*3,16,i));
  }
  makeHouses() {
    this.houses=[];
    const makeTexture=(roof=false)=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d'),random=randomGenerator(roof?13:91);
      c.fillStyle=roof?'#b6b5ae':'#d5c6b1';c.fillRect(0,0,256,256);
      if(roof){for(let x=0;x<256;x+=12){c.fillStyle='rgba(48,57,57,.22)';c.fillRect(x,0,2,256);c.fillStyle='rgba(245,243,230,.24)';c.fillRect(x+3,0,2,256);}}
      else for(let row=0;row<13;row++)for(let col=-1;col<9;col++){const shade=Math.floor(140+random()*80);c.fillStyle=`rgb(${shade},${shade-20},${shade-32})`;c.fillRect(col*34+(row%2)*17+1,row*21+1,32,19);}
      for(let i=0;i<1600;i++){c.fillStyle=`rgba(57,54,45,${random()*.14})`;c.fillRect(random()*256,random()*256,1+random()*5,1+random()*7);}
      const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=4;return tex;
    };
    const brickMap=makeTexture(),roofMap=makeTexture(true),buckets=new Map();
    const trim=material('#b9b4a2'),steel=material('#545e5b',.4),dark=material('#364344'),shelf=material('#7c796a');
    const detail=(size,position,mat)=>{if(!buckets.has(mat))buckets.set(mat,[]);buckets.get(mat).push({size,position});};
    for(const [index,h] of S.HOUSES.entries()){
      const cx=h.x+h.w/2,cz=h.y+h.h/2,roof=new THREE.Group();this.scene.add(roof);
      const wallMat=new THREE.MeshStandardMaterial({color:h.color,map:brickMap,bumpMap:brickMap,bumpScale:.6,roughness:1});
      const roofMat=new THREE.MeshStandardMaterial({color:index%3===0?'#8d6150':'#727a76',map:roofMap,bumpMap:roofMap,bumpScale:1,metalness:.2,roughness:.75});
      detail([h.w+6,4,h.h+6],[cx,h.floor-2,cz],material('#9f9c87'));
      for(const o of S.OBSTACLES.filter(o=>o.house===h.id)){
        const x=o.x+o.w/2,z=o.y+o.h/2;
        if(o.kind==='furniture'){
          detail([o.w,5,o.h],[x,h.floor+2.5,z],steel);
          for(const sx of [o.x+3,o.x+o.w-3])detail([5,o.height,5],[sx,h.floor+o.height/2,o.y+o.h-3],steel);
          for(let y=24;y<95;y+=26){detail([o.w,3,o.h],[x,h.floor+y,z],shelf);for(let j=0;j<3;j++)detail([11,17,17],[o.x+10+j*16,h.floor+y+10,z],material(['#6d7565','#a39172','#748485'][j]));}
        }else detail([o.w,o.height,o.h],[x,h.floor+o.height/2,z],wallMat);
      }
      for(const z of [h.y+h.wall/2,h.y+h.h-h.wall/2]){
        detail([h.door,14,h.wall],[cx,h.floor+113,z],trim);
        for(const x of [cx-h.door/2-3,cx+h.door/2+3])detail([6,106,18],[x,h.floor+53,z],steel);
        detail([h.door+16,3,28],[cx,h.floor-1,z],trim);
        for(const x of [h.x+(h.w-h.door)/4,h.x+h.w-(h.w-h.door)/4]){
          const outside=z<cz?z-h.wall/2-2:z+h.wall/2+2;
          detail([48,40,4],[x,h.floor+65,outside],trim);detail([42,33,5],[x,h.floor+66,outside],dark);
          for(const dy of [-9,0,9])detail([42,2,6],[x,h.floor+66+dy,outside],steel);
          detail([53,4,11],[x,h.floor+44,outside],trim);
        }
      }
      for(const x of [h.x-1,h.x+h.w+1])for(const z of [h.y+84,h.y+h.h-68]){
        detail([4,43,60],[x,h.floor+66,z],trim);detail([5,36,53],[x,h.floor+66,z],dark);
        for(const dz of [-16,0,16])detail([6,36,2],[x,h.floor+66,z+dz],steel);
        detail([12,4,65],[x,h.floor+43,z],trim);
      }
      for(const x of [h.x+4,h.x+h.w-4])detail([5,112,5],[x,h.floor+56,h.y+h.h+3],steel);
      for(const sign of [-1,1]){
        const slope=box(roof,[h.w/2+28,7,h.h+30],[cx+sign*h.w/4,h.floor+h.height+18,cz],roofMat);slope.rotation.z=-sign*.24;
        box(roof,[7,7,h.h+30],[h.x+(sign>0?h.w:0),h.floor+h.height-1,cz],steel);
      }
      box(roof,[8,7,h.h+32],[cx,h.floor+h.height+38,cz],steel);
      const gableGeo=new THREE.BufferGeometry();gableGeo.setAttribute('position',new THREE.Float32BufferAttribute([-h.w/2,0,0,h.w/2,0,0,0,38,0],3));gableGeo.computeVertexNormals();
      const gableMat=material('#898b7b');gableMat.side=THREE.DoubleSide;
      for(const z of [h.y+1,h.y+h.h-1]){const gable=new THREE.Mesh(gableGeo,gableMat);gable.position.set(cx,h.floor+h.height,z);gable.castShadow=true;roof.add(gable);}
      // Painted identification plate above the doorway, at a plausible human scale.
      const signCanvas=document.createElement('canvas');signCanvas.width=256;signCanvas.height=64;const c=signCanvas.getContext('2d');
      c.fillStyle='#354646';c.fillRect(0,0,256,64);c.strokeStyle='#c3c0a4';c.lineWidth=3;c.strokeRect(4,4,248,56);c.fillStyle='#e3ddc3';c.textAlign='center';c.font='bold 23px sans-serif';c.fillText(h.name,128,40,236);
      const signTexture=new THREE.CanvasTexture(signCanvas);signTexture.colorSpace=THREE.SRGBColorSpace;
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(91,23),new THREE.MeshStandardMaterial({map:signTexture,roughness:.8}));sign.position.set(cx,h.floor+114,h.y+h.h+.7);this.scene.add(sign);
      this.houses.push({data:h,roof});
    }
    for(const [mat,items] of buckets){const mesh=batch(this.scene,boxGeometry,mat,items.length);items.forEach(({size,position},i)=>instance(mesh,i,...position,...size));}
  }
  makePickup(type) {
    const group=new THREE.Group(), tint=type==='health'?'#75edbb':'#c9a0ff';
    const shell=material(type==='health'?'#345f50':'#62507d',.15), bright=material(tint,.1);
    box(group,[26,18,22],[0,16,0],shell,roundedGeometry);
    box(group,[10,4,5],[0,27,0],bright,roundedGeometry);
    if(type==='health') {
      for(const z of [-11.4,11.4]) { box(group,[14,4,1],[0,16,z],bright);box(group,[4,12,1],[0,16,z],bright); }
      box(group,[13,1,4],[0,25.5,0],bright);
    } else {
      for(const z of [-11.4,11.4]) {
        const upper=box(group,[4,9,1],[2,20,z],bright);upper.rotation.z=-.5;
        const lower=box(group,[4,9,1],[-2,12,z],bright);lower.rotation.z=-.5;
        box(group,[9,3,1],[0,16,z],bright);
      }
    }
    const ring=new THREE.Mesh(pickupRing,new THREE.MeshBasicMaterial({color:tint,side:THREE.DoubleSide,transparent:true,opacity:.65,depthWrite:false}));
    ring.rotation.x=-Math.PI/2;ring.position.y=1;group.add(ring);group.userData.ring=ring;
    this.scene.add(group);return group;
  }
  makeSky() {
    // Soft fractal clouds live in the sky shader, so there are no solid cloud spheres.
    const sky=new THREE.Mesh(new THREE.SphereGeometry(23000,40,24),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
      vertexShader:'varying vec3 vPosition;void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec3 vPosition;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
        float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<5;i++){n+=a*noise(p);p=p*2.03+vec2(3.4,1.7);a*=.5;}return n;}
        void main(){vec3 d=normalize(vPosition);float h=max(d.y,0.);vec3 sky=mix(vec3(.71,.79,.83),vec3(.31,.56,.72),pow(h,.55));
        vec2 uv=d.xz/(.2+h)*2.5;float cloud=fbm(uv+vec2(11.,3.));float cover=smoothstep(.46,.72,cloud)*smoothstep(.01,.16,h);
        vec3 shade=mix(vec3(.67,.73,.75),vec3(.96,.96,.90),smoothstep(.42,.77,cloud));sky=mix(sky,shade,cover*.86);
        gl_FragColor=vec4(sky,1.);
        #include <colorspace_fragment>
        }`}));
    sky.position.set(S.WORLD.width/2,0,S.WORLD.height/2);sky.renderOrder=-10;this.scene.add(sky);
  }
  makeSoldier(tint) {
    const root = new THREE.Group(), armor = material('#626b3d', .42), edge = material('#82845a', .5);
    // Keep source proportions together: body, carried weapon, muzzle and shadow
    // all inherit the shared physical actor scale. The ADS viewmodel is separate.
    root.scale.setScalar(S.ACTOR.scale);
    const cloth = material('#282e26'), dark = material('#202621', .35), steel = material('#6d7468', .7), team = material(tint, .3);
    const torso = new THREE.Group(); torso.position.y = 46; root.add(torso);
    box(torso, [22, 29, 14], [0, 10, 0], cloth, roundedGeometry);
    // Separate plates, a narrow waist and an enclosed helmet keep a human silhouette.
    for (const sign of [-1, 1]) {
      const chest = box(torso, [12, 16, 6], [sign * 6, 17, 8], armor, plateGeometry); chest.rotation.z = -sign * .1;
      box(torso, [3, 12, 2], [sign * 11, 15, 10], edge, roundedGeometry);
      box(torso, [6, 9, 5], [sign * 9, -5, 8], dark, roundedGeometry);
    }
    box(torso, [20, 10, 5], [0, 3, 8], armor, plateGeometry);
    for(const y of [0,4])box(torso,[12,1,1],[0,y,11],edge);
    box(torso, [24, 5, 16], [0, 28, 0], armor, roundedGeometry);
    box(torso, [23, 5, 17], [0, -7, 0], dark, roundedGeometry);
    box(torso, [6, 4, 2], [0, -7, 9], steel);
    box(torso, [5, 4, 1], [7, 19, 11.5], team);
    const chestMark=box(torso,[2.8,2.8,1],[0,19,11.6],edge);chestMark.rotation.z=Math.PI/4;
    // Compact armored back plate, vents and conspicuous team bands on both shoulders/back.
    box(torso, [19, 22, 7], [0, 12, -10], armor, plateGeometry);
    box(torso, [7, 18, 2], [0, 12, -14], dark, roundedGeometry);
    for(const x of [-6,6])box(torso,[2,14,2],[x,11,-14],steel);
    box(torso, [15, 4, 1], [0, 21, -14], team);
    const backMark=box(torso,[4,4,1],[0,12,-15.3],team);backMark.rotation.z=Math.PI/4;
    const head = new THREE.Group(); head.position.y = 33; torso.add(head);
    box(head, [8.1, 9, 8.3], [0, 0, 0], dark, sphereGeometry);
    box(head, [8.3, 10.3, 8.2], [0, 1, -.8], armor, sphereGeometry);
    box(head, [3, 7, 13], [0, 7, -1], edge, roundedGeometry);
    box(head, [14, 6, 2.5], [0, 3, 7.2], material('#171c18', .65), roundedGeometry);
    box(head, [11, 3.2, 1], [0, 3.3, 8.6], material('#785a28', .78), roundedGeometry);
    box(head, [8, .5, .3], [0, 4.5, 9.2], material('#c0a264', .7));
    for(const sign of [-1,1]) {
      box(head,[3.8,9,10],[sign*7,-1,1],armor,roundedGeometry);
      const jaw=box(head,[5,6,4],[sign*4.5,-5,6],armor,roundedGeometry);jaw.rotation.z=-sign*.22;
      box(head,[1,2,3],[sign*9,1,2],team);
    }
    box(head,[7,4,3],[0,-6,7],dark,roundedGeometry);
    for(const x of [-2,0,2])box(head,[.7,2.5,.5],[x,-6,8.6],steel);
    const legs = [], arms = [];
    for (const sign of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(sign * 6.7, 39, 0); root.add(leg);
      box(leg, [9, 20, 11], [0, -9, 0], cloth, roundedGeometry);
      box(leg, [8.5, 15, 4], [0, -8, 5], armor, plateGeometry);
      box(leg, [2, 12, 7], [sign*4.4, -8, 0], edge, roundedGeometry);
      box(leg, [10, 7, 4], [0, -19, 5], armor, plateGeometry);
      const shin = new THREE.Group(); shin.position.y = -21; leg.add(shin);
      box(shin, [8, 15, 9], [0, -7, 0], dark, roundedGeometry);
      box(shin, [8.5, 12, 3], [0, -7, 4.5], armor, plateGeometry);
      box(shin, [10, 6, 15], [0, -14, 3], dark, roundedGeometry);
      box(shin, [10, 2, 15], [0, -16, 3], steel);
      legs.push({ leg, shin });
      const arm = new THREE.Group(); arm.position.set(sign * 16, 24, 0); torso.add(arm);
      arms.push(arm);
      const shoulder=box(arm,[11,11,14],[0,-1,0],armor,roundedGeometry);shoulder.rotation.z=sign*.15;
      box(arm,[11.4,3,14.3],[0,1,0],team,roundedGeometry);
      const elbow=sign===1?[8,-20,0]:[6,-19,10],hand=sign===1?[-6,-16,12]:[24,-13,25];
      limb(arm,[0,-5,0],elbow,7,8,cloth);
      box(arm,[8,7,8],elbow,armor,roundedGeometry);
      limb(arm,elbow,hand,7,8,armor);
      box(arm,[6,6,7],hand,dark,roundedGeometry);
    }
    const gun = new THREE.Group(); gun.position.set(10, S.ACTOR.muzzleHeight / S.ACTOR.scale, 11); root.add(gun);
    box(gun,[5,7,21],[0,0,0],dark,roundedGeometry);
    box(gun,[4,6,12],[0,-1,-15],armor,roundedGeometry);
    box(gun,[5.5,8,3],[0,-1,-22],dark,roundedGeometry);
    box(gun,[4.5,6,16],[0,0,16],material('#414b3b',.55),roundedGeometry);
    for(const z of [11,15,19])box(gun,[4.7,1,1.5],[0,3,z],steel);
    box(gun,[1.3,1.3,16],[0,0,30],steel,barrelGeometry);
    box(gun,[1.7,1.7,4],[0,0,39],dark,barrelGeometry);
    box(gun,[4,10,6],[0,-7,3],dark,roundedGeometry);
    const grip=box(gun,[3.5,7,4],[0,-6,-6],dark,roundedGeometry);grip.rotation.x=-.2;
    box(gun,[2.5,2,29],[0,4,3],steel);
    box(gun,[3,3,5],[0,6,-4],dark,roundedGeometry);
    const flash=new THREE.Mesh(flashGeometry,flashMaterial);flash.rotation.x=Math.PI/2;flash.position.set(0,0,44);gun.add(flash);flash.visible=false;
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .7; root.add(shadow);
    this.scene.add(root); return { root, torso, head, legs, arms, gun, flash, phase: 0, x: 0, y: 0, initialized: false };
  }
  makeAimWeapon() {
    // A separate near-camera model keeps the open reflex sight crisp and centred.
    // It never participates in gameplay collision; shared aimSolution owns the shot path.
    this.weaponScene=new THREE.Scene();this.weaponCamera=new THREE.PerspectiveCamera(50,1,.03,10);
    this.weaponScene.add(new THREE.HemisphereLight('#e4eff3','#515745',2.1));
    const key=new THREE.DirectionalLight('#fff0d8',2.6);key.position.set(-2,3,2);this.weaponScene.add(key);
    const fill=new THREE.DirectionalLight('#a2c0d4',.8);fill.position.set(3,1,-1);this.weaponScene.add(fill);
    const gun=new THREE.Group();this.weaponScene.add(gun);this.aimWeapon=gun;
    const black=material('#161c19',.55),metal=material('#343e37',.72),edge=material('#515c51',.7),grip=material('#272d25'),sleeve=material('#515d36',.12);
    // Receiver, rail and stock recede along the centre line below the optic window.
    box(gun,[.116,.105,.61],[0,-.205,-.535],black,roundedGeometry);
    box(gun,[.103,.046,.51],[0,-.137,-.575],metal,roundedGeometry);
    box(gun,[.105,.105,.21],[0,-.205,-.24],grip,roundedGeometry);
    box(gun,[.076,.082,.25],[0,-.185,-.92],metal,roundedGeometry);
    box(gun,[.016,.016,.30],[0,-.182,-1.17],edge,barrelGeometry);
    box(gun,[.023,.023,.07],[0,-.182,-1.33],black,barrelGeometry);
    box(gun,[.055,.008,.55],[0,-.111,-.565],black);
    for(let z=-.81;z<-.32;z+=.032)box(gun,[.061,.008,.010],[0,-.105,z],metal);
    for(const x of [-.061,.061])for(const z of [-.70,-.61,-.52])box(gun,[.006,.016,.045],[x,-.19,z],black,roundedGeometry);
    const magazine=box(gun,[.070,.185,.11],[0,-.332,-.62],black,roundedGeometry);magazine.rotation.x=-.14;
    box(gun,[.069,.14,.085],[0,-.32,-.345],grip,roundedGeometry);
    // Mount and battery housing stay beneath the red dot, leaving the glass unobstructed.
    box(gun,[.161,.073,.125],[0,-.105,-.902],black,roundedGeometry);
    box(gun,[.180,.020,.145],[0,-.143,-.894],metal,roundedGeometry);
    box(gun,[.135,.015,.093],[0,-.062,-.918],edge,roundedGeometry);
    for(const sign of [-1,1]) {
      const dial=box(gun,[.020,.020,.032],[sign*.099,-.107,-.895],black,barrelGeometry);dial.rotation.y=Math.PI/2;
      const screw=box(gun,[.010,.010,.006],[sign*.119,-.107,-.895],edge,barrelGeometry);screw.rotation.y=Math.PI/2;
    }
    // Open, rounded rectangular hood similar to a red-dot reflex optic, not a magnified tube.
    const hood=new THREE.Shape();
    hood.moveTo(-.071,-.069);hood.lineTo(.071,-.069);
    hood.bezierCurveTo(.092,-.047,.102,-.021,.097,.017);
    hood.bezierCurveTo(.094,.043,.083,.065,.068,.073);hood.lineTo(-.068,.073);
    hood.bezierCurveTo(-.083,.065,-.094,.043,-.097,.017);
    hood.bezierCurveTo(-.102,-.021,-.092,-.047,-.071,-.069);
    const aperture=new THREE.Path();
    aperture.moveTo(-.064,-.053);aperture.bezierCurveTo(-.080,-.034,-.088,-.013,-.083,.015);
    aperture.bezierCurveTo(-.080,.037,-.072,.051,-.059,.058);aperture.lineTo(.059,.058);
    aperture.bezierCurveTo(.072,.051,.080,.037,.083,.015);
    aperture.bezierCurveTo(.088,-.013,.080,-.034,.064,-.053);aperture.closePath();hood.holes.push(aperture);
    const hoodMesh=new THREE.Mesh(new THREE.ExtrudeGeometry(hood,{depth:.025,steps:1,bevelEnabled:true,bevelThickness:.0025,bevelSize:.002,bevelSegments:2,curveSegments:16}),black);
    hoodMesh.position.z=-.947;gun.add(hoodMesh);
    const glassShape=new THREE.Shape(aperture.getPoints(32));
    const glass=new THREE.Mesh(new THREE.ShapeGeometry(glassShape),new THREE.MeshBasicMaterial({color:'#93b6a4',transparent:true,opacity:.055,depthWrite:false,side:THREE.DoubleSide}));
    glass.position.z=-.947;gun.add(glass);
    // Gloved hands and sleeves frame the receiver without covering the sight picture.
    limb(gun,[-.18,-.35,-.28],[-.08,-.255,-.64],.085,.095,sleeve);
    const support=box(gun,[.075,.093,.13],[-.063,-.26,-.69],grip,roundedGeometry);support.rotation.z=-.25;
    limb(gun,[.18,-.39,-.24],[.075,-.29,-.32],.085,.10,sleeve);
    const hand=box(gun,[.087,.105,.108],[.062,-.292,-.34],grip,roundedGeometry);hand.rotation.z=-.3;
    this.aimBolt=box(gun,[.018,.022,.067],[.07,-.174,-.43],edge,roundedGeometry);
    this.aimMagazine=magazine;
    this.aimFlash=new THREE.Mesh(flashGeometry,flashMaterial);this.aimFlash.scale.set(.006,.006,.006);
    this.aimFlash.rotation.x=-Math.PI/2;this.aimFlash.position.set(0,-.182,-1.39);gun.add(this.aimFlash);
    gun.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
  }
  renderAimWeapon(width,height,player,time,reducedMotion) {
    // Keep the window proportional on both a wide monitor and a narrow browser panel.
    const windowWidth=Math.min(width*.20,height*.23),focal=windowWidth*.93/.198;
    this.weaponCamera.aspect=width/height;
    this.weaponCamera.fov=THREE.MathUtils.radToDeg(2*Math.atan(height/(2*focal)));this.weaponCamera.updateProjectionMatrix();
    this.aimWeapon.position.z=!reducedMotion&&player.muzzle>0?.008:0;
    this.aimBolt.position.z=-.43+(player.muzzle>0?.025:0);
    this.aimMagazine.position.y=-.332-(player.reload>0?Math.sin(player.reload/S.CONFIG.reloadDuration*Math.PI)*.16:0);
    this.aimFlash.visible=player.muzzle>0;this.aimFlash.rotation.z=time*25;
    const autoClear=this.renderer.autoClear;this.renderer.autoClear=false;this.renderer.clearDepth();
    this.renderer.render(this.weaponScene,this.weaponCamera);this.renderer.autoClear=autoClear;
  }
  render({ width, height, player, time, state, enemies = [], shots = [], drops = [], multiplayer, reducedMotion }) {
    if (!this.ready) return null;
    const scale = Math.min(1.35, 1700 / width, 1100 / height), w = Math.round(width * scale), h = Math.round(height * scale);
    if (this.renderer.domElement.width !== w || this.renderer.domElement.height !== h) this.renderer.setSize(w, h, false);
    const dt = Math.max(.001, Math.min(.05, time - this.lastTime)); this.lastTime = time;
    this.time.value = reducedMotion ? 0 : time;
    this.scopeActive=!!player.aiming&&player.hp>0&&state==='playing';
    this.adsAmount=(this.adsAmount||0)+((player.aiming?1:0)-(this.adsAmount||0))*(reducedMotion?1:1-Math.exp(-18*dt));
    this.horizontalFov=(80-this.adsAmount*22)*Math.PI/180;
    this.camera.aspect = width / height; this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(this.horizontalFov/2) / this.camera.aspect)); this.camera.updateProjectionMatrix();
    const pose = S.thirdPersonCamera(player);
    this.camera.position.set(pose.x, pose.height, pose.y);
    const direction=S.shotVelocity(player.angle,player.pitch||0,1);
    this.camera.lookAt(pose.x+direction.vx*1000,pose.height+direction.vz*1000,pose.y+direction.vy*1000);
    this.camera.updateMatrixWorld();
    this.indoor=S.houseAt(player.x,player.y);
    for(const h of this.houses)h.roof.visible=h.data.id!==pose.inside;
    this.sun.position.set(player.x - 850, 1500, player.y - 650); this.sun.target.position.set(player.x, 0, player.y);
    const seen = new Set(); this.labels = [];
    const actors = multiplayer ? multiplayer.actors : enemies.map(e => {
      if (!this.botIds.has(e)) this.botIds.set(e, ++this.nextBotId);
      return { ...e, id: this.botIds.get(e), color: e.color || '#eb877d' };
    });
    actors.push({...player,id:'local-player',local:true,color:multiplayer?.color || '#69ebd2',name:''});
    const aimSolution=S.aimSolution(player,actors.filter(a=>!a.local&&!a.friendly));
    for (const a of actors) {
      if (a.dead || a.hp <= 0) continue;
      const key = `${multiplayer ? 'p' : 'b'}:${a.id}:${a.color}`; seen.add(key);
      if (!this.actors.has(key)) this.actors.set(key, this.makeSoldier(a.color || '#eb877d'));
      const model = this.actors.get(key), distance = model.initialized ? Math.hypot(a.x - model.x, a.y - model.y) : 0;
      model.phase += Math.min(distance, 20) * .065;
      const stride = reducedMotion ? 0 : Math.sin(model.phase) * Math.min(.65, distance / dt / 350);
      model.x = a.x; model.y = a.y; model.initialized = true;model.local=!!a.local;
      model.root.position.set(a.x, S.surfaceHeight(a.x, a.y), a.y); model.root.rotation.y = Math.PI / 2 - (a.angle || 0);
      const bodyMultiplier=a.type==='tank'?1.08:1;
      model.root.scale.setScalar(S.ACTOR.scale*bodyMultiplier);
      model.legs.forEach(({ leg, shin }, i) => { leg.rotation.x = stride * (i ? 1 : -1); shin.rotation.x = Math.max(0, -leg.rotation.x) * .65; });
      const reload=a.reload>0?Math.sin(a.reload/S.CONFIG.reloadDuration*Math.PI):0;
      const gunPitch=a.local?aimSolution.pitch:(a.pitch||0);
      model.torso.rotation.z = stride * .035;
      model.head.rotation.x=-gunPitch*.3;
      model.arms.forEach((arm,i)=>{arm.rotation.x=-gunPitch*.8+stride*.025+reload*(i?-.2:.55);});
      model.gun.rotation.set(-gunPitch-reload*.4,a.local?player.angle-aimSolution.angle:0,0,'YXZ');model.gun.position.z=11-(a.muzzle>0?1.3:0);
      model.flash.visible=a.muzzle>0;model.flash.rotation.z=time*30;
      // Fade the local model only when a wall forces the camera very close.
      if(a.local) {
        model.root.visible=!this.scopeActive&&pose.distance>26*S.ACTOR.scale;
        const fade=pose.distance<75*S.ACTOR.scale;
        if(model.faded!==fade){
          model.root.traverse(object=>{if(!object.isMesh||object.material===shadowMaterial)return;
            if(!object.userData.opaqueMaterial){object.userData.opaqueMaterial=object.material;object.userData.fadeMaterial=object.material.clone();object.userData.fadeMaterial.transparent=true;object.userData.fadeMaterial.opacity=.3;}
            object.material=fade?object.userData.fadeMaterial:object.userData.opaqueMaterial;});model.faded=fade;
        }
      }
      if (a.name && a.friendly) this.labels.push({ ...a, height: model.root.position.y + (S.ACTOR.height+10*S.ACTOR.scale)*bodyMultiplier });
    }
    for (const [key, model] of this.actors) if (!seen.has(key)) { this.scene.remove(model.root);model.root.traverse(o=>o.userData.fadeMaterial?.dispose()); this.actors.delete(key); }
    const allShots = multiplayer ? multiplayer.shots : shots;
    this.projectiles.count = Math.min(256, allShots.length);
    this.tracers.count = this.projectiles.count;
    allShots.slice(0, 256).forEach((s, i) => {
      const speed=Math.hypot(s.vx,s.vy,s.vz||0)||1,rotation=Math.atan2(s.vx,s.vy),height=s.z??S.bulletOrigin(s).z;
      const pitch=Math.atan2(s.vz||0,Math.hypot(s.vx,s.vy));
      instance(this.projectiles,i,s.x,height,s.y,1,1,1,rotation,undefined,pitch);
      // A short, fine streak conveys speed without inflating the projectile itself.
      const length=Math.min(24,speed*.006),back=2.2+length/2;
      instance(this.tracers,i,s.x-s.vx/speed*back,height-(s.vz||0)/speed*back,s.y-s.vy/speed*back,.35,.35,length,rotation,undefined,pitch);
    });
    this.projectiles.instanceMatrix.needsUpdate = true;
    this.tracers.instanceMatrix.needsUpdate = true;
    const keep = new Set(); this.pickupLabels=[];
    drops.filter(d=>!(d.cooldown>0)).forEach((d, i) => {
      const key = d.id ?? d; keep.add(key);
      if (!this.pickups.has(key)) this.pickups.set(key, this.makePickup(d.type));
      const mesh = this.pickups.get(key); mesh.position.set(d.x, S.surfaceHeight(d.x, d.y)+2+(reducedMotion?0:Math.sin(time*2+i)*2), d.y); mesh.rotation.y=reducedMotion?0:time*.45;
      this.pickupLabels.push({...d,height:mesh.position.y+48});
    });
    for (const [key, mesh] of this.pickups) if (!keep.has(key)) { this.scene.remove(mesh);mesh.userData.ring.material.dispose();this.pickups.delete(key); }
    this.renderer.render(this.scene, this.camera);
    if(this.scopeActive)this.renderAimWeapon(width,height,player,time,reducedMotion);
    // Stable centre reticle: aimSolution converges the actual shot onto this camera ray.
    this.aimScreen={x:width/2,y:height/2};this.aimBlocked=!!aimSolution.blockedPoint;this.blockedScreen=null;
    if(aimSolution.blockedPoint) {
      const p=aimSolution.blockedPoint,screen=new THREE.Vector3(p.x,p.z,p.y).project(this.camera);
      if(screen.z>=-1&&screen.z<=1)this.blockedScreen={x:(screen.x+1)*width/2,y:(1-screen.y)*height/2};
    }
    return this.renderer.domElement;
  }
  drawLabels(c, width, height, player) {
    const vector = new THREE.Vector3();
    for(const d of this.scopeActive?[]:this.pickupLabels) {
      const distance=Math.hypot(d.x-player.x,d.y-player.y);
      if(distance>520 || S.OBSTACLES.some(o=>S.segmentRect(player.x,player.y,d.x,d.y,o)!==null))continue;
      vector.set(d.x,d.height,d.y).project(this.camera);
      if(vector.z < -1 || vector.z>1 || Math.abs(vector.x)>.94 || Math.abs(vector.y)>.9)continue;
      const x=(vector.x+1)*width/2,y=(1-vector.y)*height/2;
      const label=d.type==='health'?(player.hp>=S.CONFIG.maxHealth?'HỒI MÁU · ĐÃ ĐẦY':`HỒI MÁU +${S.PICKUP_RULES.health}`):`BẮN NHANH ×${S.PICKUP_RULES.rapidMultiplier}`;
      c.save();c.font='bold 10px Arial';c.textAlign='center';const w=c.measureText(label).width+16;
      c.fillStyle='#13251edb';c.fillRect(x-w/2,y-13,w,22);c.fillStyle=d.type==='health'?'#90f5c6':'#d6b4ff';c.fillText(label,x,y+2);c.restore();
    }
    for (const a of this.labels) {
      if (Math.hypot(a.x - player.x, a.y - player.y) > 1600) continue;
      if (S.OBSTACLES.some(o => S.segmentRect(player.x, player.y, a.x, a.y, o) !== null)) continue;
      if ([...this.actors.values()].some(m => !m.local && Math.hypot(m.x-a.x,m.y-a.y)>1 && S.segmentCircle(player.x,player.y,a.x,a.y,{x:m.x,y:m.y},22*m.root.scale.x)!==null)) continue;
      vector.set(a.x, a.height, a.y).project(this.camera);
      if (vector.z < -1 || vector.z > 1 || Math.abs(vector.x) > .95 || Math.abs(vector.y) > .92) continue;
      const x = (vector.x + 1) * width / 2, y = (1 - vector.y) * height / 2;
      c.save(); c.font = '600 11px Arial,sans-serif'; c.textAlign = 'center';
      const text = `◆ ${a.name}`, w = c.measureText(text).width + 18;
      c.fillStyle = '#122720cf'; c.fillRect(x - w / 2, y - 13, w, 22);
      c.fillStyle = a.color; c.fillText(text, x, y + 2); c.restore();
    }
  }
}

globalThis.NeonForest = { create() { try { return new ForestRenderer(); } catch (error) { console.warn('3D renderer unavailable; using the Canvas fallback.', error); return null; } } };
