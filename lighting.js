import * as T from 'three';
const V=(x,y,z)=>new T.Vector3(x,z,-y);

// Broad dusk reflections make curved tanks readable between the practical lights.
export function duskEnvironment(renderer){
  const room=new T.Scene();room.background=new T.Color(0x374763);
  const panel=(color,power,position,size)=>{
    const item=new T.Mesh(new T.PlaneGeometry(...size),new T.MeshBasicMaterial({color:new T.Color(color).multiplyScalar(power),side:T.DoubleSide}));
    item.position.set(...position);item.lookAt(0,0,0);room.add(item);
  };
  panel(0xbad5ff,2.1,[-9,9,3],[7,16]);
  panel(0xe8efff,3.0,[5,8,-7],[3,15]);
  panel(0xffc897,2.3,[-3,4,10],[3,9]);
  panel(0x779ed9,1.5,[0,13,0],[17,8]);
  const pmrem=new T.PMREMGenerator(renderer),result=pmrem.fromScene(room,.12,.1,100);
  pmrem.dispose();room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  return result;
}

export function finishDuskMaterial(m){
  const n=m.name;
  m.envMapIntensity=1;
  if(n.includes('草')){
    // Quiet, blue-grey hardscape around the plant, without a green carpet.
    m.map=null;m.normalMap=null;m.roughnessMap=null;m.metalnessMap=null;
    m.color.setHex(0x262c38);m.metalness=.08;m.roughness=.91;
  }else if(n.includes('混凝土')){
    m.color.setHex(0x8190a5);m.roughness=.78;m.metalness=.03;m.metalnessMap=null;
    m.normalScale?.set(.22,.22);
  }else if(n.includes('沥青')){
    m.color.setHex(0x7287a3);m.roughness=.63;m.metalness=.08;m.metalnessMap=null;
    m.normalScale?.set(.2,.2);
  }else if(n.includes('不锈钢')||n.includes('镀锌')){
    m.map=null;m.metalnessMap=null;m.roughnessMap=null;
    m.color.setHex(n.includes('镀锌')?0x95a7bf:0xd0d9e5);
    m.metalness=.88;m.roughness=n.includes('镀锌')?.34:.25;
    m.normalScale?.set(.08,.08);
  }else if(n.includes('涂装')||n.includes('金属板')||n.includes('保温')){
    m.map=null;m.metalnessMap=null;m.roughnessMap=null;
    m.color.setHex(n.includes('暖白')?0xd2dbe5:n.includes('蓝色')?0x245f9e:n.includes('保温')?0x317181:0x78869e);
    m.metalness=n.includes('暖白')?.18:.35;m.roughness=.3;
    if(m.isMeshPhysicalMaterial){m.clearcoat=.38;m.clearcoatRoughness=.24;}
    m.normalScale?.set(.045,.045);
  }else if(n.includes('安全黄')){
    m.map=null;m.color.setHex(0xe4ad55);m.metalness=.35;m.roughness=.32;
  }else if(n.includes('深蓝窗')){
    m.map=null;m.color.setHex(0x354962);m.roughness=.22;m.metalness=.35;
    m.emissive.setHex(0xffd3a0);m.emissiveIntensity=1.7;
  }else if(n.includes('深灰钢')){
    m.color.setHex(0x62788d);m.metalness=.5;m.roughness=.34;
  }
}

export function facilityLighting(scene,finishPavement){
  const root=new T.Group();root.name='暮色工业照明';scene.add(root);
  const rigs=[];
  function spot(name,target,origin,color,power,angle=.6,shadow=false){
    const light=new T.SpotLight(color,power,85,angle,.85,2);
    light.name=name;light.position.copy(V(...origin));light.target.position.copy(V(...target));
    light.castShadow=shadow;
    light.shadow.mapSize.set(1024,1024);light.shadow.normalBias=.08;light.shadow.bias=-.0002;
    scene.add(light,light.target);rigs.push(light);
  }
  spot('冷箱冷白轮廓',[-29,24,15],[-42,7,29],0xc4d8ff,3800,.53,true);
  spot('储气与球罐暖白洗墙',[-44,9,8],[-60,-5,23],0xffb97e,4300,.7);
  spot('蓄冷罐组左侧',[-3,24,7],[-10,8,24],0xdce6ff,4200,.62);
  spot('蓄冷罐组右侧',[36,25,6],[42,10,22],0xffbc83,3400,.6);
  spot('压缩机工作照明',[-10,-25,5],[-17,-40,23],0xdce7ff,4400,.9,true);
  spot('透平工作照明',[43,-19,5],[58,-30,21],0xbdd8ff,3500,.7);
  spot('换热器暖侧光',[23,-2,4],[23,9,16],0xffc590,2000,.95);
  spot('厂房入口照明',[0,50,3],[0,42,16],0xffdeb5,1800,.95);

  const metal=new T.MeshStandardMaterial({color:0x5b708c,metalness:.72,roughness:.32});
  const housing=new T.MeshStandardMaterial({color:0x253448,metalness:.55,roughness:.4});
  const warm=new T.MeshStandardMaterial({color:0xffe1b4,emissive:0xffd1a0,emissiveIntensity:9});
  const cool=new T.MeshStandardMaterial({color:0xe5efff,emissive:0xc7e1ff,emissiveIntensity:7});
  const coords=[[-103,-43],[-78,-43],[-53,-43],[-28,-43],[-3,-43],[24,-43],[56,-43],[73,-21],[-54,34],[-27,35],[-3,35],[22,35],[55,35],[-91,44],[-65,44],[-38,44],[26,44],[56,44],[78,44]];
  const poles=new T.InstancedMesh(new T.CylinderGeometry(.09,.14,8,8),metal,coords.length);
  const heads=new T.InstancedMesh(new T.BoxGeometry(1.7,.24,.62),housing,coords.length);
  const lamps=new T.InstancedMesh(new T.BoxGeometry(1.45,.12,.49),warm,coords.length);
  const dummy=new T.Object3D();
  coords.forEach(([x,y],i)=>{
    dummy.position.copy(V(x,y,4.18));dummy.updateMatrix();poles.setMatrixAt(i,dummy.matrix);
    dummy.position.copy(V(x,y,8.18));dummy.updateMatrix();heads.setMatrixAt(i,dummy.matrix);
    dummy.position.copy(V(x,y,8.03));dummy.updateMatrix();lamps.setMatrixAt(i,dummy.matrix);
  });root.add(poles,heads,lamps);

  // Soft pools are a low-cost indirect-light approximation beneath practical fixtures.
  const poolMat=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    uniforms:{tint:{value:new T.Color(0xffbe86)}},
    vertexShader:'varying vec2 p;void main(){p=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 p;uniform vec3 tint;void main(){float d=dot(p,p);float a=exp(-d*3.5)*(1.-smoothstep(.45,1.,d));gl_FragColor=vec4(tint*.46,a*.32);}'
  });
  const poolGeo=new T.PlaneGeometry(15,12);
  for(const [x,y]of coords){const pool=new T.Mesh(poolGeo,poolMat);pool.rotation.x=-Math.PI/2;pool.position.copy(V(x,y,y>36?.3:.26));root.add(pool);}
  // Continuous work lights along the real pipe rack, with short warm equipment accents.
  const stripGeo=new T.BoxGeometry(7.6,.065,.11);
  for(let x=-35;x<49;x+=12){
    const strip=new T.Mesh(stripGeo,cool);strip.position.copy(V(x,9.2,5.8));root.add(strip);
    const warmStrip=new T.Mesh(stripGeo,warm);warmStrip.position.copy(V(x,10.8,3.7));root.add(warmStrip);
  }
  for(const [x,y,z]of [[-32.9,20,13.9],[-25.1,20,13.9]]){
    const bar=new T.Mesh(new T.BoxGeometry(.07,.09,20),cool);
    bar.rotation.x=Math.PI/2;bar.position.copy(V(x,y,z));root.add(bar);
  }
  for(const [x,y] of [[-44,-20],[-44,1],[-44,22],[-6,24],[15,24],[33,25],[48,25]]){
    const lamp=new T.Mesh(new T.BoxGeometry(.55,.14,.4),cool);lamp.position.copy(V(x-3,y-6,.55));root.add(lamp);
  }
  buildApron(root,finishPavement);
  return {rigs,root};
}

function buildApron(group,finishPavement){
  const concrete=new T.MeshPhysicalMaterial({color:0x3c4554,roughness:.75,metalness:.06});
  const asphalt=new T.MeshPhysicalMaterial({color:0x202b3e,roughness:.56,metalness:.08});
  concrete.userData.pavement='concrete';
  asphalt.userData.pavement='asphalt';
  finishPavement(concrete);
  finishPavement(asphalt);
  const curb=new T.MeshStandardMaterial({color:0x566274,roughness:.72});
  const stripe=new T.MeshStandardMaterial({color:0xc9d3de,roughness:.66});
  const plane=(w,h,mat,x,y,z)=>{
    const item=new T.Mesh(new T.PlaneGeometry(w,h),mat);item.rotation.x=-Math.PI/2;
    item.position.copy(V(x,y,z));item.receiveShadow=true;group.add(item);return item;
  };
  // The GLB ground ends at -0.10. Keep the apron above it and trim both roads
  // to the same junction boundary so neither asphalt surface overlaps.
  const apronY=.02, curbY=.07, roadY=.11, stripeY=.14;
  plane(188,86,concrete,-23,-3,apronY);
  plane(196,10,curb,-17,-48,curbY);
  plane(194.85,7.7,asphalt,-17.575,-48,roadY);
  plane(10,93,curb,76,3.5,curbY);
  plane(7.7,94.15,asphalt,76,2.925,roadY);
  for(let x=-112;x<71;x+=7)plane(3,.13,stripe,x,-48,stripeY);
  for(let y=-41;y<38;y+=7)plane(.13,3,stripe,76,y,stripeY);
  plane(194,.1,stripe,-18,-51.4,stripeY);plane(186,.1,stripe,-22,-44.6,stripeY);
  plane(.1,83,stripe,72.6,-2.9,stripeY);plane(.1,87,stripe,79.4,-4.9,stripeY);
  const joints=[];
  for(let x=-112;x<71;x+=8)joints.push(V(x,-43,.025),V(x,39,.025));
  for(let y=-43;y<=39;y+=8)joints.push(V(-116,y,.025),V(71,y,.025));
  group.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(joints),new T.LineBasicMaterial({color:0x121d30,transparent:true,opacity:.23})));
}