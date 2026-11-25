import * as T from 'three';

// The environment is measured in the same metre-scale, Y-up world as the station.
// Distant geometry and lights stay fixed as the inspection camera moves.
export function createTwilight(scene) {
  const group = new T.Group();
  group.name = 'Blue hour / distant landscape';
  scene.add(group);
  const uniforms = { time: { value: 0 } };

  const sky = new T.Mesh(new T.SphereGeometry(2800, 48, 28), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: new T.Color(0x102654) },
      blue: { value: new T.Color(0x174ba1) },
      pale: { value: new T.Color(0x647baf) },
      dusk: { value: new T.Color(0xdfa37b) },
      below: { value: new T.Color(0x293950) }
    },
    vertexShader: `varying vec3 ray;
      void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 ray;
      uniform vec3 zenith,blue,pale,dusk,below;
      void main(){
        vec3 d=normalize(ray);float h=d.y;
        // A thin afterglow fades into a broad blue hour sky; no artificial sun disc.
        vec3 c=mix(dusk,pale,smoothstep(.008,.034,h));
        c=mix(c,blue,smoothstep(.026,.074,h));
        c=mix(c,zenith,smoothstep(.22,.95,h));
        c=mix(below,c,smoothstep(-.09,.008,h));
        float az=atan(d.z,d.x);
        float glow=pow(max(0.,dot(normalize(vec2(-.55,-.84)),normalize(d.xz))),3.);
        c+=dusk*.075*glow*exp(-pow((h-.060)*13.,2.));
        // Very faint long cloud ribbons prevent the sky reading as a flat CSS gradient.
        float veil=sin(az*4.+h*37.)*.5+sin(az*9.-h*81.)*.28+sin(az*17.+h*113.)*.12;
        c+=vec3(.009,.011,.015)*smoothstep(.42,.84,veil)*smoothstep(.09,.25,h)*(1.-smoothstep(.28,.7,h));
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  sky.name = 'Cobalt sky / apricot afterglow';
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  group.add(sky);

  function ridge(a, phase) {
    // Several wavelengths give broad natural valleys with smaller rocky ridge breaks.
    return .52 + .20*Math.sin(a*5+phase) + .12*Math.sin(a*11-phase*.6)
      + .085*Math.cos(a*19+phase*1.7) + .042*Math.sin(a*37-phase)
      + .018*Math.cos(a*71+phase*2.1);
  }
  function mountain(radius, height, phase, color, haze) {
    const segments=384, bands=Array.from({length:29},(_,i)=>.66+i/28*.68);
    const positions=[], indices=[];
    for(let b=0;b<bands.length;b++) for(let i=0;i<=segments;i++) {
      const a=i/segments*Math.PI*2;
      const peak=(.30+ridge(a,phase))*height;
      const r=radius*bands[b]+Math.sin(a*13+phase)*radius*.018;
      const fold=(bands[b]-1+.022*Math.sin(a*17+phase))/.135;
      const spine=Math.exp(-fold*fold);
      const secondary=Math.exp(-Math.pow((bands[b]-.86)/.075,2.))*.20;
      const erosion=Math.sin(a*43+bands[b]*32+phase)*.055+Math.sin(a*79-bands[b]*51)*.026;
      const y=(spine+secondary)*(peak+erosion*height)-11;
      positions.push(Math.cos(a)*r,y,Math.sin(a)*r);
    }
    for(let b=0;b<bands.length-1;b++) for(let i=0;i<segments;i++) {
      const p=b*(segments+1)+i,q=p+segments+1;
      indices.push(p,q,p+1,p+1,q,q+1);
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    const material=new T.ShaderMaterial({
      side:T.DoubleSide,fog:false,transparent:true,depthWrite:false,
      uniforms:{base:{value:new T.Color(color)},mist:{value:new T.Color(haze)},height:{value:height},air:{value:scene.fog?.color.clone()||new T.Color(0x293b5a)}},
      vertexShader:`varying vec3 n;varying vec3 wp;
        void main(){n=normal;wp=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec3 n;varying vec3 wp;uniform vec3 base,mist,air;uniform float height;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
        void main(){
          vec3 normal=normalize(vec3(n.x,abs(n.y),n.z));
          float slope=dot(normal,normalize(vec3(-.65,.25,-.65)));
          float rock=noise(wp.xz*.018)*.6+noise(wp.xz*.057)*.3+noise(wp.xz*.15)*.1;
          vec3 c=base*(.80+.24*max(0.,slope)+rock*.14);
          float low=1.-smoothstep(-12.,height*.75,wp.y);
          c=mix(c,mist,low*.38);
          c=mix(c,air,(1.-smoothstep(0.,height*.42,wp.y))*.48);
          // Fade the lowest foothills into the basin instead of forming a hard waterline.
          float opacity=smoothstep(-1.,max(9.,height*.17),wp.y);
          gl_FragColor=vec4(c,opacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const mesh=new T.Mesh(geometry,material);mesh.name='Distant ridge '+radius;
    mesh.renderOrder=radius>1500?-93:radius>1000?-92:-91;group.add(mesh);
  }
  // The far silhouette is higher on the skyline; closer foothills show slight parallax.
  mountain(1810,100,2.3,0x3e4a67,0x4b536c);
  mountain(1280,65,4.9,0x2c3852,0x3d4359);
  mountain(880,37,.7,0x232e43,0x30394c);

  const basin=new T.Mesh(new T.RingGeometry(155,2450,160,8),new T.ShaderMaterial({
    side:T.DoubleSide,fog:false,
    vertexShader:`varying vec3 wp;void main(){wp=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 wp;
      void main(){
        float d=length(wp.xz);
        vec3 nearC=vec3(.016,.020,.029),farC=vec3(.029,.036,.050);
        vec3 c=mix(nearC,farC,smoothstep(180.,1000.,d));
        float detail=sin(wp.x*.014+sin(wp.z*.009))*sin(wp.z*.017+wp.x*.003);
        c*=1.+detail*.035;
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  basin.rotation.x=-Math.PI/2;basin.position.y=-1.3;
  basin.name='Distant basin';group.add(basin);

  let seed=1751;
  const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  const vertices=[],tints=[],sizes=[],phases=[];
  const warmLight=new T.Color(0xffd3a2), coolLight=new T.Color(0xc4dbff);
  function cityLight(angle,radius,brightness){
    vertices.push(Math.cos(angle)*radius,.7+random()*3.8,Math.sin(angle)*radius);
    const tint=random()<.25?coolLight:warmLight;
    tints.push(tint.r*brightness,tint.g*brightness,tint.b*brightness);
    sizes.push(1.1+random()*1.6);
    phases.push(random()*Math.PI*2);
  }
  // Neighborhoods fill the basin at several depths, with occasional strands of street lights.
  for(let district=0;district<38;district++) {
    const angle=district/38*Math.PI*2+(random()-.5)*.16;
    const radius=560+random()*430;
    const width=.10+random()*.23;
    const depth=65+random()*155;
    const count=64+Math.floor(random()*115);
    for(let i=0;i<count;i++) {
      const along=random()+random()-1;
      const across=random()+random()-1;
      const intensity=.14+Math.pow(random(),2.4)*.82;
      cityLight(angle+along*width,radius+across*depth,intensity);
    }
    for(let i=0;i<22;i++){
      const u=i/21-.5;
      cityLight(angle+u*width*1.8,radius+u*depth*.62+(random()-.5)*5,.22+random()*.34);
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('lightColor',new T.Float32BufferAttribute(tints,3));
  geometry.setAttribute('diameter',new T.Float32BufferAttribute(sizes,1));
  geometry.setAttribute('phase',new T.Float32BufferAttribute(phases,1));
  const points=new T.Points(geometry,new T.ShaderMaterial({
    transparent:true,depthWrite:false,fog:false,blending:T.AdditiveBlending,
    uniforms,
    vertexShader:`attribute vec3 lightColor;attribute float diameter,phase;
      varying vec3 tint;varying float flicker;uniform float time;
      void main(){
        tint=lightColor;flicker=.97+.03*sin(time*.5+phase);
        vec4 p=modelViewMatrix*vec4(position,1.);
        float distance=max(100.,-p.z);
        tint*=mix(1.,.50,smoothstep(500.,1200.,distance));
        gl_PointSize=clamp(diameter*780./distance,1.45,3.6);
        gl_Position=projectionMatrix*p;
      }`,
    fragmentShader:`varying vec3 tint;varying float flicker;
      void main(){
        float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
        float core=exp(-r*r*6.);
        gl_FragColor=vec4(tint,core*.72*flicker);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  points.name='Distant city lights';points.renderOrder=-91.5;group.add(points);

  return {
    group,
    update(time,camera){uniforms.time.value=time;sky.position.copy(camera.position);},
    dispose(){group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});scene.remove(group);}
  };
}
