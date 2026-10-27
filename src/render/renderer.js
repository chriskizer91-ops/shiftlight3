/* =====================================================================================
   RENDERER — one frame:
     shadows (moon/sun cascades, headlight spot) -> one face of the reflection probe ->
     scene (MRT: colour, normal+roughness+reflectance, velocity; jittered, at render scale) ->
     glass -> SSR -> fog and light shafts -> composite -> TAA up to native -> mip pyramid
     (next frame's reflections) -> motion blur -> particles -> bloom -> exposure ->
     tonemap and lens -> screen (or the LED matrix)
   ===================================================================================== */
import {createGL,M4} from './gl.js';
import {LAYOUT,STRIDE} from './mesh.js';
import {LightGrid} from './lights.js';
import {WORLD_VS,WORLD_FS,DEPTH_VS,DEPTH_FS,SKY_FS,FS_VS} from './glsl/world.js';
import {SSR_FS,FOG_FS,COMP_FS,TAA_FS,COPY_FS,DOWN4_FS,MB_FS,BLOOM_DOWN_FS,BLOOM_UP_FS,EXPO_FS,FINAL_FS,LED_FS,DEBUG_FS} from './glsl/post.js';

const HALTON=(i,b)=>{let f=1,r=0;while(i>0){f/=b;r+=f*(i%b);i=Math.floor(i/b);}return r;};
const JIT=Array.from({length:8},(_,i)=>[HALTON(i+1,2)-.5,HALTON(i+1,3)-.5]);
const CUBE=[[[1,0,0],[0,-1,0]],[[-1,0,0],[0,-1,0]],[[0,1,0],[0,0,1]],[[0,-1,0],[0,0,-1]],[[0,0,1],[0,-1,0]],[[0,0,-1],[0,-1,0]]];

export const QUALITY={
  low:{csm:1024,hl:512,probe:128,fogSteps:10,fogLights:6,fogDiv:4,ssr:1,mb:1,maxScale:.75},
  medium:{csm:1536,hl:768,probe:192,fogSteps:14,fogLights:10,fogDiv:2,ssr:1,mb:1,maxScale:1},
  high:{csm:2048,hl:1024,probe:256,fogSteps:20,fogLights:14,fogDiv:2,ssr:1,mb:1,maxScale:1},
  ultra:{csm:3072,hl:1536,probe:256,fogSteps:28,fogLights:20,fogDiv:2,ssr:1,mb:1,maxScale:1.25}
};

export class Renderer{
  constructor(canvas,{quality='high'}={}){
    this.canvas=canvas;const G=createGL(canvas);this.G=G;const gl=G.gl;this.gl=gl;
    this.Q=QUALITY[quality]||QUALITY.high;this.qname=quality;
    this.scale=1;this.frameN=0;this.prevVP=null;this.hasPrev=false;this.resetTAA=true;this.cars=[];
    /* programs (compiled now, linked lazily) */
    const P=(n,vs,fs,d)=>G.program(n,vs,fs,d);
    this.P={
      world:P('world',WORLD_VS,WORLD_FS),worldProbe:P('worldProbe',WORLD_VS,WORLD_FS,{PROBE:1}),depth:P('depth',DEPTH_VS,DEPTH_FS),
      sky:P('sky',FS_VS,SKY_FS),skyProbe:P('skyProbe',FS_VS,SKY_FS,{PROBE:1}),
      ssr:P('ssr',FS_VS,SSR_FS),fog:P('fog',FS_VS,FOG_FS),comp:P('comp',FS_VS,COMP_FS),taa:P('taa',FS_VS,TAA_FS),copy:P('copy',FS_VS,COPY_FS),
      down4:P('down4',FS_VS,DOWN4_FS),mb:P('mb',FS_VS,MB_FS),bdown:P('bdown',FS_VS,BLOOM_DOWN_FS),bup:P('bup',FS_VS,BLOOM_UP_FS),
      expo:P('expo',FS_VS,EXPO_FS),dbg:P('dbg',FS_VS,DEBUG_FS),final:P('final',FS_VS,FINAL_FS),led:P('led',FS_VS,LED_FS)
    };
    this.extra=[];   /* other pipelines (cars, particles) register draw hooks here */
    /* fixed-size targets */
    const Q=this.Q;
    this.csm=G.texture(Q.csm,Q.csm,'depth32f',{layers:3,compare:true});
    this.csmFB=[0,1,2].map(l=>G.target(null,{tex:this.csm,layer:l}));
    this.hlSh=G.texture(Q.hl,Q.hl,'depth32f',{compare:true});this.hlFB=G.target(null,this.hlSh);
    this.probe=G.texture(Q.probe,Q.probe,'rgba16f',{cube:true,mips:true});
    this.probeDepth=G.texture(Q.probe,Q.probe,'depth32f');
    this.probeFB=[0,1,2,3,4,5].map(f=>G.target([{tex:this.probe,face:f}],this.probeDepth));
    this.probeFace=0;this.probeFilled=0;
    this.expo=[0,1].map(()=>G.texture(1,1,'rgba16f',{filter:'nearest'}));this.expoFB=this.expo.map(t=>G.target([t]));this.expoI=0;
    this.U={uFlick:new Float32Array(8).fill(1),uDyn:new Float32Array(192),uNDyn:0,uHL:new Float32Array(20),uOcc:new Float32Array(64),uNOcc:0,
      uCSMM:new Float32Array(48),uXw:new Float32Array(8).fill(-1),uLightsOn:1,uCSMOn:0,uHLShOn:0};
    this.timer=G.timer();this.gpuMs=-1;
    this.W=0;this.H=0;this.iw=0;this.ih=0;
  }
  /* the HUD canvas as a texture, for the LED matrix to draw as lamps */
  hudTexture(cv){
    const gl=this.gl;if(!this.hudT){this.hudT={t:gl.createTexture(),target:gl.TEXTURE_2D};gl.bindTexture(gl.TEXTURE_2D,this.hudT.t);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}
    gl.bindTexture(gl.TEXTURE_2D,this.hudT.t);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cv);return this.hudT;
  }
  /* the world: geometry tiles and the static lights */
  loadWorld(city,T){
    const G=this.G,gl=this.gl;this.city=city;
    /* replacing a level: let go of the last one's buffers and light textures */
    if(this.world){gl.deleteVertexArray(this.world.vao);gl.deleteBuffer(this.world.vb);if(this.world.ib)gl.deleteBuffer(this.world.ib);}
    if(this.lights){G.del(this.lights.tex);G.del(this.lights.grid);G.del(this.lights.list);}
    this.world=G.mesh(LAYOUT,STRIDE,city.geo.vb,city.geo.ib);
    this.tiles=city.geo.ranges.map(r=>({...r,c:[(r.mn[0]+r.mx[0])/2,(r.mn[1]+r.mx[1])/2,(r.mn[2]+r.mx[2])/2]}));
    this.lights=new LightGrid(G,city.lights,(city.info&&city.info.lightGrid)||{});
    this.U.uGridP=this.lights.params;
    const xw=new Float32Array(8).fill(-1);if(T)(city.info.xw||[]).forEach((s,i)=>{if(i<8)xw[i]=s;});this.U.uXw=xw;
    this.U.uRoad=T?[T.hw,T.lanes,T.len,1]:[6.5,2,1e4,1];
    this.resetTAA=true;this.hasPrev=false;this.probeFilled=0;
  }
  /* (re)allocate everything that depends on the screen size and render scale */
  resize(W,H,scale=this.scale){
    const G=this.G;scale=Math.min(scale,this.Q.maxScale);
    const iw=Math.max(64,Math.round(W*scale)),ih=Math.max(64,Math.round(H*scale));
    if(W!==this.W||H!==this.H){
      this.W=W;this.H=H;
      for(const t of [this.hist,this.mbT,this.pyr,this.ldr].flat().filter(Boolean))G.del(t);
      this.hist=[0,1].map(()=>G.texture(W,H,'rgba16f'));this.histFB=this.hist.map(t=>G.target([t]));this.histI=0;
      this.mbT=G.texture(W,H,'rgba16f');this.mbFB=G.target([this.mbT]);
      this.pyr=G.texture(Math.max(1,W>>1),Math.max(1,H>>1),'rgba16f',{mips:true});this.pyrFB=G.target([this.pyr]);
      this.bl=[];let w=W>>1,h=H>>1;for(let i=0;i<6&&w>2&&h>2;i++){const t=G.texture(w,h,'rgba16f');this.bl.push({t,fb:G.target([t]),w,h});w>>=1;h>>=1;}
      this.ldr=G.texture(W,H,'rgba8');this.ldrFB=G.target([this.ldr]);
      this.resetTAA=true;this.hasPrev=false;
    }
    if(iw!==this.iw||ih!==this.ih){
      this.iw=iw;this.ih=ih;this.scale=scale;
      for(const t of [this.cT,this.nT,this.vT,this.dT,this.litT,this.ssrT,this.fogT].filter(Boolean))G.del(t);
      this.cT=G.texture(iw,ih,'rgba16f');this.nT=G.texture(iw,ih,'rgba16f');this.vT=G.texture(iw,ih,'rg16f');this.dT=G.texture(iw,ih,'depth32f',{filter:'nearest'});
      this.mainFB=G.target([this.cT,this.nT,this.vT],this.dT);
      this.glassFB=G.target([this.cT],this.dT);
      this.litT=G.texture(iw,ih,'rgba16f');this.litFB=G.target([this.litT]);
      const hw=Math.max(1,iw>>1),hh=Math.max(1,ih>>1),fd=this.Q.fogDiv;
      this.ssrT=G.texture(hw,hh,'rgba16f');this.ssrFB=G.target([this.ssrT]);
      this.fogT=G.texture(Math.max(1,Math.round(iw/fd)),Math.max(1,Math.round(ih/fd)),'rgba16f');this.fogFB=G.target([this.fogT]);
      this.resetTAA=true;
    }
  }

  /* ---------- per-frame matrices ---------- */
  camera(S){
    const c=S.cam,iw=this.iw,ih=this.ih,asp=this.W/this.H;
    const f=c.fwd,u0=c.up||[0,1,0];const b=[-f[0],-f[1],-f[2]];
    let r=[u0[1]*b[2]-u0[2]*b[1],u0[2]*b[0]-u0[0]*b[2],u0[0]*b[1]-u0[1]*b[0]];const rl=Math.hypot(...r);r=r.map(x=>x/rl);
    const up=[b[1]*r[2]-b[2]*r[1],b[2]*r[0]-b[0]*r[2],b[0]*r[1]-b[1]*r[0]];
    const V=M4.view(c.pos,r,up,b),near=c.near||.25,far=c.far||3200;
    const Pn=M4.persp(c.fov,asp,near,far),Pj=Pn.slice();
    const j=JIT[this.frameN%8];this.jit=j;Pj[8]+=2*j[0]/iw;Pj[9]+=2*j[1]/ih;
    const VP=M4.mul(Pj,V),VPnj=M4.mul(Pn,V);
    const U=this.U;
    U.uView=V;U.uProj=Pj;U.uVP=VP;U.uVPnj=VPnj;U.uInvVP=M4.invert(VP);U.uPrevVP=this.prevVP&&!S.cut?this.prevVP:VPnj;
    U.uCam=c.pos;U.uNear=near;U.uFar=far;U.uJit=j;U.uRes=[iw,ih];
    this.camBasis={r,up,b,f};this.near=near;this.far=far;this.fov=c.fov;this.asp=asp;
    this.VPnj=VPnj;this.planes=M4.planes(VP);
  }
  /* cascades: bounding spheres of frustum slices, snapped to shadow texels so they don't swim */
  cascades(S){
    const U=this.U,L=S.env.sunDir,Q=this.Q;
    const splits=[0,14,45,140];U.uCSMS=[splits[1],splits[2],splits[3],1.5/Q.csm];
    const {f}=this.camBasis,th=Math.tan(this.fov/2),cam=S.cam.pos;
    const lu=Math.abs(L[1])>.99?[1,0,0]:[0,1,0];
    /* a light view fixed in the world, so moving the camera only slides the window in whole texels */
    const V=M4.lookAt([L[0]*500,L[1]*500,L[2]*500],[0,0,0],lu);
    this.csmM=[];
    for(let k=0;k<3;k++){
      const n=splits[k],fa=splits[k+1],cz=(n+fa)/2,hy=fa*th,hx=hy*this.asp;
      const rad=Math.ceil(Math.hypot(hx,hy,(fa-n)/2)*1.04);
      const c=[cam[0]+f[0]*cz,cam[1]+f[1]*cz,cam[2]+f[2]*cz],lc=M4.xform(V,c),tex=2*rad/Q.csm;
      const cx=Math.round(lc[0]/tex)*tex,cy=Math.round(lc[1]/tex)*tex;
      const M=M4.mul(M4.ortho(cx-rad,cx+rad,cy-rad,cy+rad,-lc[2]-rad-260,-lc[2]+rad+80),V);
      this.csmM.push(M);U.uCSMM.set(M,k*16);
    }
  }
  /* ---------- drawing the world ---------- */
  drawWorld(P,planes,{sort=null,maxDist=1e9,from=null}={}){
    const G=this.G,gl=this.gl,list=[];
    for(const t of this.tiles){if(!M4.boxVisible(planes,t.mn,t.mx))continue;
      if(from){const dx=Math.max(0,t.mn[0]-from[0],from[0]-t.mx[0]),dz=Math.max(0,t.mn[2]-from[2],from[2]-t.mx[2]);t.d=Math.hypot(dx,dz);if(t.d>maxDist)continue;}
      list.push(t);}
    if(sort)list.sort((a,b)=>a.d-b.d);
    gl.bindVertexArray(this.world.vao);
    for(const t of list)gl.drawElements(gl.TRIANGLES,t.count,gl.UNSIGNED_INT,t.first*4);
    return list.length;
  }
  shadowPass(S){
    const G=this.G,gl=this.gl,U=this.U,P=this.P.depth;
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.depthMask(true);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1.5,3);
    gl.disable(gl.CULL_FACE);
    G.use(P);G.uni(P,'uModel',M4.ident());
    const sun=U.uCSMOn>0;
    if(sun){for(let k=0;k<3;k++){if(k>0&&(this.frameN+k)%2)continue;
      G.bind(this.csmFB[k]);gl.clear(gl.DEPTH_BUFFER_BIT);G.uni(P,'uVP',this.csmM[k]);
      this.drawWorld(P,M4.planes(this.csmM[k]));for(const h of this.extra)h.shadow&&h.shadow(this,P,this.csmM[k],'sun',k);}}
    if(U.uHLShOn>0){G.bind(this.hlFB);gl.clear(gl.DEPTH_BUFFER_BIT);G.uni(P,'uVP',this.hlM);
      this.drawWorld(P,M4.planes(this.hlM),{from:this.hlPos,maxDist:80});for(const h of this.extra)h.shadow&&h.shadow(this,P,this.hlM,'hl');}
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }
  probePass(S){
    const G=this.G,gl=this.gl,Q=this.Q,f=this.probeFace;this.probeFace=(f+1)%6;
    const pos=S.probePos;const [fw,up]=CUBE[f];
    const V=M4.lookAt(pos,[pos[0]+fw[0],pos[1]+fw[1],pos[2]+fw[2]],up),Pr=M4.persp(Math.PI/2,1,.3,2500);
    const VP=M4.mul(Pr,V);
    const U2=Object.assign({},this.U,{uVP:VP,uVPnj:VP,uPrevVP:VP,uInvVP:M4.invert(VP),uCam:pos,uFrame:this.frameN});
    G.bind(this.probeFB[f]);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
    const P=G.use(this.P.worldProbe);G.set(P,U2);G.tex(P,this.lights.bindings());G.tex(P,{uCSM:this.csm,uHLSh:this.hlSh,uProbe:this.probe});
    this.drawWorld(P,M4.planes(VP),{from:pos,maxDist:900});
    gl.disable(gl.CULL_FACE);
    const Ps=G.use(this.P.skyProbe);G.set(Ps,U2);gl.depthMask(false);G.fullscreen();gl.depthMask(true);
    if(f===5){gl.bindTexture(gl.TEXTURE_CUBE_MAP,this.probe.t);gl.generateMipmap(gl.TEXTURE_CUBE_MAP);this.probeFilled++;}
  }
  /* ---------- the frame ---------- */
  render(S){
    const G=this.G,gl=this.gl,U=this.U,Q=this.Q;
    if(this.timer){this.gpuMs=this.timer.poll();this.timer.begin();}
    this.camera(S);
    const E=S.env;
    Object.assign(U,{uTime:S.time,uFrame:this.frameN,uSunDir:E.sunDir,uSunCol:E.sunCol,uAmbUp:E.ambUp,uAmbDn:E.ambDn,uFogCol:E.fogCol,uFogDen:E.fogDen,uFogFall:E.fogFall,
      uWet:E.wet,uRain:E.rain,uNight:E.night,uSkyZen:E.skyZen,uSkyHor:E.skyHor,uSkyGlow:E.skyGlow,uCloud:E.cloud,uStars:E.stars,uSunSize:E.sunSize,
      uLightsOn:E.lightsOn,uLit:E.lit,uSignal:S.time*.9,uFogAmb:E.fogAmb,uFogSteps:Q.fogSteps,uFogLights:Q.fogLights,uProbeLod:Math.log2(Q.probe)-1});
    U.uRoad[3]=E.puddles;
    U.uFlick.set(S.flicker||[1,1,1,1,1,1,1,1]);
    /* dynamic lights and headlights */
    const dyn=S.dyn||[];U.uNDyn=Math.min(16,dyn.length);U.uDyn.fill(0);
    dyn.slice(0,16).forEach((L,i)=>{U.uDyn.set([L.pos[0],L.pos[1],L.pos[2],L.r,L.col[0],L.col[1],L.col[2],L.type||0,L.dir?L.dir[0]:0,L.dir?L.dir[1]:-1,L.dir?L.dir[2]:0,L.cosO??-1],i*12);});
    const hl=S.headlights;
    if(hl&&hl.on>0){U.uHL.set([...hl.posL,hl.on,...hl.posR,hl.high||0,...hl.dir,0,...hl.right,0,...hl.col,hl.range]);
      const c=[(hl.posL[0]+hl.posR[0])/2,(hl.posL[1]+hl.posR[1])/2,(hl.posL[2]+hl.posR[2])/2];this.hlPos=c;
      const V=M4.lookAt(c,[c[0]+hl.dir[0],c[1]+hl.dir[1],c[2]+hl.dir[2]],hl.up||[0,1,0]);this.hlM=M4.mul(M4.persp(1.9,1.35,.35,hl.range),V);U.uHLMat=this.hlM;U.uHLShOn=1;}
    else{U.uHL[0+3]=0;U.uHLShOn=0;}
    U.uNOcc=Math.min(8,(S.occ||[]).length);(S.occ||[]).slice(0,8).forEach((o,i)=>U.uOcc.set(o,i*8));
    U.uCSMOn=Math.max(...E.sunCol)>.002?1:0;
    if(U.uCSMOn)this.cascades(S);
    for(const h of this.extra)h.prepare&&h.prepare(this,S);
    /* shadows and the probe */
    this.shadowPass(S);
    if(S.probePos)this.probePass(S);
    /* ---------- the scene ---------- */
    G.bind(this.mainFB);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.disable(gl.BLEND);
    const texs=Object.assign(this.lights.bindings(),{uCSM:this.csm,uHLSh:this.hlSh,uProbe:this.probe});
    for(const h of this.extra)h.opaque&&h.opaque(this,U,texs);
    const Pw=G.use(this.P.world);G.set(Pw,U);G.tex(Pw,texs);
    this.drawn=this.drawWorld(Pw,this.planes,{sort:true,from:S.cam.pos});
    gl.disable(gl.CULL_FACE);
    const Ps=G.use(this.P.sky);G.set(Ps,U);G.fullscreen();
    /* glass and other see-through things that belong to the scene */
    G.bind(this.glassFB);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
    for(const h of this.extra)h.glass&&h.glass(this,U,texs);
    gl.disable(gl.BLEND);gl.depthMask(true);gl.disable(gl.DEPTH_TEST);
    /* ---------- reflections and fog ---------- */
    const Pr=G.use(this.P.ssr);G.bind(this.ssrFB);G.set(Pr,U);
    G.uni(Pr,'uHasPrev',this.hasPrev?1:0);G.uni(Pr,'uResScale',this.iw/this.W);G.uni(Pr,'uPrevLod',this.pyr.levels-1);G.uni(Pr,'uProbeLod',U.uProbeLod);
    G.tex(Pr,{uNrm:this.nT,uDepth:this.dT,uPrev:this.pyr,uProbe:this.probe});G.fullscreen();
    const Pf=G.use(this.P.fog);G.bind(this.fogFB);G.set(Pf,U);G.tex(Pf,Object.assign({uDepth:this.dT},texs));G.fullscreen();
    const Pc=G.use(this.P.comp);G.bind(this.litFB);G.set(Pc,U);G.tex(Pc,{uCol:this.cT,uNrm:this.nT,uSSR:this.ssrT,uFog:this.fogT,uDepth:this.dT});G.fullscreen();
    /* ---------- TAA to native resolution ---------- */
    const hi=this.histI,ho=1-hi;this.histI=ho;
    const Pt=G.use(this.P.taa);G.bind(this.histFB[ho]);
    G.set(Pt,{uInRes:[this.iw,this.ih],uOutRes:[this.W,this.H],uJit:this.jit,uReset:this.resetTAA||S.cut?1:0});
    G.tex(Pt,{uCur:this.litT,uHist:this.hist[hi],uVel:this.vT,uDepth:this.dT});G.fullscreen();
    this.resetTAA=false;
    /* the pyramid the next frame's reflections read from */
    const Pd=G.use(this.P.down4);G.bind(this.pyrFB);G.uni(Pd,'uPx',[1/this.W,1/this.H]);G.tex(Pd,{uSrc:this.hist[ho]});G.fullscreen();
    gl.bindTexture(gl.TEXTURE_2D,this.pyr.t);gl.generateMipmap(gl.TEXTURE_2D);
    this.hasPrev=true;
    /* ---------- motion blur ---------- */
    const Pm=G.use(this.P.mb);G.bind(this.mbFB);
    G.set(Pm,{uShutter:S.shutter??.5,uOutRes:[this.W,this.H],uNear:this.near,uFar:this.far,uFrame:this.frameN});
    G.tex(Pm,{uSrc:this.hist[ho],uVel:this.vT,uDepth:this.dT});G.fullscreen();
    /* particles go over the finished scene, depth-tested by hand */
    if(this.extra.some(h=>h.particles)){G.bind(this.mbFB);gl.enable(gl.BLEND);for(const h of this.extra)h.particles&&h.particles(this,U,texs);gl.disable(gl.BLEND);}
    /* ---------- bloom ---------- */
    const Pb=G.use(this.P.bdown);let src=this.mbT,sw=this.W,sh=this.H;
    this.bl.forEach((L,i)=>{G.bind(L.fb);G.uni(Pb,'uPx',[1/sw,1/sh]);G.uni(Pb,'uFirst',i===0?1:0);G.tex(Pb,{uSrc:src});G.fullscreen();src=L.t;sw=L.w;sh=L.h;});
    /* ---------- exposure ---------- */
    const ei=this.expoI,eo=1-ei;this.expoI=eo;const Pe=G.use(this.P.expo);G.bind(this.expoFB[eo]);
    G.set(Pe,{uDt:S.dt||1/60,uKey:E.key,uRange:E.expoRange||[.05,40],uReset:this.frameN<2||S.cut?1:0});
    G.tex(Pe,{uSrc:this.bl[Math.min(3,this.bl.length-1)].t,uPrev:this.expo[ei]});G.fullscreen();
    const Pu=G.use(this.P.bup);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
    for(let i=this.bl.length-1;i>0;i--){const L=this.bl[i],D=this.bl[i-1];G.bind(D.fb);G.uni(Pu,'uPx',[1/L.w,1/L.h]);G.uni(Pu,'uW',1);G.tex(Pu,{uSrc:L.t});G.fullscreen();}
    gl.disable(gl.BLEND);
    /* ---------- tonemap ---------- */
    const Pfin=G.use(this.P.final);G.bind(S.led?this.ldrFB:null,[0,0,this.W,this.H]);
    G.set(Pfin,U);G.set(Pfin,{uBloomK:E.bloom,uGrade:E.grade,uExpoBias:E.expoBias||1,uLensRain:S.lensRain||0,uVig:.35,uGrain:.018,uOutRes:[this.W,this.H],uCA:.6});
    G.tex(Pfin,{uSrc:this.mbT,uBloom:this.bl[0].t,uExpo:this.expo[eo]});G.fullscreen();
    if(S.debug){const D={color:[this.cT,0],normal:[this.nT,1],rough:[this.nT,2],ssrw:[this.nT,3],vel:[this.vT,4],depth:[this.dT,5],ssr:[this.ssrT,0],fog:[this.fogT,0],fogT:[this.fogT,3],lit:[this.litT,0],hist:[this.hist[ho],0],mb:[this.mbT,0],bloom:[this.bl[0].t,0],expo:[this.expo[eo],0],probe:[this.pyr,0]}[S.debug];
      if(D){const Pg=G.use(this.P.dbg);G.bind(null,[0,0,this.W,this.H]);G.set(Pg,{uMode:D[1],uGain:S.debugGain||1});G.tex(Pg,{uSrc:D[0]});G.fullscreen();}}
    if(S.led){const Pl=G.use(this.P.led);G.bind(null,[0,0,this.W,this.H]);G.set(Pl,{uRes:S.led.res,uGain:1.25,uQuant:S.led.quant??15});G.tex(Pl,{uSrc:this.ldr,uHud:S.led.hud});G.fullscreen();}
    this.prevVP=this.VPnj;this.frameN++;
    if(this.timer)this.timer.end();
  }
}
