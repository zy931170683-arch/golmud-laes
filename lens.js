import * as T from 'three';

// Intermediate buffers stay linear HDR. Only the final screen pass applies the
// renderer's tone mapping / transfer function; HTML annotations stay sharp.
export function createLens(renderer,camera){
  const makeTarget=depth=>new T.WebGLRenderTarget(1,1,{
    type:T.HalfFloatType,format:T.RGBAFormat,
    minFilter:T.LinearFilter,magFilter:T.LinearFilter,
    depthBuffer:depth,stencilBuffer:false,generateMipmaps:false
  });
  const target=makeTarget(true);
  target.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);
  target.samples=Math.min(4,renderer.capabilities.maxSamples);
  const levels=Array.from({length:3},()=>({a:makeTarget(false),b:makeTarget(false),size:new T.Vector2()}));
  const vertexShader='varying vec2 uvScreen;void main(){uvScreen=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const post=(uniforms,fragmentShader,toneMapped=false)=>new T.ShaderMaterial({
    uniforms,vertexShader,fragmentShader,depthTest:false,depthWrite:false,
    blending:T.NoBlending,toneMapped
  });
  const hasSelection={value:false};
  const selectionGLSL=`
    uniform bool hasSelection;
    float selectionAt(vec2 p){return 1.-clamp(texture2D(image,p).a,0.,1.);}
    vec3 selectionEdge(vec2 p){
      float center=selectionAt(p);
      vec2 d=pixel*2.25;
      float lo=min(min(selectionAt(p+vec2(d.x,0.)),selectionAt(p-vec2(d.x,0.))),
                   min(selectionAt(p+vec2(0.,d.y)),selectionAt(p-vec2(0.,d.y))));
      return vec3(3.6,1.55,.10)*max(0.,center-lo);
    }
  `;
  const extract=post({image:{value:target.texture},pixel:{value:new T.Vector2()},threshold:{value:1.15},knee:{value:.45},hasSelection},`
    varying vec2 uvScreen;
    uniform sampler2D image;
    uniform vec2 pixel;
    uniform float threshold,knee;
    ${selectionGLSL}
    vec3 bright(vec2 p){
      vec3 c=max(texture2D(image,p).rgb,vec3(0.));
      // Max channel retains the color of hot-water red and cryogenic cyan.
      float peak=max(max(c.r,c.g),c.b);
      float soft=clamp(peak-threshold+knee,0.,2.*knee);
      soft=soft*soft/(4.*knee+.0001);
      return min(c,vec3(32.))*max(peak-threshold,soft)/max(peak,.0001);
    }
    void main(){
      vec2 p=pixel*.5;
      vec3 c=bright(uvScreen+vec2(-p.x,-p.y))+bright(uvScreen+vec2(p.x,-p.y));
      c+=bright(uvScreen+vec2(-p.x,p.y))+bright(uvScreen+p);
      c*=.25;
      if(hasSelection)c+=selectionEdge(uvScreen)*.82;
      gl_FragColor=vec4(c,1.);
    }
  `);
  const blur=post({image:{value:null},direction:{value:new T.Vector2()}},`
    varying vec2 uvScreen;
    uniform sampler2D image;
    uniform vec2 direction;
    void main(){
      // A separable Gaussian; bilinear filtering combines adjacent taps.
      vec3 c=texture2D(image,uvScreen).rgb*.227027;
      c+=(texture2D(image,uvScreen+direction*1.384615).rgb+texture2D(image,uvScreen-direction*1.384615).rgb)*.316216;
      c+=(texture2D(image,uvScreen+direction*3.230769).rgb+texture2D(image,uvScreen-direction*3.230769).rgb)*.070270;
      gl_FragColor=vec4(c,1.);
    }
  `);
  const uniforms={
    image:{value:target.texture},depth:{value:target.depthTexture},
    bloomFine:{value:levels[0].a.texture},bloomMedium:{value:levels[1].a.texture},bloomWide:{value:levels[2].a.texture},
    pixel:{value:new T.Vector2()},near:{value:camera.near},far:{value:camera.far},
    focus:{value:80},amount:{value:0},bloomStrength:{value:.64},hasSelection
  };
  const composite=post(uniforms,`
    varying vec2 uvScreen;
    uniform sampler2D image,depth,bloomFine,bloomMedium,bloomWide;
    uniform vec2 pixel;
    uniform float near,far,focus,amount,bloomStrength;
    ${selectionGLSL}
    // The Photoshop reference is graded in display RGB, after AgX and sRGB encoding.
    vec3 gradeDisplayColor(vec3 rgb){
      // Levels: input 17 / 1.00 / 255, output 0 / 255.
      rgb=clamp((rgb*255.-17.)/238.,0.,1.);
      float hi=max(rgb.r,max(rgb.g,rgb.b));
      float lo=min(rgb.r,min(rgb.g,rgb.b));
      float chroma=hi-lo;
      float hue=0.;
      if(chroma>.0001){
        if(hi==rgb.r) hue=(rgb.g-rgb.b)/chroma;
        else if(hi==rgb.g) hue=2.+(rgb.b-rgb.r)/chroma;
        else hue=4.+(rgb.r-rgb.g)/chroma;
        hue=mod(hue*60.+360.,360.);
      }
      // Feathered hue selections match the red and yellow ranges in the reference.
      float red=1.-smoothstep(15.,45.,min(hue,360.-hue));
      float yellow=smoothstep(15.,45.,hue)*(1.-smoothstep(75.,105.,hue));
      float lightness=(hi+lo)*.5;
      float chromatic=smoothstep(.005,.055,chroma);
      float saturation=1.13+chromatic*(.19*red+.66*yellow);
      float gamutLimit=min(lightness,1.-lightness)/max(chroma*.5,.0001);
      rgb=lightness+(rgb-lightness)*min(saturation,gamutLimit);

      // Midtone red balance with luminance compensation.
      float midtone=1.-abs(lightness*2.-1.);
      rgb+=vec3(.7874,-.2126,-.2126)*(11./255.)*midtone*midtone*.9;

      // Approximate the modern Photoshop brightness −6 / contrast +41 curve.
      rgb=clamp(rgb,0.,1.);
      vec3 rolloff=4.*rgb*(1.-rgb);
      return clamp(rgb+rolloff*(.23*(rgb-.5)-.024),0.,1.);
    }
    float distanceAt(vec2 p){
      float d=texture2D(depth,p).x;
      return (near*far)/(far-d*(far-near));
    }
    void main(){
      vec3 color=texture2D(image,uvScreen).rgb;
      // Overview skips the depth gather. Inspection keeps a sharp focal band.
      if(amount>.005&&(!hasSelection||selectionAt(uvScreen)<.5)){
        float z=distanceAt(uvScreen);
        float band=max(5.,focus*.14);
        float radius=amount*clamp((abs(z-focus)-band)/max(z,8.)*15.,0.,6.5);
        if(radius>.35){
          float weight=1.;
          for(int i=0;i<16;i++){
            float a=float(i)*2.399963;
            vec2 p=uvScreen+vec2(cos(a),sin(a))*sqrt((float(i)+.5)/16.)*pixel*radius;
            float nz=distanceAt(p);
            float inFocus=1.-smoothstep(band,band*1.8,abs(nz-focus));
            float w=mix(1.,.12,inFocus);
            // Avoid distant color bleeding through a foreground silhouette.
            if(z<focus-band && nz>z+band*2.)w*=.12;
            color+=texture2D(image,p).rgb*w;
            weight+=w;
          }
          color/=weight;
        }
      }
      vec3 halo=texture2D(bloomFine,uvScreen).rgb*.45;
      halo+=texture2D(bloomMedium,uvScreen).rgb*.34;
      halo+=texture2D(bloomWide,uvScreen).rgb*.21;
      color+=halo*bloomStrength;
      if(hasSelection)color+=selectionEdge(uvScreen);
      // A light optical falloff, leaving equipment at frame edges legible.
      vec2 frame=uvScreen*(1.-uvScreen.yx);
      float edge=clamp(16.*frame.x*frame.y,0.,1.);
      color*=mix(.94,1.,pow(edge,.28));
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      gl_FragColor.rgb=gradeDisplayColor(gl_FragColor.rgb);
    }
  `,true);
  const scene=new T.Scene();
  const quad=new T.Mesh(new T.PlaneGeometry(2,2),composite);
  quad.frustumCulled=false;
  scene.add(quad);
  const ortho=new T.Camera();
  let enabled=true,active=false,lastFrame=0;
  const draw=(material,output)=>{
    quad.material=material;
    renderer.setRenderTarget(output);
    renderer.render(scene,ortho);
  };
  return {
    async prepare(world){
      const previous=renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      let pending;
      try{pending=renderer.compileAsync(world,camera);}
      finally{renderer.setRenderTarget(previous);}
      await pending;
    },
    resize(w,h){
      w=Math.max(1,Math.round(w));h=Math.max(1,Math.round(h));
      target.setSize(w,h);
      uniforms.pixel.value.set(1/w,1/h);
      extract.uniforms.pixel.value.copy(uniforms.pixel.value);
      levels.forEach((level,i)=>{
        const divisor=2**(i+1),width=Math.max(1,Math.ceil(w/divisor)),height=Math.max(1,Math.ceil(h/divisor));
        level.a.setSize(width,height);level.b.setSize(width,height);level.size.set(width,height);
      });
    },
    setEnabled(v){enabled=Boolean(v);},
    setActive(v){active=Boolean(v);},
    setSelection(v){hasSelection.value=Boolean(v);},
    setBloomStrength(v){uniforms.bloomStrength.value=T.MathUtils.clamp(v,0,1.5);},
    render(world,focus){
      const now=performance.now(),dt=lastFrame?Math.min(.1,(now-lastFrame)/1000):1/60;
      lastFrame=now;
      uniforms.focus.value=focus;
      uniforms.near.value=camera.near;uniforms.far.value=camera.far;
      uniforms.amount.value+=(Number(active&&enabled)-uniforms.amount.value)*(1.-Math.exp(-5.5*dt));
      const previousTarget=renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(world,camera);
      draw(extract,levels[0].a);
      for(let i=0;i<levels.length;i++){
        const level=levels[i],source=i?levels[i-1].a:level.a;
        blur.uniforms.image.value=source.texture;
        blur.uniforms.direction.value.set(1.35/level.size.x,0);
        draw(blur,level.b);
        blur.uniforms.image.value=level.b.texture;
        blur.uniforms.direction.value.set(0,1.35/level.size.y);
        draw(blur,level.a);
      }
      draw(composite,previousTarget);
    },
    dispose(){
      target.dispose();target.depthTexture.dispose();
      levels.forEach(level=>{level.a.dispose();level.b.dispose();});
      extract.dispose();blur.dispose();composite.dispose();quad.geometry.dispose();
    }
  };
}