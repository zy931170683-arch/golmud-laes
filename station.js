import * as T from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { equipment, pickMember,hoverBand } from './data.js?v=continuous-1';
import { paths, palette } from './process.js?v=cold-fill-1';
import {clock,reservoir,updateReservoir,waterMaterial,flowRoute,updateFlow} from './effects.js?v=hd-1';
import {centralVessels, centralReturn, reheatReturn, reheatVessel, topPorts, hxPorts, turbineStages, thermalNozzles, reverseRoutes} from './pipe-layout.js?v=continuous-1';
import {replacePlantGeometry, roundedPipe, returnCurve} from './plant-equipment.js?v=continuous-1';
import {buildGridCables} from './grid-cables.js?v=pages-1';
import {createLens} from './lens.js?v=hd-1';
import {createTwilight} from './twilight.js?v=ps-grade-2';
import {duskEnvironment,finishDuskMaterial,facilityLighting} from './lighting.js?v=hd-1';

const V=(x,y,z)=>new T.Vector3(x,z,-y);
const at=(a)=>V(...a);
const small=()=>matchMedia('(max-width: 620px)').matches;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

function afterPaint(){
  return new Promise(resolve=>{
    if(document.hidden)setTimeout(resolve,0);
    else requestAnimationFrame(()=>requestAnimationFrame(resolve));
  });
}

function sceneMaterial(material){
  finishDuskMaterial(material);
  const n=material.name;
  let kind=0;
  if(n.includes('草')) kind=1;
  if(n.includes('混凝土')||n.includes('沥青')||material.userData.pavement) kind=2;
  if(n.includes('涂装')||n.includes('保温')) kind=3;
  if(n.includes('不锈钢')||n.includes('镀锌')) kind=4;
  if(!kind) return;
  const asphalt=n.includes('沥青')||material.userData.pavement==='asphalt';
  if(kind===2&&material.isMeshPhysicalMaterial){
    material.clearcoat=1;
    material.clearcoatRoughness=.1;
  }
  material.onBeforeCompile=(shader)=>{
    shader.vertexShader='varying vec3 stationPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nstationPosition=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader=`varying vec3 stationPosition;
      float grainHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float grain(vec3 p){
        vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(grainHash(i),grainHash(i+vec3(1,0,0)),f.x),mix(grainHash(i+vec3(0,1,0)),grainHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(grainHash(i+vec3(0,0,1)),grainHash(i+vec3(1,0,1)),f.x),mix(grainHash(i+vec3(0,1,1)),grainHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }\n`+shader.fragmentShader;
    const formulas={
      1:'float pat=grain(stationPosition*.13)*.65+grain(stationPosition*.42)*.35; diffuseColor.rgb*=mix(.88,1.05,pat);',
      2:`vec3 pavement=vec3(stationPosition.x,0.,stationPosition.z);
          float pat=grain(pavement*.43)*.70+grain(pavement*1.38)*.30;
          float puddleNoise=grain(pavement*vec3(.29,1.,.47)+vec3(9.1,0.,14.7))*.57+pat*.43;
          float horizontal=smoothstep(.82,.995,abs(normalize(cross(dFdx(stationPosition),dFdy(stationPosition))).y));
          float footprint=length(fwidth(pavement.xz));
          float washout=smoothstep(.6,3.0,footprint);
          float wet=mix(smoothstep(${asphalt?'.51,.70':'.52,.70'},puddleNoise),.22,washout)*horizontal;
          diffuseColor.rgb*=mix(.94,1.06,pat)*(1.-wet*.13);`,
      3:'float pat=grain(stationPosition*vec3(1.3,.22,1.3)); diffuseColor.rgb*=mix(.96,1.04,pat);',
      4:'float pat=grain(stationPosition*vec3(2.1,.36,2.1)); diffuseColor.rgb*=mix(.95,1.04,pat);'
    };
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+formulas[kind]);
    const rough=kind===2?'roughnessFactor=mix(roughnessFactor,.26,wet*.82);':kind>2?'roughnessFactor=clamp(roughnessFactor+(.5-pat)*.06,.2,.72);':'';
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n'+rough);
    if(kind===2)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',
      '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= wet*.49;\nmaterial.clearcoatRoughness=max(material.clearcoatRoughness,mix(.13,.36,washout));\n#endif');
  };
  material.customProgramCacheKey=()=>String(kind)+(asphalt?'a':'');
}

const deviceGroups={
  compressor:/^(30_|compressor_shell$)/, intercooler:/^(21_|exchanger_shell$)/,
  hot:/^(12_|19_|sphere_shell$)/, cold:/^(17_|cold_shell$)/,
  storage:/^(10_|tank_shell_0$)/, frontTank:/^(11_|tank_shell_1$)/,
  thermal:/^(1[3-6]_|tank_shell_[2-5]$)/, recover:/^22_/,
  turbine:/^(31_|turbine_shell$)/, grid:/^41_/,
  renewables:/^(50_|51_|52_|rotor_)/, inputPower:/^40_/
};
const vesselSelectionRadius={frontTank:6.7,storage:6.9,hot:6.55};

// On opaque meshes the HDR target's alpha carries the visible selection mask.
// Keeping it on the real material preserves depth, occlusion and shader cutaways.
function selectionMaterial(original,selected,band,center,radius){
  const material=original.clone();
  material.userData=original.userData;
  const compile=original.onBeforeCompile;
  material.onBeforeCompile=shader=>{
    compile(shader);
    shader.uniforms.selectedDevice=selected;
    shader.uniforms.pickBand=band;
    shader.uniforms.selectionCenter={value:center};
    shader.uniforms.selectionRadius={value:radius??0};
    shader.vertexShader='varying vec3 selectionPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nselectionPosition=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=`varying vec3 selectionPosition;
      uniform float selectedDevice;
      uniform vec3 pickBand;
      uniform vec3 selectionCenter;
      uniform float selectionRadius;
      float selectionDot(vec2 grid){
        vec2 delta=fract(grid+.5)-.5;
        float aa=max(length(fwidth(grid))*.5,.008);
        return (1.-smoothstep(.044-aa,.044+aa,length(delta)))*(1.-smoothstep(.13,.32,aa));
      }\n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      vec3 p=selectionPosition-selectionCenter;
      float lane=mix(selectionPosition.x,-selectionPosition.z,pickBand.z);
      bool showSelection=selectedDevice>.5&&lane>=pickBand.x&&lane<pickBand.y&&(selectionRadius<=0.||length(p.xz)<=selectionRadius);
      if(showSelection){
        vec3 n=abs(normalize(cross(dFdx(selectionPosition),dFdy(selectionPosition))));
        float wall=selectionDot(vec2(atan(p.z,p.x)*24./6.2831853,p.y*.84));
        float cap=selectionDot(p.xz*.84);
        float planar=selectionDot(p.zy*.84)*n.x+selectionDot(p.xy*.84)*n.z;
        float dotLight=mix(planar,cap,smoothstep(.48,.86,n.y));
        #ifdef CURVED_SELECTION
          dotLight=mix(wall,cap,smoothstep(.48,.86,n.y));
        #endif
        outgoingLight+=vec3(1.,.44,.035)*(dotLight*2.55+.014);
      }
      #include <opaque_fragment>
      if(showSelection)gl_FragColor.a=0.;
    `);
  };
  material.customProgramCacheKey=()=>original.customProgramCacheKey()+'-gold-selection-v1';
  return material;
}

function trimRearRoadJunction(mesh){
  // The branch starts inside the crossroad in the GLB. Trim only the
  // overlapping branch faces, leaving the road markings where they were.
  const name=mesh.material.name;
  const curb=name.includes('混凝土');
  if(!curb&&!name.includes('沥青'))return;
  const vertices=mesh.geometry.attributes.position;
  for(let i=0;i<vertices.count;i++){
    const x=vertices.getX(i),z=vertices.getZ(i);
    if(x>60&&x<74&&z>-42)vertices.setZ(i,curb?-46:-44);
  }
  vertices.needsUpdate=true;
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
}

export function createStation(host,onProgress,onReady,onError,onSelect){
  const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,small()?1.2:1.55));
  renderer.toneMapping=T.AgXToneMapping;
  renderer.toneMappingExposure=.96;
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=T.PCFShadowMap;
  renderer.shadowMap.autoUpdate=false;
  renderer.domElement.setAttribute('aria-label','可旋转的格尔木储能三维场景');
  host.append(renderer.domElement);
  host.style.visibility='hidden';
  const scene=new T.Scene();
  scene.background=new T.Color(0x243958);
  scene.fog=new T.FogExp2(0x293b5a,.0011);
  const twilight=createTwilight(scene);
  const camera=new T.PerspectiveCamera(40,1,1.5,5000);
  const lens=createLens(renderer,camera);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;
  controls.dampingFactor=.09;
  controls.minDistance=8;
  controls.maxDistance=385;
  controls.maxPolarAngle=Math.PI*.485;
  controls.zoomToCursor=true;
  const hemi=new T.HemisphereLight(0xa3bde8,0x202437,.32);
  scene.add(hemi);
  const sun=new T.DirectionalLight(0xb7cfff,.62);
  sun.position.set(70,59,85);
  sun.target.position.set(-15,0,-3);
  sun.castShadow=true;
  sun.shadow.mapSize.set(small()?1024:2048,small()?1024:2048);
  Object.assign(sun.shadow.camera,{left:-113,right:113,top:85,bottom:-85,near:1,far:275});
  sun.shadow.normalBias=.13;
  sun.shadow.bias=-.00022;
  scene.add(sun,sun.target);
  const rimLight=new T.DirectionalLight(0x8ea8e8,.85);rimLight.position.set(-60,36,-55);scene.add(rimLight);
  const warmLight=new T.DirectionalLight(0xffc49d,.25);warmLight.position.set(20,20,60);scene.add(warmLight);
  const accent=new T.SpotLight(0xc4e7ff,0,75,.7,.85,2);scene.add(accent,accent.target);
  facilityLighting(scene,sceneMaterial);
  const root=new T.Group();
  scene.add(root);
  const sections=new T.Group();
  scene.add(sections);
  const mat=(color,rough=.37,metal=.15)=>new T.MeshStandardMaterial({color,roughness:rough,metalness:metal,side:T.DoubleSide});
  const shell=mat(0xbdccd0,.38,.45), steel=mat(0x879ea4,.25,.7), dark=mat(0x253f47,.48,.48);
  const cyan=mat(0x00bfdc,.2,.14), warm=mat(0xef2949,.25,.13), blue=mat(0x24658d,.32,.33);
  cyan.emissive.setHex(0x057d9b);cyan.emissiveIntensity=.32;
  warm.emissive.setHex(0x97210d);warm.emissiveIntensity=.24;
  const ring=mat(0xcdd9d5,.35,.5);
  const fluidItems=[];
  const sectionObjects={};
  const spinners=[];
  const worldObjects=new Map();
  const selectionUniforms=new Map(Object.keys(equipment).map(id=>[id,{value:0}]));
  const bands=new Map(Object.keys(equipment).map(id=>[id,{value:new T.Vector3(-1000,1000,0)}]));
  const pickMeshes=[];
  const vesselCuts=new Map();
  let hoveredDevice=null, focusedDevice=null;
  function hover(id){
    const next=id!==focusedDevice&&selectionUniforms.has(id)?id:null;
    if(next===hoveredDevice)return;
    if(hoveredDevice)selectionUniforms.get(equipment[hoveredDevice].family||hoveredDevice).value=0;
    hoveredDevice=next;
    if(hoveredDevice){
      const family=equipment[hoveredDevice].family||hoveredDevice;
      selectionUniforms.get(family).value=1;
      bands.get(family).value.fromArray(hoverBand(hoveredDevice));
    }
    lens.setSelection(Boolean(hoveredDevice));
  }
  function registerDevice(obj,id){
    obj.traverse(mesh=>{
      if(!mesh.isMesh)return;
      mesh.userData.deviceId=id;
      const adapt=material=>{
        if(material.transparent||material.userData.pavement||material.name.includes('混凝土'))return material;
        const radius=vesselSelectionRadius[id];
        const highlighted=selectionMaterial(material,selectionUniforms.get(id),bands.get(id),at(equipment[id].point),radius);
        if(radius)highlighted.defines={...highlighted.defines,CURVED_SELECTION:1};
        return highlighted;
      };
      mesh.material=Array.isArray(mesh.material)?mesh.material.map(adapt):adapt(mesh.material);
    });
  }
  const wind=[];
  const sectionMeshes={intake:['new-intake'],frontTank:['tank_shell_1'],storage:['tank_shell_0'],hot:['sphere_shell'],cold:['cold_shell'],compressor:['compressor_shell'],turbine:['new-turbine'],intercooler:['new-intercooler'],recover:['new-recover'],thermal:['tank_shell_2','tank_shell_3','tank_shell_4','tank_shell_5']};
  function mesh(group,geometry,material,position){
    const result=new T.Mesh(geometry,material);
    result.position.copy(position);
    group.add(result);
    return result;
  }
  function box(group,size,material,x,y,z){
    return mesh(group,new T.BoxGeometry(size[0],size[2],size[1]),material,V(x,y,z));
  }
  function cylinder(group,r,height,material,x,y,z,{half=false,axis='z',open=false}={}){
    const item=mesh(group,new T.CylinderGeometry(r,r,height,64,1,open,0,half?Math.PI*1.5:Math.PI*2),material,V(x,y,z));
    if(axis==='x') item.rotation.z=-Math.PI/2;
    if(axis==='y'){item.rotation.x=Math.PI/2;if(half)item.rotateY(Math.PI);}
    return item;
  }
  function halfTank(group,{x,y,bottom,r,height,medium,sphere=false}){
    const center=bottom+height/2;
    if(sphere){
      // SphereGeometry uses a different azimuth convention than CylinderGeometry.
      const body=mesh(group,new T.SphereGeometry(r,64,32,0,Math.PI*1.5),shell,V(x,y,center));body.rotation.y=Math.PI/2;
      const inner=mesh(group,new T.SphereGeometry(r-.13,64,32,0,Math.PI*1.5),steel,V(x,y,center));inner.rotation.y=Math.PI/2;
      for(const angle of [0,Math.PI*1.5]){
        const pts=[];for(let i=0;i<=32;i++){const p=i/32*Math.PI;pts.push([x+Math.sin(angle)*r*Math.sin(p),y-Math.cos(angle)*r*Math.sin(p),center+r*Math.cos(p)]);}
        pipe(group,pts,.075,ring);
      }
    }else{
      cylinder(group,r,height,shell,x,y,center,{half:true,open:true});
      cylinder(group,r-.12,height,steel,x,y,center,{half:true,open:true});
      cylinder(group,r,.16,steel,x,y,bottom+.08,{half:true});
      for(const [dx,dy] of [[0,-r],[-r,0]])box(group,[.14,.14,height],ring,x+dx,y+dy,center);
      const lid=mesh(group,new T.SphereGeometry(r,48,20,0,Math.PI*1.5,0,Math.PI/2),shell,V(x,y,bottom+height));lid.rotation.y=Math.PI/2;lid.scale.y=.23;
    }
    const color=medium==='storage'?palette.liquid:medium==='hot'?palette.heat:palette[medium];
    const volume=reservoir(group,{x,y,bottom,r:r-.18,height,color,sphere});
    fluidItems.push({...volume,medium});
    // Subtle transparent inspection skin indicates the original vessel envelope.
    const skin=new T.MeshPhysicalMaterial({color:0x92d9e8,metalness:.25,roughness:.24,transparent:true,opacity:.035,depthWrite:false});
    const geo=sphere?new T.SphereGeometry(r,24,12):new T.CylinderGeometry(r,r,height,24,6,true);
    mesh(group,geo,skin,V(x,y,center));
  }
  function makeSection(id,build){
    const group=new T.Group();
    group.visible=false;
    sections.add(group);
    sectionObjects[id]=group;
    build(group);
  }
  makeSection('intake',g=>{
    const wall=mat(0xbec8cd,.4,.42);
    // Lift the front and lid away to reveal both filtration and purification.
    box(g,[6,6,.24],steel,30,-25,.39);
    box(g,[6,.20,4.3],wall,30,-22.1,2.4);
    for(const x of [27.1,32.9])box(g,[.20,6,4.3],wall,x,-25,2.4);
    for(const [y,color] of [[-26.3,0x8fabb8],[-24.25,0x507386]]){
      const filter=mat(color,.36,.52);
      for(let i=0;i<18;i++)box(g,[.13,.36,3.3],filter,27.78+i*.26,y,2.4);
      for(const z of [.69,4.11])box(g,[5.1,.48,.17],ring,30,y,z);
    }
    for(const x of [27.2,32.8])box(g,[.23,.25,4.28],steel,x,-27.97,2.4);
  });
  makeSection('frontTank',g=>halfTank(g,{x:-44,y:-20,bottom:1.5,r:6.25,height:8.5,medium:'water'}));
  makeSection('storage',(g)=>halfTank(g,{x:-44,y:22,bottom:1.65,r:6.42,height:11.05,medium:'storage'}));
  makeSection('hot',(g)=>halfTank(g,{x:-44,y:1,bottom:2.85,r:6.18,height:12.3,medium:'hot',sphere:true}));
  const plateMaterials=[];
  let coldLiquid;
  makeSection('cold',(g)=>{

    for(const height of [19.6,9.1]){
      const plates=new T.MeshPhysicalMaterial({
        color:0x728b9c,emissive:0,metalness:.52,roughness:.30,transparent:true,opacity:.40,depthWrite:false
      });
      plateMaterials.push(plates);
      for(let row=0;row<6;row++)box(g,[3.3,.24,4.8],plates,-29.6,22.05+row*.59,height);
    }
    box(g,[7.5,8.3,.46],dark,-29,24,1.2);
    box(g,[1.15,8.3,.45],steel,-25.825,24,27.5);
    box(g,[6.35,4.15,.45],steel,-29.575,26.075,27.5);
    box(g,[7.5,.38,26.2],blue,-29,28,14.2);
    box(g,[.38,8.2,26.2],blue,-25.42,24,14.2);
    box(g,[1.15,.38,26.2],blue,-25.825,19.9,14.2);
    box(g,[.38,4.15,26.2],blue,-32.58,26.075,14.2);
    for(const x of [-32.4,-25.6]) for(const y of [20,28]) box(g,[.19,.21,26],ring,x,y,14.2);
    for(const height of [3.9,11,18,25]){
      box(g,[6.3,6.4,.35],dark,-29,24,height);
      for(let row=0;row<6;row++) box(g,[6.18,.25,.3],steel,-29,21.2+row*.95,height+.3);
    }
    // The liquid fills the exposed interior envelope, including both exchanger decks.
    const x=-29,y=24,floor=1.55,width=6.80,depth=7.57,height=25.60;
    const wallGeometry=new T.BoxGeometry(width,1,depth);
    const wallIndices=[];
    for(const {start,count,materialIndex} of wallGeometry.groups){
      if(materialIndex===2||materialIndex===3)continue;
      for(let i=start;i<start+count;i++)wallIndices.push(wallGeometry.index.getX(i));
    }
    wallGeometry.setIndex(wallIndices);
    wallGeometry.clearGroups();
    const bodyMaterial=waterMaterial(0x239edc);
    bodyMaterial.side=T.FrontSide;
    bodyMaterial.opacity=.45;
    bodyMaterial.emissiveIntensity=.28;
    const liquid=mesh(g,wallGeometry,bodyMaterial,V(x,y,floor));
    liquid.renderOrder=3;

    const surfaceMaterial=waterMaterial(0x65d7f4,true);
    surfaceMaterial.opacity=.77;
    surfaceMaterial.emissiveIntensity=.66;
    surfaceMaterial.depthWrite=false;
    const surface=mesh(g,new T.PlaneGeometry(width,depth,32,26),surfaceMaterial,V(x,y,floor));
    surface.rotation.x=-Math.PI/2;
    surface.renderOrder=4;
    const meniscus=new T.Group();
    meniscus.position.copy(V(x,y,floor));
    g.add(meniscus);
    const edge=new T.MeshBasicMaterial({
      color:new T.Color(0x83e6fc).multiplyScalar(1.36),transparent:true,opacity:.83,depthWrite:false,toneMapped:false
    });
    box(meniscus,[width,.057,.060],edge,0,-depth/2,0).renderOrder=5;
    box(meniscus,[.057,depth,.060],edge,-width/2,0,0).renderOrder=5;
    for(let tick=0;tick<=10;tick++){
      const major=tick===0||tick===5||tick===10;
      box(g,[major?.43:.17,.084,.049],ring,-32.38,19.98,floor+tick*height/10);
    }
    coldLiquid={liquid,surface,meniscus,floor,height};
    cylinder(g,.13,5.4,steel,topPorts.coldIn[0],topPorts.coldIn[1],25);
    
  });
  function machine(g,position,r,length,axis,color){
    const [x,y,z]=position;
    cylinder(g,r,length,color,x,y,z,{half:true,axis,open:true});
    cylinder(g,r-.12,length,steel,x,y,z,{half:true,axis,open:true});
    cylinder(g,r*.98,.22,steel,x-(axis==='x'?length/2:0),y+(axis==='y'?length/2:0),z,{half:true,axis});
    cylinder(g,.36,length+1,steel,x,y,z,{axis});
    const rotor=new T.Group();
    rotor.position.copy(V(x,y,z));
    if(axis==='x') rotor.rotation.z=-Math.PI/2;
    else rotor.rotation.x=Math.PI/2;
    g.add(rotor);
    const blades=new T.Group();
    rotor.add(blades);
    const bladeMaterial=ring.clone();
    for(let k=0;k<4;k++){
      const a=(k-1.5)*length*.19;
      mesh(blades,new T.CylinderGeometry(r*.44,r*.44,.24,22),steel,new T.Vector3(0,a,0));
      for(let j=0;j<12;j++){
        const angle=j*Math.PI/6;
        const blade=mesh(blades,new T.BoxGeometry(r*.49,.17,r*.19),bladeMaterial,new T.Vector3(Math.cos(angle)*r*.66,a,Math.sin(angle)*r*.66));
        blade.rotation.y=-angle+.23;
      }
    }
    const trigger=axis==='x'?{8:'compress1',[-9]:'compress2',[-23]:'compress3'}[x]:(y>-23?'expand':'expandLast');
    // Fine advected gas tracers reveal the axial passage through the rotor stages.
    const gasGeometry=new T.BufferGeometry(),gasPositions=[];
    for(let i=0;i<180;i++){
      const a=i*2.399963,rr=r*(.45+.34*((i*.618034)%1));
      gasPositions.push(Math.cos(a)*rr,((i*.414214)%1-.5)*length,Math.sin(a)*rr);
    }
    gasGeometry.setAttribute('position',new T.Float32BufferAttribute(gasPositions,3));
    const gas=new T.Points(gasGeometry,new T.ShaderMaterial({
      uniforms:{time:clock,extent:{value:length},travel:{value:axis==='x'?-1:1},tint:{value:new T.Color(axis==='x'?palette.air:palette.expanded)}},
      vertexShader:'uniform float time,extent,travel;void main(){vec3 p=position;p.y=mod(p.y+extent*.5+travel*time*2.8,extent)-extent*.5;vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp(170./-v.z,1.5,6.);}',
      fragmentShader:'uniform vec3 tint;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(tint*2.8,exp(-r*r*6.)*.72);}',
      transparent:true,depthWrite:false,blending:T.AdditiveBlending
    }));
    gas.frustumCulled=false;rotor.add(gas);
    spinners.push({obj:blades,trigger,material:bladeMaterial,gas});
  }
  makeSection('compressor',(g)=>{for(const [x,r,l] of [[-23,2.52,7],[-9,2.43,7],[8,2.81,11]]) machine(g,[x,-25,6.2],r,l,'x',shell);});
  makeSection('turbine',(g)=>{for(const [y,r,l] of turbineStages) machine(g,[45,y,5],r,l,'y',blue);});

  function exchanger(g,x,y,z,r,len,axis){
    cylinder(g,r,len,shell,x,y,z,{half:true,axis,open:true});
    cylinder(g,r-.09,len,steel,x,y,z,{half:true,axis,open:true});
    for(const sign of [-1,1]) cylinder(g,r*.98,.13,steel,x+(axis==='x'?sign*len/2:0),y+(axis==='y'?sign*len/2:0),z,{half:true,axis});
    for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++){
      if(i*i+j*j>5)continue;
      cylinder(g,.075,len-.3,i%2?cyan:warm,x+(axis==='y'?i*r*.28:0),y+(axis==='x'?i*r*.28:0),z+j*r*.28,{axis});
    }
    for(let k=-2;k<=2;k++) cylinder(g,r*.83,.07,steel,x+(axis==='x'?k*len*.17:0),y+(axis==='y'?k*len*.17:0),z,{half:true,axis});
  }
  function exchangerSection(group,vessels,bend){
    for(const {center,radius,length,axis} of vessels)exchanger(group,...center,radius,length-2*radius,axis);
    const mid=(bend.ends+bend.bend)/2, length=Math.abs(bend.ends-bend.bend);
    for(const z of [bend.low,bend.high]){
      const coords=bend.axis==='x'?[mid,bend.center]:[bend.center,mid];
      exchanger(group,...coords,z,bend.radius,length,bend.axis);
    }
    // Keep the swept elbow visible in the cutaway so the two legs read as one device.
    const curve=returnCurve(bend).curves[1];
    mesh(group,new T.TubeGeometry(curve,30,bend.radius,24),shell,new T.Vector3());
  }
  makeSection('intercooler',g=>exchangerSection(g,centralVessels,centralReturn));
  makeSection('recover',g=>exchangerSection(g,[reheatVessel],reheatReturn));
  makeSection('thermal',g=>{for(const [x,y,r,h] of [[-6,24,8.3,13.3],[15,24,8.3,13.3],[33,25,5.5,9.5],[48,25,5.5,9.5]])halfTank(g,{x,y,bottom:1.4,r,height:h,medium:({[-6]:'cold',15:'return',33:'pinkCold',48:'pinkReturn'})[x]});});

  function pipe(group,points,radius,material){
    const curve=new T.CatmullRomCurve3(points.map(at),false,'centripetal');
    return mesh(group,new T.TubeGeometry(curve,Math.min(80,points.length*9),radius,6,false),material,new T.Vector3());
  }
  let plantPipes;
  let routes=[];
  function route(name,type,points,inside=false,curve,radius){
    return flowRoute(scene,name,type,points,palette[type],inside,curve,radius);
  }
  const vertical=([x,y,z],end)=>[[x,y,z],[x,y,end]];
  const interiors=[];
  function passage(section,trigger,type,points,curve){
    interiors.push(route(section+':'+trigger,type,points,true,curve||roundedPipe(points,.38)));
  }
  passage('intake','atmosphere','air',[[30,-28.2,2.4],[30,-25,2.4],[30,-23.15,2.4],[27,-23.15,2.4],[27,-25,2.2]]);
  const split=[-29.45,23.5,13.9];
  const upper=[topPorts.coldIn,[-32.1,22.5,22.1],[-27.2,22.5,22.1],[-27.2,22.5,19.6],[-31.5,22.5,19.6],[-31.5,23.5,13.9],split];
  const lower=[split,[-27.3,23.5,13.9],[-27.3,23.5,11.65],[-31.95,23.5,11.65]];
  const condensate=[-31.95,23.5,9.7];
  const liquidPort=[-28.95,23.1,2.35];
  const transfer=[liquidPort,[-28.2,23.1,2.35],[-28.2,24.7,2.35],[-30.8,24.7,2.35],topPorts.coldOut];
  passage('cold','toCold','pressure',upper.slice(0,2));
  passage('cold','mediaCharge0','pressure',upper.slice(1));
  passage('cold','mediaCharge2','pressure',lower);
  passage('cold','mediaCharge2','liquid',[lower.at(-1),condensate]);
  passage('cold','pump','liquid',[...transfer].reverse());
  passage('cold','toTank','liquid',transfer);
  passage('cold','mediaRecover2','liquid',[condensate,lower.at(-1),[-28.0,23.5,11.65]]);
  passage('cold','mediaRecover0','pressure',[[-28,23.5,11.65],[-28,23.5,16.4],[-31.3,23.5,16.4],[-31.3,21.7,16.4],[-31.4,21.7,12.2]]);
  passage('cold','warm','expanded',[[-31.4,21.7,12.2],topPorts.coldAir]);
  for(let i=0;i<4;i++)for(let mode=0;mode<2;mode++){
    const id=(mode?'mediaRecover':'mediaCharge')+i, [type]=paths[id];
    const inward=(i%2===0)===(mode===0);
    const roof=topPorts.coldMedia[2*i+mode],bottom=i<2?18.5:8.1;
    const [x,,z]=roof;
    const duct=[roof,[x,21.2,z],[x,21.2,bottom],[x,24,bottom],[-29.15,24,bottom]];
    passage('cold',id,type,inward?duct:[...duct].reverse());
    const fill=vertical(thermalNozzles[i][mode],4.4);
    passage('thermal',id,type,inward?[...fill].reverse():fill);
  }
  for(const [section,port,depth,fill,draw,type] of [
    ['storage',topPorts.storageIn,5,'toTank','pump','liquid'],
    ['hot',topPorts.hotIn,6,'hotTrunk','hotSupply','heat'],
    ['frontTank',topPorts.frontTank,4,'waterReturn','waterTrunk','water']
  ]){
    passage(section,fill,type,vertical(port,depth));
    passage(section,draw,type,vertical(port,depth).reverse());
  }
  passage('intercooler','cool3','air',paths.cool3[1],returnCurve(centralReturn,true));
  for(const id of ['cool1','cool2'])passage('intercooler',id,'air',paths[id][1]);
  for(const [i,waterPort] of hxPorts.centralCoolant.entries()){
    const hotPort=hxPorts.centralHeat[i], midZ=i===2?4.92:3.45;
    passage('intercooler','waterIn'+i,'water',vertical(waterPort,midZ));
    passage('intercooler','hotOut'+i,'heat',vertical(hotPort,midZ).reverse());
  }
  passage('recover','warmBend','expanded',paths.warmBend[1],returnCurve(reheatReturn));
  passage('recover','reheat','expanded',paths.reheat[1]);
  for(const [supply,drain] of [['reheatHotA','reheatColdA'],['reheatHotB','reheatColdB']]){
    const inlet=paths[supply][1].at(-1), outlet=paths[drain][1][0];
    const channel=inlet[2]-(supply.endsWith('A')?.64:.96);
    passage('recover',supply,'heat',vertical(inlet,channel));
    passage('recover',drain,'water',[[inlet[0],inlet[1],channel],[outlet[0],outlet[1],channel],outlet]);
  }
  for(const r of interiors)[r.section,r.trigger]=r.name.split(':');
  let selectedCuts=new Set();
  let energizeCables;
  let activeIds=[];
  let fly=null;
  let ready=false;
  function moveCamera(point,offset,instant=false){
    const target=at(point), next=target.clone().add(at(offset));
    if(instant||reduced){
      controls.target.copy(target);camera.position.copy(next);controls.update();fly=null;
    }else fly={p:camera.position.clone(),t:controls.target.clone(),next,target,start:performance.now()};
  }
  function overview(instant){
    focusedDevice=null;hover(null);
    resize();
    lens.setActive(false);accent.intensity=0;
    const ratio=camera.aspect;
    const zoom=ratio<1.35?Math.min(2.2,1.39/ratio):1;
    controls.maxDistance=small()?640:420;
    moveCamera([-12,8,12],[82*zoom,-142*zoom,29*zoom],instant);
  }
  function focus(id,frame){const device=equipment[id];if(device){
    focusedDevice=id;hover(null);
    const framing=Math.min(1.6,Math.max(1,1/camera.aspect));
    moveCamera(frame?.[0]||device.point,(frame?.[1]||device.offset).map(v=>v*framing));
    lens.setActive(true);accent.intensity=1300;accent.target.position.copy(at(device.point));accent.position.copy(at(device.point)).add(V(-8,-10,16));
  }}
  function setSection(ids){
    if(!ready)return;
    const next=new Set(ids.filter(id=>sectionObjects[id]));
    if(next.size===selectedCuts.size&&[...next].every(id=>selectedCuts.has(id)))return;
    selectedCuts=next;
    for(const [id,section] of Object.entries(sectionObjects)){
      section.visible=next.has(id);
      for(const name of sectionMeshes[id]){
        const item=worldObjects.get(name);
        if(item)item.visible=!section.visible;
      }
    }
    for(const [id,uniform] of vesselCuts)uniform.value=Number(next.has(id));
    renderer.shadowMap.needsUpdate=true;
  }
  function resize(){
    const width=host.clientWidth,height=host.clientHeight;
    if(!width||!height)return;
    camera.aspect=width/height;camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);lens.resize(Math.round(width*renderer.getPixelRatio()),Math.round(height*renderer.getPixelRatio()));
  }
  const observe=new ResizeObserver(resize);
  observe.observe(host);resize();overview(true);
  controls.addEventListener('start',()=>{fly=null;});
  const raycaster=new T.Raycaster();
  const pointer=new T.Vector2();
  let press=null, pendingHover=null, lastRaycast=0;
  const canvas=renderer.domElement;
  canvas.addEventListener('pointerdown',event=>{
    pendingHover=null;hover(null);
    press=event.isPrimary&&event.button===0?{id:event.pointerId,x:event.clientX,y:event.clientY}:null;
  });
  canvas.addEventListener('pointermove',event=>{
    if(press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>6)press=null;
    if(event.pointerType==='mouse'&&!event.buttons&&!fly)pendingHover=[event.clientX,event.clientY];
  });
  function clearHover(){pendingHover=null;hover(null);canvas.style.cursor='';}
  canvas.addEventListener('pointerleave',clearHover);
  canvas.addEventListener('pointercancel',()=>{press=null;clearHover();});
  function deviceAt(x,y){
    const bounds=canvas.getBoundingClientRect();
    pointer.set((x-bounds.left)/bounds.width*2-1,1-(y-bounds.top)/bounds.height*2);
    raycaster.setFromCamera(pointer,camera);
    for(const {object,face,point} of raycaster.intersectObjects(pickMeshes,false)){
      const material=Array.isArray(object.material)?object.material[face?.materialIndex??0]:object.material;
      if(material.transparent)continue;
      let visible=true;
      for(let node=object;node&&visible;node=node.parent)visible=node.visible;
      if(!visible)continue;
      return pickMember(object.userData.deviceId,point.x,-point.z)??null;
    }
    return null;
  }
  canvas.addEventListener('pointerup',event=>{
    const click=press?.id===event.pointerId&&Math.hypot(event.clientX-press.x,event.clientY-press.y)<=6;
    press=null;
    if(!click||!ready)return;
    clearHover();
    const id=deviceAt(event.clientX,event.clientY);
    if(id)onSelect(id);
  });
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;onError('三维渲染已中断，请重试');});
  const environment=duskEnvironment(renderer);
  scene.environment=environment.texture;
  scene.environmentIntensity=.56;
  async function load(){
    const loader=new GLTFLoader();
    onProgress('正在读取场站模型');
    const model=await loader.loadAsync(host.dataset.modelUrl||'./assets/station.glb',event=>{
      if(event.total)onProgress('正在读取场站模型',event.loaded/event.total);
    });
    performance.mark('station-model-decoded');
    onProgress('正在准备设备和管线');
    await afterPaint();
    const tuned=new Set();
    model.scene.traverse(obj=>{
      const group=obj.userData.group;
      if(group)worldObjects.set(group,obj);
      if(!obj.isMesh)return;
      const id=group||obj.parent.userData.group||'';
      if(id.startsWith('02_'))trimRearRoadJunction(obj);
      if(id.startsWith('00_')){
        obj.scale.set(3.8,1,3.8);
        const uv=obj.geometry.attributes.uv;
        if(uv){for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*3.8,uv.getY(i)*3.8);uv.needsUpdate=true;}
      }
      obj.receiveShadow=true;
      obj.castShadow=!/^(00_|01_|02_|rotor_)/.test(id);
      const mats=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const material of mats){if(!tuned.has(material)){sceneMaterial(material);tuned.add(material);}}
    });
    root.add(model.scene);
    const inputPylon=worldObjects.get('52_GRID_镀锌格构电塔');
    if(inputPylon){
      const outputPylon=inputPylon.clone();
      outputPylon.position.add(V(160,61,0));
      root.add(outputPylon);
      registerDevice(outputPylon,'grid');
    }
    // Cut only the matching quadrant of roof details, keeping the other 270° intact.
    const vesselDetails=[['10_TK01_左后立罐','storage',-44,22,6.55],['11_TK02_左前立罐','frontTank',-44,-20,6.36],['12_HT01_球形储罐','hot',-44,1,6.4],['13_TK03_后排大罐A','thermal',-6,24,8.4],['14_TK04_后排大罐B','thermal',15,24,8.4],['15_TK05_后排小罐A','thermal',33,25,5.6],['16_TK06_后排小罐B','thermal',48,25,5.6]];
    for(const [name,id,x,y,r] of vesselDetails){
      const group=worldObjects.get(name);
      if(!group)continue;
      const center={value:new T.Vector2(x,-y)};
      const radius={value:r};
      if(!vesselCuts.has(id))vesselCuts.set(id,{value:0});
      const enabled=vesselCuts.get(id);
      group.traverse(obj=>{
        if(!obj.isMesh)return;
        const adapt=original=>{
          const material=original.clone();
          material.onBeforeCompile=shader=>{
            original.onBeforeCompile(shader);
            shader.uniforms.vesselCut=enabled;
            shader.uniforms.vesselCenter=center;
            shader.uniforms.vesselRadius=radius;
            shader.vertexShader='varying vec3 vesselP;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvesselP=(modelMatrix*vec4(transformed,1.)).xyz;');
            shader.fragmentShader='varying vec3 vesselP;uniform float vesselCut,vesselRadius;uniform vec2 vesselCenter;\n'+shader.fragmentShader;
            shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
              vec2 relativeToVessel=vesselP.xz-vesselCenter;
              if(vesselCut>.5 && relativeToVessel.x<0. && relativeToVessel.y>0. && vesselP.y>2. && length(relativeToVessel)<vesselRadius)discard;`);
          };
          // The same cutaway program serves every tank. The center/radius are uniforms.
          material.customProgramCacheKey=()=>original.customProgramCacheKey()+'-vessel-cut';
          return material;
        };
        obj.material=Array.isArray(obj.material)?obj.material.map(adapt):adapt(obj.material);
      });
    }
    const plant=replacePlantGeometry(worldObjects,root);
    energizeCables=buildGridCables(root);
    energizeCables(activeIds.includes('export'));
    plantPipes=plant.pipes;
    for(const [id,{shell,fittings}] of Object.entries(plant.components)){
      worldObjects.set('new-'+id,shell);
      registerDevice(shell,id);
      registerDevice(fittings,id);
    }
    routes=Object.entries(paths).filter(([id])=>!/^cool[123]$|^warmBend$|^reheat$/.test(id)).map(([name,[type,points]])=>{
      const hardware=plantPipes.get(reverseRoutes[name]||name);
      const curve=reverseRoutes[name]?roundedPipe(points,.72):hardware?.curve;
      return route(name,type,points,false,curve,hardware?.radius);
    });
    for(const [i,x] of [-90,-76,-62].entries()){
      const rotor=worldObjects.get('rotor_'+i);
      if(!rotor)continue;
      const origin=V(x,17.3,19.5);
      const pivot=new T.Group();
      root.add(pivot);
      pivot.position.copy(origin);
      pivot.attach(rotor);
      wind.push(pivot);
    }
    for(const [name,obj] of worldObjects){
      const mapping=Object.entries(deviceGroups).find(([,pattern])=>pattern.test(name));
      if(mapping)registerDevice(obj,mapping[0]);
    }
    for(const [id,section] of Object.entries(sectionObjects))registerDevice(section,id);
    for(const group of [root,sections])group.traverse(obj=>{if(obj.isMesh)pickMeshes.push(obj);});
    onProgress('正在准备高清画面');
    await afterPaint();
    await lens.prepare(scene);
    performance.mark('station-shaders-prepared');
    renderer.shadowMap.needsUpdate=true;
    twilight.update(0,camera);
    lens.render(scene,camera.position.distanceTo(controls.target));
    performance.mark('station-first-frame');
    ready=true;
    host.style.visibility='visible';
    onReady();
  }
  load().catch(error=>{console.error(error);onError('三维模型载入失败，请重试');});

  let activePipeIds=new Set();
  function setFlows(ids){
    if(activeIds===ids)return;
    activeIds=ids;
    energizeCables?.(ids.includes('export'));
    activePipeIds=new Set(ids.map(name=>reverseRoutes[name]||name));
    plateMaterials.forEach((plates,tier)=>{
      const flowing=ids.includes('mediaCharge'+tier*2)||ids.includes('mediaRecover'+tier*2);
      plates.emissive.setHex(flowing?(tier?palette.pinkCold:palette.cold):0);
      plates.emissiveIntensity=flowing?.29:0;
    });
  }
  const projected=new T.Vector3();
  function project(point){
    projected.copy(at(point)).project(camera);
    return projected.z>1||projected.z<0?null:[(projected.x+1)*.5, (1-projected.y)*.5];
  }
  function frame(now,t,levels){
    if(!ready||document.hidden)return;
    if(fly){
      const u=Math.min(1,(now-fly.start)/1000),ease=u*u*(3-2*u);
      camera.position.lerpVectors(fly.p,fly.next,ease);
      controls.target.lerpVectors(fly.t,fly.target,ease);
      if(u>=1)fly=null;
    }
    controls.update();
    if(pendingHover&&now-lastRaycast>42){
      const id=deviceAt(...pendingHover);
      hover(id);
      canvas.style.cursor=id?'pointer':'';
      pendingHover=null;
      lastRaycast=now;
    }
    twilight.update(t,camera);
    for(const rotor of wind)rotor.rotation.z=t*.77;
    for(const spin of spinners){
      const working=activeIds.includes(spin.trigger);
      if(working)spin.obj.rotation.y=t*(spin.trigger.startsWith('expand')?5.1:3.6);
      spin.material.emissive.setHex(working?palette.air:0);
      spin.material.emissiveIntensity=.52;
      spin.gas.visible=working;
    }
    if(selectedCuts.has('cold')){
      const {liquid,surface,meniscus,floor,height}=coldLiquid;
      const depth=height*levels.coldBox;
      liquid.scale.y=depth;
      liquid.position.y=floor+depth*.5;
      surface.position.y=floor+depth;
      meniscus.position.y=floor+depth-.028;
    }
    clock.value=t;
    for(const item of fluidItems)if(item.body.parent.visible)updateReservoir(item,levels[item.medium]);
    for(const [id,{mesh}] of plantPipes)mesh.visible=!activePipeIds.has(id);
    for(const r of routes){
      r.group.visible=activeIds.includes(r.name);
      if(r.group.visible)updateFlow(r,t,camera);
    }
    for(const r of interiors){
      r.group.visible=selectedCuts.has(r.section)&&activeIds.includes(r.trigger);
      if(r.group.visible)updateFlow(r,t,camera);
    }
    lens.render(scene,camera.position.distanceTo(controls.target));

  }
  return {frame,focus,overview,hover,setSection,setFlows,project,resize,setDepthOfField:v=>lens.setEnabled(v),isReady:()=>ready,
    stats:()=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles})};
}