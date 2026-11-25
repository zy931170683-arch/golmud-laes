import * as T from 'three';
import {exteriorPipes, topPorts, thermalNozzles, hxPorts, centralVessels, centralReturn, reheatVessel, reheatReturn, turbineStages} from './pipe-layout.js?v=continuous-1';

const at=([x,y,z])=>new T.Vector3(x,z,-y);
const upright=new T.Vector3(0,1,0);

export function roundedPipe(points, radius=.56){
  const vertices=points.map(at).filter((point,i,all)=>i===0||point.distanceToSquared(all[i-1])>1e-8);
  const curve=new T.CurvePath();
  let start=vertices[0];
  for(let i=1;i<vertices.length-1;i++){
    const corner=vertices[i], next=vertices[i+1], prev=vertices[i-1];
    const trim=Math.min(radius,corner.distanceTo(prev)*.44,corner.distanceTo(next)*.44);
    const entry=corner.clone().lerp(prev,trim/corner.distanceTo(prev));
    const exit=corner.clone().lerp(next,trim/corner.distanceTo(next));
    curve.add(new T.LineCurve3(start,entry));
    curve.add(new T.QuadraticBezierCurve3(entry,corner,exit));
    start=exit;
  }
  curve.add(new T.LineCurve3(start,vertices.at(-1)));
  return curve;
}

// The return bends continuously through a half-circle between the two straight legs.
export function returnCurve(spec,reverse=false){
  const {axis,center,ends,bend,low,high}=spec;
  const point=(run,z)=>axis==='x'?[run,center,z]:[center,run,z];
  const sweep=(high-low)/2, mid=(high+low)/2;
  const direction=Math.sign(bend-ends), arc=[];
  for(let i=0;i<=16;i++){
    const angle=i*Math.PI/16;
    arc.push(at(point(bend+direction*sweep*Math.sin(angle),mid+sweep*Math.cos(angle))));
  }
  const curve=new T.CurvePath();
  if(reverse)arc.reverse();
  curve.add(new T.LineCurve3(at(point(ends,reverse?low:high)),arc[0]));
  curve.add(new T.CatmullRomCurve3(arc));
  curve.add(new T.LineCurve3(arc.at(-1),at(point(ends,reverse?high:low))));
  return curve;
}

function partitionTriangles(mesh, move, keepMoved=false){
  const geometry=mesh.geometry, index=geometry.index, position=geometry.attributes.position;
  if(!index)return;
  const parent=Int32Array.from({length:position.count},(_,i)=>i);
  const firstByPosition=new Map();
  function root(i){
    while(i!==parent[i]){parent[i]=parent[parent[i]];i=parent[i];}
    return i;
  }
  const point=new T.Vector3();
  for(let i=0;i<position.count;i++){
    point.fromBufferAttribute(position,i);
    const key=point.toArray().map(v=>Math.round(v*10000)).join(',');
    const first=firstByPosition.get(key);
    if(first===undefined)firstByPosition.set(key,i);
    else parent[i]=first;
  }
  for(let i=0;i<index.count;i+=3){
    const a=root(index.getX(i));
    parent[root(index.getX(i+1))]=a;
    parent[root(index.getX(i+2))]=a;
  }
  const components=new Map();
  for(let i=0;i<index.count;i+=3){
    const id=root(index.getX(i));
    if(!components.has(id))components.set(id,{triangles:[],bounds:new T.Box3()});
    const component=components.get(id);
    for(let j=0;j<3;j++){
      const vertex=index.getX(i+j);
      component.triangles.push(vertex);
      component.bounds.expandByPoint(point.fromBufferAttribute(position,vertex));
    }
  }
  const kept=[], moved=[];
  for(const {triangles,bounds} of components.values()){
    const target=move(triangles.length/3,bounds)?moved:kept;
    for(const vertex of triangles)target.push(vertex);
  }
  if(!moved.length)return;
  const separated=keepMoved?geometry.clone().setIndex(moved):null;
  geometry.setIndex(kept);
  return separated;
}

export function replacePlantGeometry(worldObjects, root){
  const material=(color,roughness,metalness)=>new T.MeshStandardMaterial({color,roughness,metalness});
  const steel=material(0x90a4b8,.26,.60), frame=material(0x52687a,.45,.50);
  const white=material(0xc8d5df,.31,.26), teal=material(0x449f9f,.31,.40), blue=material(0x2d65ac,.29,.34);
  const trimmedTopGroups=/^(1[0-7]_)/;
  const tankCenters=[[-44,22,6.5],[-44,-20,6.3],[-6,24,8.3],[15,24,8.3],[33,25,5.5],[48,25,5.5]];
  for(const [name,group] of worldObjects){
    if(name==='exchanger_shell'||name==='turbine_shell')group.visible=false;
    if(/^(20_|23_|24_)/.test(name))group.traverse(obj=>{
      if(!obj.isMesh)return;
      const material=obj.material.name;
      if(name.startsWith('24_'))obj.visible=material.includes('镀锌');
      else if(material.includes('不锈钢'))obj.visible=false;
    });
    if(/^2[12]_/.test(name))group.traverse(obj=>{
      if(obj.isMesh&&!obj.material.name.includes('混凝土'))obj.visible=false;
    });
    if(name.startsWith('31_'))group.traverse(obj=>{
      if(obj.isMesh&&obj.material.name.includes('发电机蓝色涂装'))obj.visible=false;
    });
    if(name.startsWith('18_'))group.traverse(obj=>{
      if(!obj.isMesh||!obj.material.name.includes('不锈钢'))return;
      partitionTriangles(obj,(_,bounds)=>{
        const center=bounds.getCenter(new T.Vector3());
        if(center.y<2.6&&tankCenters.some(([x,y,r])=>Math.abs(center.x-(x-r-.5))<1.15&&Math.abs(center.z+y)<1.2))return true;
        return Math.abs(center.y-9)<.18&&tankCenters.some(([x,y,r])=>Math.abs(center.x-x)<.75&&Math.abs(center.z+y-r-1.1)<.45);
      });
    });
    if(name.startsWith('32_'))group.traverse(obj=>{
      if(obj.isMesh)partitionTriangles(obj,(_,bounds)=>bounds.min.x>40&&bounds.min.z>15);
    });
    if(trimmedTopGroups.test(name)||/^(30_|31_)/.test(name))group.traverse(obj=>{
      if(!obj.isMesh||!obj.material.name.includes('不锈钢'))return;
      partitionTriangles(obj,(count,bounds)=>{
        if(name.startsWith('31_'))return count===316||count===124;
        return count===316;
      });
    });
  }

  function add(group,geometry,surface,point){
    const mesh=new T.Mesh(geometry,surface);
    if(point)mesh.position.copy(point);
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    group.add(mesh);
    return mesh;
  }
  const pipeSection=new T.CylinderGeometry(1,1,1,20);
  const cube=new T.BoxGeometry();
  function box(group,point,dimensions,surface=frame){
    const mesh=add(group,cube,surface,at(point));
    mesh.scale.set(...dimensions);
    return mesh;
  }
  function cylinder(group,point,radius,height,surface=steel,direction=upright){
    const mesh=add(group,pipeSection,surface,point);
    mesh.scale.set(radius,height,radius);
    mesh.quaternion.setFromUnitVectors(upright,direction);
    return mesh;
  }
  function flange(group,point,direction,radius,face=steel){
    cylinder(group,point,radius,.16,face,direction);
    const tangent=new T.Vector3(direction.y,-direction.x,0);
    if(tangent.lengthSq()<.1)tangent.set(1,0,0);
    tangent.normalize();
    const other=new T.Vector3().crossVectors(direction,tangent);
    for(let i=0;i<6;i++){
      const angle=i*Math.PI/3;
      const bolt=point.clone().addScaledVector(tangent,Math.cos(angle)*radius*.77).addScaledVector(other,Math.sin(angle)*radius*.77);
      cylinder(group,bolt,.05,.21,frame,direction);
    }
  }
  function nozzle(group,coords,radius=.24,direction=upright){
    const surface=at(coords);
    cylinder(group,surface.clone().addScaledVector(direction,.10),radius,.60,steel,direction);
    flange(group,surface.clone().addScaledVector(direction,.25),direction,radius*1.82);
    cylinder(group,surface.clone().addScaledVector(direction,.03),radius*1.44,.17,steel,direction);
  }
  function tube(group,curve,radius,surface,resolution){
    return add(group,new T.TubeGeometry(curve,resolution,radius,12),surface);
  }
  const components={};
  for(const id of ['intake','intercooler','recover','turbine','storage','frontTank','hot','cold','thermal']){
    const shell=new T.Group(), fittings=new T.Group();
    components[id]={shell,fittings};
    root.add(shell,fittings);
  }
  const compressor=[...worldObjects].find(([name])=>name.startsWith('30_'))?.[1];
  compressor?.traverse(obj=>{
    if(!obj.isMesh||!/涂装|不锈钢/.test(obj.material.name))return;
    const geometry=partitionTriangles(obj,(_,bounds)=>bounds.min.x>26.9,true);
    if(geometry){
      const part=obj.clone();
      part.geometry=geometry;
      components.intake.shell.add(part);
    }
  });
  function horizontalVessel(group,fittings,{center,radius,length,axis}){
    const [x,y,z]=center, point=at(center);
    const direction=axis==='x'?new T.Vector3(1,0,0):new T.Vector3(0,0,-1);
    const shell=add(group,new T.CapsuleGeometry(radius,length-2*radius,10,36),white,point);
    shell.quaternion.setFromUnitVectors(upright,direction);
    for(const sign of [-1,1]){
      const seam=point.clone().addScaledVector(direction,sign*(length/2-radius));
      cylinder(fittings,seam,radius*1.014,.10,steel,direction);
      for(const side of [-1,1]){
        const shift=side*radius*.66;
        const height=z-radius*.73-.93;
        const support=axis==='x'?[x+sign*length*.29,y+shift,.93+height/2]:[x+shift,y+sign*length*.29,.93+height/2];
        box(fittings,support,[.54,height,.62]);
      }
      flange(fittings,point.clone().addScaledVector(direction,sign*length/2),direction,.32);
    }
  }
  function returnVessel(group,fittings,spec){
    const curve=returnCurve(spec);
    tube(group,curve,spec.radius,teal,112);
    const position=(run,off,z)=>spec.axis==='x'?[run,spec.center+off,z]:[spec.center+off,run,z];
    const direction=spec.axis==='x'?new T.Vector3(1,0,0):new T.Vector3(0,0,-1);
    for(const z of [spec.high,spec.low]){
      const endpoint=at(position(spec.ends,0,z));
      cylinder(fittings,endpoint,spec.radius,.10,teal,direction);
      flange(fittings,endpoint,direction,.39);
    }
    const near=spec.bend+(spec.ends-spec.bend)*.33, far=spec.bend+(spec.ends-spec.bend)*.74;
    const frameHeight=spec.high+spec.radius+.26-.95;
    for(const run of [near,far]){
      for(const side of [-1,1])box(fittings,position(run,side*(spec.radius+.27),.95+frameHeight/2),[.16,frameHeight,.16]);
      for(const z of [spec.low-spec.radius*.83,spec.high-spec.radius*.84,spec.high+spec.radius+.26]){
        const span=2*(spec.radius+.27);
        box(fittings,position(run,0,z),spec.axis==='x'?[.16,.15,span]:[span,.15,.16]);
      }
    }
  }
  const {intercooler,recover,turbine}=components;
  for(const spec of centralVessels)horizontalVessel(intercooler.shell,intercooler.fittings,spec);
  horizontalVessel(recover.shell,recover.fittings,reheatVessel);
  returnVessel(intercooler.shell,intercooler.fittings,centralReturn);
  returnVessel(recover.shell,recover.fittings,reheatReturn);
  for(const point of [...hxPorts.centralHeat,...hxPorts.centralCoolant])nozzle(intercooler.fittings,point,.19);
  for(const point of [hxPorts.rightSteam,hxPorts.rightHeat,[42.8,2,6.24],[46.5,2,6.24]])nozzle(recover.fittings,point,.22);
  for(const [y,r,length] of turbineStages){
    const direction=new T.Vector3(0,0,1), center=at([45,y,5]);
    const geom=new T.CylinderGeometry(r*.88,r,length,36);
    const housing=add(turbine.shell,geom,blue,center);
    housing.quaternion.setFromUnitVectors(upright,direction);
    for(const side of [-1,1]){
      const edge=side===1?r*.92:r*1.025;
      const end=center.clone().addScaledVector(direction,length*.48*side);
      cylinder(turbine.fittings,end,edge,.17,steel,direction);
      box(turbine.fittings,[45+side*r*.61,y,3.55],[.51,1.55,length*.52],blue);
    }
    cylinder(turbine.fittings,center,.58,length+1.09,steel,direction);
  }
  box(turbine.fittings,[45,-12.2,5.15],[4.4,3.4,3.32],blue);
  box(turbine.fittings,[45,-12.2,3.15],[4.8,.55,3.5],frame);
  for(const side of [-1,1])box(turbine.fittings,[45+side*1.75,-12.2,2.58],[.58,1.04,2.75]);
  for(let i=0;i<5;i++)box(turbine.fittings,[45,-13.15+i*.45,6.87],[2.4,.07,.09],frame);
  for(const point of hxPorts.turbine)nozzle(turbine.fittings,point,.22);
  const {storageIn,frontTank,hotIn,coldIn,coldOut,coldAir}=topPorts;
  for(const [id,ports] of Object.entries({
    storage:[storageIn],frontTank:[frontTank],hot:[hotIn],
    cold:[coldIn,coldOut],
    thermal:thermalNozzles.flat()
  }))for(const port of ports)nozzle(components[id].fittings,port);

  const frontNormal=new T.Vector3(0,0,1);
  nozzle(components.cold.fittings,coldAir,.23,frontNormal);
  for(const port of topPorts.coldMedia)nozzle(components.cold.fittings,port,.19,frontNormal);

  const pipes=new Map(), pipeGroup=new T.Group();
  root.add(pipeGroup);
  // The second tier sits below the original rack crossmembers.
  for(let x=-33;x<=52;x+=7){
    box(pipeGroup,[x,10,5.42],[.17,.22,4.6]);
    box(pipeGroup,[x,8.57,3.94],[.16,.16,1.5]);
  }
  for(const [id,[type,points]] of Object.entries(exteriorPipes)){
    const curve=roundedPipe(points,.72);
    const radius=id.startsWith('media')?.16:id==='intake'?.48:type==='air'?.27:.22;
    const mesh=tube(pipeGroup,curve,radius,steel,Math.max(40,points.length*15));
    pipes.set(id,{mesh,curve,radius});
  }
  return {components,pipes};
}
