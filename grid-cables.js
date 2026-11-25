import * as T from 'three';
import {clock} from './effects.js?v=hd-1';
import {roundedPipe} from './plant-equipment.js?v=continuous-1';

const at=([x,y,z])=>new T.Vector3(x,z,-y);
const up=new T.Vector3(0,1,0);

export function buildGridCables(root){
  const live=new T.Group();
  live.visible=false;
  root.add(live);
  const insulation=new T.MeshStandardMaterial({color:0x252c39,metalness:.27,roughness:.43});
  const alloy=new T.MeshStandardMaterial({color:0x8294ad,metalness:.66,roughness:.29});
  const ceramic=new T.MeshStandardMaterial({color:0xa1b8be,roughness:.29,metalness:.16});

  function bar(a,b,r,material=alloy){
    const from=at(a),to=at(b),delta=to.clone().sub(from);
    const mesh=new T.Mesh(new T.CylinderGeometry(r,r,delta.length(),12),material);
    mesh.quaternion.setFromUnitVectors(up,delta.normalize());
    mesh.position.copy(from.lerp(to,.5));
    root.add(mesh);
  }

  function currentMaterial(length,phase){
    return new T.ShaderMaterial({
      uniforms:{time:clock,travelLength:{value:length},phase:{value:phase}},
      vertexShader:`
        varying float distanceAlong;
        uniform float travelLength;
        void main(){
          distanceAlong=uv.x*travelLength;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        }`,
      fragmentShader:`
        varying float distanceAlong;
        uniform float time,phase;
        void main(){
          float cycle=fract((distanceAlong-time*9.4+phase)/14.6);
          float head=smoothstep(.63,.75,cycle)*(1.-smoothstep(.78,.86,cycle));
          float tail=smoothstep(.48,.76,cycle)*(1.-smoothstep(.76,.83,cycle));
          float pulse=max(head,tail*.37);
          vec3 current=mix(vec3(.047,.40,.75),vec3(.30,.79,1.),head*.66);
          gl_FragColor=vec4(current*(1.+head*.64),.045+pulse*.69);
        }`,
      transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false
    });
  }
  function conductor(curve,radius,phase){
    const length=curve.getLength();
    const geometry=new T.TubeGeometry(curve,Math.ceil(length*4),radius,12);
    const cable=new T.Mesh(geometry,insulation);
    const material=currentMaterial(length,phase);
    // Draw the current on the same surface as the cable, including its sag and bends.
    material.depthFunc=T.LessEqualDepth;
    root.add(cable);
    live.add(new T.Mesh(geometry,material));
  }

  // An insulated three-phase cable run enters the transformer on its low side.
  // Its three high-side bushings fan out to a termination rack and sag to the tower.
  const tower=[[73.4,25,15.7],[74.4,25,20.5],[85.6,25,20.5]];
  const anchors=[[69.1,-15.2,11.25],[71.1,-15.2,12.45],[73.1,-15.2,11.25]];
  for(const x of [68.6,73.6])bar([x,-15.2,.24],[x,-15.2,13.36],.14);
  bar([68.6,-15.2,13.36],[73.6,-15.2,13.36],.12);
  for(let i=0;i<3;i++){
    const shift=(i-1)*.59;
    const from=[47.19,-12.2+shift,5.85];
    const to=[63.45,-24+shift,2.38];
    bar([46.99,from[1],from[2]],[47.44,from[1],from[2]],.22,ceramic);
    bar([63.18,to[1],to[2]],[63.62,to[1],to[2]],.20,ceramic);
    conductor(roundedPipe([from,[49.2+i*.54,from[1],5.85],[49.2+i*.54,from[1],.66],
      [49.2+i*.54,-24+shift,.66],[61.5+i*.43,-24+shift,.66],
      [61.5+i*.43,-24+shift,2.38],to],.55),.108,i*2.1);

    const a=anchors[i], b=tower[i], top=[64.1+.9*i,-24.7,4.76];
    bar(a,[a[0],a[1],13.36],.095,ceramic);
    for(let z=a[2]+.25;z<13.26;z+=.25)bar([a[0],a[1],z],[a[0],a[1],z+.09],.21,ceramic);
    const lead=new T.CubicBezierCurve3(at(top),at([top[0],top[1]+1.5,8.8]),at([a[0],a[1]-3,8.6]),at(a));
    conductor(lead,.084,i*2.1);
    const span=new T.QuadraticBezierCurve3(at(a),at([(a[0]+b[0])*.5,(a[1]+b[1])*.5,(a[2]+b[2])*.5-6]),at(b));
    conductor(span,.076,i*2.1+lead.getLength());
  }
  return enabled=>{live.visible=enabled;};
}