import * as T from 'three';
const V=(x,y,z)=>new T.Vector3(x,z,-y);
export const clock={value:0};

// Continuous PBR water: moving surface normals and multiple wave scales, no bead train.
export function waterMaterial(color,surface=false,length=0){
  const m=new T.MeshPhysicalMaterial({color,roughness:surface?.16:.25,metalness:0,clearcoat:.3,clearcoatRoughness:.18,specularIntensity:.4,envMapIntensity:.45,
    transparent:true,opacity:surface?.96:length?.74:.9,side:T.DoubleSide,depthWrite:surface,emissive:color,emissiveIntensity:.32});
  m.onBeforeCompile=s=>{
    s.uniforms.flowTime=clock;
    s.uniforms.flowLength={value:length};
    s.vertexShader='uniform float flowTime; varying vec3 fluidP;\n'+s.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>\nfluidP=position;${surface?'transformed.z+=.004*sin(position.x*23.4+flowTime*1.9)+.002*sin(position.y*34.1-flowTime*2.7);':''}`);
    s.fragmentShader='uniform float flowTime,flowLength; varying vec3 fluidP;\n'+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      float w=sin(fluidP.x*5.2+fluidP.y*3.6-flowTime*2.5)*.5+sin(fluidP.z*9.0+fluidP.y*6.0+flowTime*3.1)*.25;
      normal=normalize(normal+vec3(sin(fluidP.y*8.0-flowTime*3.0),cos(fluidP.x*7.0+flowTime*2.2),w)*.095);`);
    s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float streak=sin(vUv.x*100.0-flowTime*4.8+sin(vUv.y*19.0+flowTime)*1.8);
      diffuseColor.rgb*=${surface?'.98+.02*streak':'.88+.12*streak'};`);
    if(length)s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      float axial=vUv.x*flowLength-flowTime*2.5;
      float angle=vUv.y*6.283185;
      float ripple=sin(axial*2.1+sin(angle*3.+axial*.7))+sin(angle*2.-axial*.8);
      float caustic=exp(-5.*abs(ripple));
      float filament=exp(-8.*abs(sin(axial*.92+angle+sin(axial*1.7)*.5)));
      totalEmissiveRadiance=emissive*(.58+caustic*2.45)+mix(emissive,vec3(1.),.32)*filament*2.8;`);
  };
  m.defines={USE_UV:''};m.customProgramCacheKey=()=>surface?'fluid-surface-v4':length?'fluid-pipe-v4':'fluid-volume-v4';return m;
}

export function reservoir(group,{x,y,bottom,r,height,color,sphere=false}){
  const body=new T.Mesh(new T.BufferGeometry(),waterMaterial(color));
  const top=new T.Mesh(new T.CircleGeometry(1,64),waterMaterial(color,true));
  top.rotation.x=-Math.PI/2;body.position.copy(V(x,y,bottom));top.position.copy(V(x,y,bottom));
  group.add(body,top);
  // A closed liquid volume including radial cut faces. Its spherical wall follows the vessel.
  const segments=48,rows=20,positions=new Float32Array((rows+1)*(segments+1)*3),indices=[];
  for(let j=0;j<rows;j++)for(let i=0;i<segments;i++){
    const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);
  }
  body.geometry.setAttribute('position',new T.BufferAttribute(positions,3));body.geometry.setIndex(indices);
  const uv=new Float32Array((rows+1)*(segments+1)*2);
  for(let j=0;j<=rows;j++)for(let i=0;i<=segments;i++){const k=(j*(segments+1)+i)*2;uv[k]=i/segments;uv[k+1]=j/rows;}
  body.geometry.setAttribute('uv',new T.BufferAttribute(uv,2));
  const volume={body,top,bottom,r,height,sphere,segments,rows,positions,last:-1};
  updateReservoir(volume,.25);
  return volume;
}
export function updateReservoir(item,fraction){
  const {r,height,sphere,rows,segments,positions}=item;
  const h=Math.max(.08,height*Math.min(.88,Math.max(.06,fraction)));
  const radius=z=>sphere?Math.sqrt(Math.max(.001,r*r-(z-height/2)**2)):r*.97;
  if(Math.abs(h-item.last)>.008){
    for(let j=0;j<=rows;j++){const z=h*j/rows,rr=radius(z);for(let i=0;i<=segments;i++){
      const a=i/segments*Math.PI*2,k=(j*(segments+1)+i)*3;
      positions[k]=Math.sin(a)*rr;positions[k+1]=z;positions[k+2]=Math.cos(a)*rr;
    }}
    item.body.geometry.attributes.position.needsUpdate=true;item.body.geometry.computeVertexNormals();item.body.geometry.computeBoundingSphere();item.last=h;
  }
  item.top.position.y=item.bottom+h;item.top.scale.setScalar(radius(h));
}

const arrowShape = new T.Shape();
arrowShape.moveTo(-.52,-.16);
arrowShape.lineTo(.04,-.16);
arrowShape.lineTo(.04,-.35);
arrowShape.lineTo(.58,0);
arrowShape.lineTo(.04,.35);
arrowShape.lineTo(.04,.16);
arrowShape.lineTo(-.52,.16);
arrowShape.closePath();
const arrowGeometry = new T.ShapeGeometry(arrowShape);
const arrowBasis = new T.Matrix4();
const arrowPosition = new T.Vector3();
const arrowForward = new T.Vector3();
const arrowSide = new T.Vector3();
const arrowNormal = new T.Vector3();
const arrowDummy = new T.Object3D();

export function flowRoute(scene,name,type,points,color,inside=false,centerline,pipeRadius){
  const group=new T.Group();group.visible=false;scene.add(group);
  // Low-tension spline follows the supplied pipe centreline without large overshoot.
  const curve=centerline??new T.CatmullRomCurve3(points.map(p=>V(...p)),false,'catmullrom',.08);
  const length=curve.getLength(),radius=pipeRadius??(inside?.18:.26);
  const openAir=name==='atmosphere'||name==='exhaust';
  const skin=new T.Mesh(new T.TubeGeometry(curve,Math.max(36,points.length*16),radius*1.08,12,false),
    new T.MeshPhysicalMaterial({color:0xb0d8df,roughness:.2,metalness:.28,transparent:true,opacity:.20,depthWrite:false,side:T.DoubleSide}));
  group.add(skin);
  const fluid=['liquid','heat','water','cold','return','pinkCold','pinkReturn'].includes(type);
  const core=new T.Mesh(new T.TubeGeometry(curve,Math.max(36,points.length*16),radius*.83,12,false),fluid?waterMaterial(color,false,length):
    new T.MeshBasicMaterial({color,transparent:true,opacity:.14,depthWrite:false,toneMapped:false}));
  group.add(core);
  if(openAir){skin.visible=false;core.visible=false;}
  const pairs=fluid?0:Math.min(260,Math.max(12,Math.ceil(length*2.6)));
  const count=pairs*2;
  const geometry=new T.BufferGeometry();const positions=new Float32Array(count*3);
  geometry.setAttribute('position',new T.BufferAttribute(positions,3));
  const material=new T.ShaderMaterial({uniforms:{tint:{value:new T.Color(color)},size:{value:inside?3.7:5.2}},
    vertexShader:'uniform float size; void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=clamp(size*50.0/-p.z,1.35,9.0);}',
    fragmentShader:'uniform vec3 tint;void main(){float d=length(gl_PointCoord-.5)*2.0;if(d>1.0)discard;float core=exp(-d*d*32.0);float a=exp(-d*d*7.0);gl_FragColor=vec4(mix(tint*2.3,vec3(3.1),core*.65),a*.85);}',
    transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
  const particles=new T.Points(geometry,material);particles.frustumCulled=false;group.add(particles);
  const arrowCount=Math.min(10,Math.max(1,Math.ceil(length/10)));
  const arrowColor=new T.Color(color).lerp(new T.Color(0xffffff),.22).multiplyScalar(1.22);
  const arrows=new T.InstancedMesh(arrowGeometry,new T.MeshBasicMaterial({
    color:arrowColor,side:T.DoubleSide,transparent:true,opacity:.94,depthWrite:false,toneMapped:false
  }),arrowCount);
  arrows.frustumCulled=false;
  group.add(arrows);
  const frames=count?curve.computeFrenetFrames(240,false):null;
  return {name,type,group,length,count,positions,particles,inside,arrows,arrowCount,frames,radius:openAir?.75:radius,values:curve.getSpacedPoints(240)};
}
export function updateFlow(r,t,camera){
  for(let i=0;i<r.count;i++){
    const pair=Math.floor(i/2),pairCount=r.count/2;
    const u=((pair/pairCount+t*5.1/r.length)%1)*240,a=Math.floor(u),p=r.values[a],q=r.values[a+1],f=u-a;
    const angle=pair*2.39996+t*1.4, orbit=r.radius*(.18+.48*((pair*.75488)%1));
    const offsetN=Math.cos(angle)*orbit+(i%2-.5)*r.radius*.56,offsetB=Math.sin(angle)*orbit;
    const n=r.frames.normals[a],b=r.frames.binormals[a],j=i*3;
    r.positions[j]=p.x+(q.x-p.x)*f+n.x*offsetN+b.x*offsetB;
    r.positions[j+1]=p.y+(q.y-p.y)*f+n.y*offsetN+b.y*offsetB;
    r.positions[j+2]=p.z+(q.z-p.z)*f+n.z*offsetN+b.z*offsetB;
  }
  if(r.count)r.particles.geometry.attributes.position.needsUpdate=true;
  for(let i=0;i<r.arrowCount;i++){
    const u=(.08+.84*((i/r.arrowCount+t*6/r.length)%1))*240;
    const a=Math.floor(u), p=r.values[a], q=r.values[a+1];
    arrowPosition.lerpVectors(p,q,u-a);
    arrowForward.subVectors(q,p).normalize();
    arrowNormal.subVectors(camera.position,arrowPosition).normalize();
    arrowSide.crossVectors(arrowNormal,arrowForward);
    if(arrowSide.lengthSq()<.0001)arrowSide.set(0,1,0).cross(arrowForward);
    arrowSide.normalize();
    arrowNormal.crossVectors(arrowForward,arrowSide);
    arrowBasis.makeBasis(arrowForward,arrowSide,arrowNormal);
    arrowDummy.quaternion.setFromRotationMatrix(arrowBasis);
    arrowDummy.position.copy(arrowPosition).addScaledVector(arrowNormal,r.inside?.33:.58);
    arrowDummy.scale.setScalar(Math.min(r.inside?.75:1.18,r.length*.29));
    arrowDummy.updateMatrix();
    r.arrows.setMatrixAt(i,arrowDummy.matrix);
  }
  if(r.arrowCount)r.arrows.instanceMatrix.needsUpdate=true;
}

export function landscape(scene){
  let seed=492;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const dummy=new T.Object3D();
  const rock=new T.InstancedMesh(new T.DodecahedronGeometry(1,1),new T.MeshStandardMaterial({color:0xb2bab2,roughness:.95}),140);
  const blades=[];for(let k=0;k<5;k++){const a=k*2.399,x=Math.cos(a)*.16,z=Math.sin(a)*.16;blades.push(x-.035,0,z,x+.035,0,z,x+.12,.45+k*.06,z+.08);}
  const grassGeo=new T.BufferGeometry();grassGeo.setAttribute('position',new T.Float32BufferAttribute(blades,3));grassGeo.computeVertexNormals();
  const grass=new T.InstancedMesh(grassGeo,new T.MeshStandardMaterial({color:0xb0b999,roughness:.98,side:T.DoubleSide}),2400);
  for(const [mesh,count] of [[rock,140],[grass,2400]]){
    for(let i=0;i<count;i++){
      let x,y;do{x=-113+rand()*215;y=-64+rand()*127;}while((x>-59&&x<61&&y>-39&&y<40)||(y>39&&y<51)||(x>61&&x<75&&y>40)||(x>-28&&x<31&&y>45));
      const s=mesh===rock?.14+rand()*.36:.4+rand()*.55;
      dummy.position.copy(V(x,y,mesh===rock?s*.15:.01));dummy.scale.set(s,s*(mesh===rock?.5:1),s*.8);dummy.rotation.set(rand()*.12,rand()*6.28,rand()*.12);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      mesh.setColorAt(i,new T.Color().setHSL(mesh===rock?.12:.23,.12+rand()*.13,.29+rand()*.14));
    }mesh.receiveShadow=true;scene.add(mesh);
  }
}