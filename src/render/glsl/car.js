/* =====================================================================================
   CAR SHADER — clearcoat over metallic flake, the lamps, grille, panel gaps and trim painted
   by position on the body, glass with its pillars and frit, tyres, rims, glowing discs.
   Every car is drawn instanced: the model matrices, paint and lamp states come per instance,
   and the numbers that say where a design's glass, seams and lamps are come in uD[] (see
   designs.js), so one program draws every body. GLASS is defined for the see-through pass.
   ===================================================================================== */
import {FRAME,NOISE,PACK,LIGHTING,SHADE} from './common.js';

const INST=`layout(location=5) in vec4 iM0;layout(location=6) in vec4 iM1;layout(location=7) in vec4 iM2;
layout(location=8) in vec4 iP0;layout(location=9) in vec4 iP1;layout(location=10) in vec4 iP2;
layout(location=11) in vec4 iPaint;layout(location=12) in vec4 iPaint2;layout(location=13) in vec4 iRoof;layout(location=14) in vec4 iLamps;`;

export const CAR_VS=`
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNrm;layout(location=2) in vec2 aUV;layout(location=3) in uvec4 aMat;layout(location=4) in vec4 aCol;
${INST}
uniform mat4 uVP;uniform mat4 uVPnj;uniform mat4 uPrevVP;
out vec3 vP;out vec3 vL;out vec3 vN;out vec3 vNL;out vec2 vUV;flat out uvec4 vMat;out vec4 vCur;out vec4 vPrev;
flat out vec4 vPaint;flat out vec4 vPaint2;flat out vec4 vRoof;flat out vec4 vLamps;
void main(){vec4 p=vec4(aPos,1.0);vec3 w=vec3(dot(iM0,p),dot(iM1,p),dot(iM2,p)),pw=vec3(dot(iP0,p),dot(iP1,p),dot(iP2,p));
  vP=w;vL=aPos;vN=vec3(dot(iM0.xyz,aNrm),dot(iM1.xyz,aNrm),dot(iM2.xyz,aNrm));vNL=aNrm;vUV=aUV;vMat=aMat;
  vPaint=iPaint;vPaint2=iPaint2;vRoof=iRoof;vLamps=iLamps;
  gl_Position=uVP*vec4(w,1.0);vCur=uVPnj*vec4(w,1.0);vPrev=uPrevVP*vec4(pw,1.0);}`;

/* shadows: position only */
export const CAR_DEPTH_VS=`
layout(location=0) in vec3 aPos;
${INST}
uniform mat4 uVP;flat out float vG;
void main(){vec4 p=vec4(aPos,1.0);vG=iPaint2.w;gl_Position=uVP*vec4(dot(iM0,p),dot(iM1,p),dot(iM2,p),1.0);}`;
/* ghosts cast no shadow */
export const CAR_DEPTH_FS=`flat in float vG;out vec4 o;void main(){if(vG>.5)discard;o=vec4(0);}`;

export const CAR_FS=FRAME+NOISE+PACK+LIGHTING+SHADE+`
in vec3 vP;in vec3 vL;in vec3 vN;in vec3 vNL;in vec2 vUV;flat in uvec4 vMat;in vec4 vCur;in vec4 vPrev;
flat in vec4 vPaint;flat in vec4 vPaint2;flat in vec4 vRoof;flat in vec4 vLamps;
layout(location=0) out vec4 oCol;
#ifndef GLASS
layout(location=1) out vec4 oNrm;layout(location=2) out vec2 oVel;
#endif
uniform samplerCube uProbe;uniform float uProbeLod;
uniform vec4 uD[18];
#define uDims uD[0]
#define uArch uD[1]
#define uCab uD[2]
#define uGHa uD[3]
#define uGHw uD[4]
#define uGHb uD[5]
#define uGHc uD[6]
#define uSeam0 uD[7]
#define uSeam1 uD[8]
#define uSeam2 uD[9]
#define uHead uD[10]
#define uHead2 uD[11]
#define uTail0 uD[12]
#define uTail1 uD[13]
#define uTail2 uD[14]
#define uGrille uD[15]
#define uGrille2 uD[16]
#define uMisc uD[17]
/* this instance */
vec3 uPaint;float uMetal;float uPaintR;float uFlake;vec3 uRoof;vec4 uLamps;float uDisc;vec3 uCaliper;float uHcg;
float indL,indR,revL;
float aa(float d,float w){float f=fwidth(d)*.8+1e-5;return 1.0-smoothstep(w-f,w+f,d);}
/* a rounded box: negative inside */
float rbox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
vec3 envBRDF(vec3 F0,float NoV,float r){const vec4 c0=vec4(-1,-.0275,-.572,.022),c1=vec4(1,.0425,1.04,-.04);vec4 rr=r*c0+c1;
  float a=min(rr.x*rr.x,exp2(-9.28*NoV))*rr.x+rr.y;vec2 AB=vec2(-1.04,1.04)*a+rr.zw;return F0*AB.x+AB.y;}
vec3 env(vec3 R,float r){return textureLod(uProbe,R,r*uProbeLod).rgb;}
/* the colour of hot iron */
vec3 heat(float t){return vec3(1.,.28,.05)*smoothstep(.25,.6,t)*6.+vec3(1.,.55,.15)*smoothstep(.6,1.,t)*14.;}
const vec3 AMBER=vec3(1.,.42,.02);

/* the greenhouse: glass or not, from the profile position u (0 at the belt, 1 on the roof centre) and x */
void ghClass(float u,float x,out bool top,out float glass,out float frit){
  float ut=uGHb.x;top=u>ut;glass=0.0;frit=0.0;float mu=min(u,ut);
  float aEdge=uGHa.x+uGHa.y*mu,cEdge=uGHa.z+uGHa.w*mu;
  if(top){if(x>uGHw.x&&x<uGHw.y){glass=1.0;frit=max(aa(u-ut,.035),aa(uGHw.y-x,.03));}
    else if(x<uGHw.z&&x>uGHw.w){glass=1.0;frit=max(max(aa(u-ut,.05),aa(uGHw.z-x,.05)),aa(x-uGHw.w,.04));}}
  else if(u>.03&&x<aEdge&&x>cEdge){
    if(uGHb.w<.5&&x<uGHb.y-uGHb.z)return;   /* a panel van: solid behind the B pillar */
    glass=1.0;frit=max(aa(aEdge-x,.012),aa(x-cEdge,.012));
    if(abs(x-uGHb.y)<uGHb.z)frit=1.0;
    if(uGHc.y>0.0&&abs(x-uGHc.x)<uGHc.y)frit=1.0;}
}
struct M{vec3 alb;float metal;float rough;float clear;float clearR;vec3 em;float flake;vec2 g;float spec;};
/* panel gaps: distance to the seams, in body metres */
float seams(vec3 L,vec3 N,float yg){
  float d=1.0;float az=abs(L.z);
  if(abs(N.z)>.3){
    if(yg>uSeam1.w-.05&&yg<uDims.w+.02){d=min(d,abs(L.x-uSeam0.y-.07*(yg-.55)));d=min(d,abs(L.x-uSeam0.w-.11*(yg-.55)));
      if(uSeam0.z!=0.0)d=min(d,abs(L.x-uSeam0.z-.05*(yg-.55)));}
    if(L.x<uSeam0.y&&L.x>uSeam0.w)d=min(d,abs(yg-uSeam1.w));
    if(yg>.3&&yg<.72)d=min(d,abs(L.x-uSeam2.x));
    if(yg>.33&&yg<.8)d=min(d,abs(L.x-uSeam2.y));
    if(L.z>0.0)d=min(d,abs(length(vec2(L.x-uSeam1.y,yg-uSeam1.z))-.085));
  }
  if(N.y>.45){
    if(az<uSeam2.z+.03)d=min(d,abs(L.x-uSeam0.x));
    if(L.x>uSeam0.x&&L.x<uSeam2.x+.07)d=min(d,abs(az-uSeam2.z+.04*(L.x-uSeam0.x)));
    if(uSeam1.x!=0.0){if(az<uSeam2.w&&L.x<uSeam1.x+.085)d=min(d,abs(L.x-uSeam1.x));if(L.x<uSeam1.x)d=min(d,abs(az-uSeam2.w-.01));}
  }
  if(uGHc.w>.5&&N.x<-.7)d=min(d,az);   /* the van's split rear doors */
  return d;
}
void paint(inout M m,vec3 L,vec3 N,float yg,vec3 V){
  m.alb=uPaint;m.metal=uMetal;m.rough=uPaintR;m.clear=1.0;m.clearR=.035;m.flake=uFlake;
  float az=abs(L.z),xF=uDims.x,xR=uDims.y;bool slim=uHead2.x<.5;
  float blink=step(.5,fract(uTime*1.55)),ind=(L.z<0.0?indL:indR)*blink;
  /* rocker, lower valance, diffuser: satin black */
  if(yg<uSeam1.w-.04||(L.x>xF-.13&&yg<.3)||(L.x<xR+.12&&yg<.33)){m.alb=vec3(.02);m.metal=0.;m.rough=.5;m.clear=.3;m.flake=0.;
    if(slim&&L.x<xR+.12&&yg<.33){float fin=step(.5,fract(L.z*7.));m.alb*=1.0+fin*.5;}}
  /* unpainted plastic bumpers on the working cars */
  if(uHead2.y>0.0&&yg<uHead2.y&&(L.x>uSeam2.x-.02||L.x<uSeam2.y+.02)){m.alb=vec3(.025);m.metal=0.;m.rough=.6;m.clear=0.;m.flake=0.;}
  /* a taxi's checker band */
  if(uGHc.z>.5&&abs(N.z)>.5&&yg>uDims.w-.11&&yg<uDims.w-.04&&L.x<xF-.35&&L.x>xR+.3){
    float ck=mod(floor(L.x/.035)+floor((yg-uDims.w)/.035),2.);m.alb=mix(vec3(.015),vec3(.75),ck);m.metal=0.;m.flake=0.;m.rough=.3;}
  /* front: grille and intakes */
  if(N.x>.55&&L.x>xF-.15){
    if(az<uGrille.x&&yg>uGrille.y&&yg<uGrille.z){
      float web;
      if(slim){vec2 h=vec2(L.z*42.,yg*42.);h.x+=step(.5,fract(h.y*.5))*.5;vec2 f=abs(fract(h)-.5);web=step(.38,max(f.x,f.y));}
      else web=step(.55,fract((yg-uGrille.y)*28.));
      m.alb=vec3(.012)+web*(slim?.03:.06);m.metal=web*.5;m.rough=.35;m.clear=0.;m.flake=0.;
      float e=.02;if(az>uGrille.x-e||yg<uGrille.y+e||yg>uGrille.z-e){m.alb=vec3(.6);m.metal=1.;m.rough=.15;}}
    else if(az<uGrille.w&&yg>uGrille2.x&&yg<uGrille2.y){m.alb=vec3(.01);m.metal=0.;m.rough=.6;m.clear=0.;m.flake=0.;}
  }
  /* headlamps */
  if(slim){
    /* slim, swept back, LED projectors and a running-light strip */
    if(L.x>xF-.39&&N.x>-.1&&az>uHead.x&&az<uHead.y){
      float t=(az-uHead.x)/(uHead.y-uHead.x);float yc=uHead.z-.055*t-.04*smoothstep(.0,1.,(xF-.05-L.x)/.34);float hh=uHead.w-.01*t;
      if(abs(yg-yc)<hh){
        m.clear=1.0;m.clearR=.01;m.flake=0.;m.metal=1.;m.alb=vec3(.12);m.rough=.18;
        float p1=length(vec2(az-(uHead.x+.14),yg-yc+.004)),p2=length(vec2(az-(uHead.x+.27),yg-yc+.004));
        float proj=max(aa(p1,.021),aa(p2,.019));
        if(proj>0.0){m.alb=mix(m.alb,vec3(.02),proj);m.rough=mix(m.rough,.05,proj);m.em+=vec3(.9,.95,1.)*proj*uLamps.x*90.;}
        float drl=aa(abs(yg-(yc+hh-.007)),.0035)*step(uHead.x+.02,az);
        m.em+=mix(vec3(.95,.97,1.)*(uLamps.x>0.0?40.:25.),AMBER*60.,ind)*drl*(1.0-.85*(L.z<0.0?indL:indR)*(1.0-blink));
        m.alb*=1.0-drl*.6;m.g=vec2(0);}}
  }else{
    /* a reflector headlamp behind a clear lens, a parking light, the indicator at the outer corner */
    if(L.x>xF-.32&&N.x>.15){
      vec2 q=vec2(az-(uHead.x+uHead.y)*.5,yg-uHead.z),hb=vec2((uHead.y-uHead.x)*.5,uHead.w);
      float r=rbox(q,hb,.02);
      if(r<0.0){
        m.clear=1.0;m.clearR=.008;m.flake=0.;m.metal=1.;m.alb=vec3(.5);m.rough=.1;m.g=vec2(0);
        float bowl=length(q-vec2(-hb.x*.25,0.));float bulb=aa(bowl,.018);
        m.alb=mix(m.alb,vec3(.85),aa(bowl,hb.y*.95)*.5);
        m.em+=vec3(1.,.95,.85)*(bulb*uLamps.x*60.+aa(bowl,hb.y*.95)*uLamps.x*2.5);
        float side=step(hb.x-.06,q.x);m.alb=mix(m.alb,vec3(.5,.3,.05),side*.6);
        m.em+=AMBER*side*ind*45.;
        float park=step(q.x,-hb.x+.05);m.em+=vec3(1.,.97,.9)*park*uLamps.y*3.;}}
  }
  /* rear: lamp clusters (and a light bar), reverse lamps, the plate */
  if(L.x<xR+.2&&N.x<.2){
    float bar=uTail1.x>0.0?aa(abs(yg-uTail1.x),.009)*step(az,uDims.z-.15):0.0;
    float clus=aa(rbox(vec2(az-uTail0.x,yg-uTail0.z),uTail0.yw,.012),0.);
    float rev=aa(rbox(vec2(az-uTail1.y,yg-uTail1.z),uTail2.xy,.006),0.);
    float plate=aa(max(az-uTail2.z,abs(yg-uTail1.w)-uTail2.w),.0);
    /* the outer part of each cluster (or the bar's ends) is the indicator */
    float outer=slim?step(.7,az):step(uTail0.x+uTail0.y*.35,az);
    if(bar+clus>0.0){m.alb=mix(m.alb,vec3(.25,.01,.01),max(bar,clus));m.metal=mix(m.metal,0.,max(bar,clus));m.flake=0.;m.clearR=.01;
      float leds=clus*aa(abs(fract((yg-(uTail0.z-uTail0.w)-.0)/.03)-.5),.18);
      float lit=bar*(uLamps.y*6.+uLamps.z*30.)+(slim?leds:clus*.6)*(uLamps.y*5.+uLamps.z*36.)+clus*.15;
      float io=outer*max(bar,clus);
      m.em+=vec3(1.,.03,.02)*lit*(1.0-io*(L.z<0.0?indL:indR))+AMBER*io*ind*40.;}
    if(rev>0.0){m.alb=mix(m.alb,vec3(.6),rev);m.metal=0.;m.em+=vec3(1.,.97,.9)*rev*revL*30.;}
    if(plate>0.0){float pw=uTail2.z-.04;vec2 pc=vec2((L.z+pw)/(2.*pw)*7.,(yg-(uTail1.w-.05))/.1*5.);vec2 ci=floor(pc);float ch=step(.45,h12(ci+3.))*step(0.,pc.x)*step(pc.x,7.)*step(.6,pc.y)*step(pc.y,4.4)*step(.2,fract(pc.x));
      m.alb=mix(m.alb,mix(vec3(.75,.75,.7),vec3(.02),ch),plate);m.metal=0.;m.flake=0.;m.clear=.6;m.em+=vec3(.9,.9,.8)*plate*(1.0-ch)*uLamps.y*.6;}
  }
  /* panel gaps */
  float sd=seams(L,N,yg);float gp=aa(sd,.0032);
  if(gp>0.0){m.alb=mix(m.alb,vec3(.004),gp);m.clear*=1.0-gp;m.flake*=1.0-gp;m.rough=mix(m.rough,.7,gp);}
  /* water beads on the clear coat */
  if(uWet>0.0&&m.clear>.5){vec3 v3=voro(vec2(L.x+L.y*.3,L.z+L.y*.7)*55.);float bead=aa(v3.x,.26)*step(.45,v3.z)*uWet*saturate(1.0-length(fwidth(L))*120.);
    m.clearR=mix(m.clearR,.012,bead);m.alb*=1.0-bead*.15;}
}
/* T A X I in a 3x5 pixel font */
float taxiText(vec2 uv){if(uv.x<0.||uv.x>=1.||uv.y<0.||uv.y>=1.)return 0.;
  int col=int(floor(uv.x*16.)),row=int(floor(uv.y*7.));if(row<1||row>5)return 0.;int letter=col/4,cx=col-letter*4;if(cx>2)return 0.;
  int g=letter==0?29842:letter==1?11245:letter==2?23213:29847;int ry=5-row;return float((g>>((4-ry)*3+(2-cx)))&1);}
void main(){
  /* this instance's paint and lamps */
  uPaint=vPaint.rgb;uMetal=vPaint.a;uPaintR=vPaint2.x;uFlake=vPaint2.y;uDisc=vPaint2.z;uRoof=vRoof.rgb;uLamps=vLamps;uHcg=uMisc.x;
  {float pk=vRoof.w;uCaliper=vec3(floor(pk/65536.),mod(floor(pk/256.),256.),mod(pk,256.))/255.;
   int f=int(vLamps.w+.5);revL=float(f&1);indL=float((f>>1)&1);indR=float((f>>2)&1);}
  /* a ghost: every other pixel (TAA blends it into a see-through car) and a cold glow */
  float ghost=vPaint2.w;
#ifdef GLASS
  if(ghost>.5)discard;
#else
  /* fainter up close, so it never hides your own car */
  if(ghost>.5&&ign(gl_FragCoord.xy,uFrame)>clamp((length(uCam-vP)-3.)/14.,.1,.45))discard;
#endif
  vec3 N=normalize(vN);if(!gl_FrontFacing)N=-N;vec3 NL=normalize(vNL);
  vec3 V=normalize(uCam-vP);uint id=vMat.x;float yg=vL.y+uHcg;
  M m;m.alb=vec3(.5);m.metal=0.;m.rough=.5;m.clear=0.;m.clearR=.05;m.em=vec3(0);m.flake=0.;m.g=vec2(0);m.spec=1.0;
  float alpha=1.0;
  if(id==0u){
    /* the wheel arches are cut out of the body */
    float ax=vL.x>0.0?vL.x-uArch.x:vL.x-uArch.y;if(length(vec2(ax,vL.y-uArch.w))<uArch.z&&abs(vL.z)>uDims.z-.37)discard;
    /* the body shell is closed at the beltline; under the greenhouse it opens into the cabin */
    if(vL.x<uCab.x&&vL.x>uCab.y&&abs(vL.z)<uCab.z&&NL.y>.3&&yg>uCab.w)discard;
    paint(m,vL,NL,yg,V);}
  else if(id==1u){
    float u=vUV.x,x=vL.x;bool top;float glass,frit;ghClass(u,x,top,glass,frit);
    float ag=glass*(1.0-frit);
#ifdef GLASS
    if(ag<.02)discard;
    m.alb=vec3(0);m.metal=0.;m.rough=.02;
#else
    if(ag>.98)discard;
    float aEdge=uGHa.x+uGHa.y*min(u,uGHb.x);
    if(frit>0.0&&glass>0.0){m.alb=vec3(.008);m.rough=.25;m.clear=.0;}
    else if(top&&x<=uGHw.x&&x>=uGHw.z){m.alb=uRoof;m.metal=uMetal;m.rough=uPaintR;m.clear=1.0;m.clearR=.035;m.flake=uFlake;}
    else if(u<.03){m.alb=vec3(.015);m.rough=.2;m.clear=1.0;m.clearR=.02;}
    else if(x>=aEdge&&!top){m.alb=vec3(.012);m.rough=.15;m.clear=1.0;m.clearR=.02;}
    else{m.alb=uPaint;m.metal=uMetal;m.rough=uPaintR;m.clear=1.0;m.clearR=.035;m.flake=uFlake;}
#endif
  }
  else if(id==2u){m.alb=vec3(.018);m.rough=float(vMat.y)/255.;m.clear=.3;}
  else if(id==3u){m.alb=vec3(.9);m.metal=1.;m.rough=.08;}
  else if(id==4u){/* tyre: tread blocks on the crown, lettering on the outer wall */
    float v=vUV.y,a=vUV.x;m.alb=vec3(.022);m.rough=.82;
    float tread=step(.32,v)*step(v,.68);
    if(tread>0.0){float gr=aa(abs(fract(v*7.)-.5),.06);float sl=aa(abs(fract(a*90.+v*3.)-.5),.06)*step(abs(v-.5),.12);m.alb*=1.0-.6*max(gr,sl);m.rough=mix(.75,.95,gr);}
    if(v>.8&&v<.92){float ch=step(.55,h12(floor(vec2(a*260.,(v-.8)*40.))))*step(.25,fract(a*26.))*step(fract(a*2.),.4);m.alb+=vec3(.08)*ch;}
    m.rough=mix(m.rough,.35,uWet*.8);m.alb*=1.0-.3*uWet;
  }
  else if(id==5u){uint k=vMat.y;
    if(k==0u){m.alb=vec3(.07,.072,.08);m.metal=1.;m.rough=.32;m.clear=.6;m.clearR=.05;}
    else if(k==1u){m.alb=vec3(.03);m.metal=.6;m.rough=.5;}
    else if(k==2u){m.alb=vec3(.85);m.metal=1.;m.rough=.18;}
    else if(k==3u){m.alb=vec3(.05);m.rough=.3;float r=length(vL.xy);m.em+=uPaint*aa(abs(r-.017),.002)*.5;}
    else if(k==4u){/* a plastic wheel cover: silver, eight vents, a badge */
      float a=vUV.x,r=vUV.y;m.alb=vec3(.5);m.metal=.85;m.rough=.3;m.clear=.4;
      float vent=aa(abs(fract(a*8.)-.5)-.17,0.)*step(.5,r)*step(r,.82);m.alb*=1.0-vent*.95;
      m.alb*=1.0-aa(abs(r-.88),.012)*.5;m.alb=mix(m.alb,vec3(.03),aa(r-.12,0.));}
    else if(k==5u){/* far away: five dark spokes over the barrel */
      float a=vUV.x,r=vUV.y;m.alb=vec3(.08);m.metal=1.;m.rough=.35;
      float hole=aa(abs(fract(a*5.)-.5)-.28,0.)*step(.3,r)*step(r,.9);m.alb=mix(m.alb,vec3(.006),hole);m.metal*=1.0-hole;}
    else{m.alb=vec3(.56,.57,.6);m.metal=1.;m.rough=.24;m.clear=.5;m.clearR=.04;}
  }
  else if(id==6u){float r=vUV.y,a=vUV.x;m.alb=vec3(.28,.27,.26);m.metal=1.;m.rough=.38;
    float holes=aa(length(vec2(fract(a*14.)-.5,(r-.14)*28.)),.17)*step(.11,r)*step(r,.17);m.alb*=1.0-holes*.95;
    float grooves=aa(abs(fract(a*6.+r*9.)-.5),.03)*.4;m.alb*=1.0-grooves;
    m.em+=heat(uDisc)*(1.0-holes);}
  else if(id==7u){m.alb=uCaliper;m.rough=.3;m.clear=.8;m.clearR=.06;}
  else if(id==8u){m.alb=vec3(float(vMat.y)/255.*.12);m.rough=.85;}
  else if(id==14u){bool tp;float gl,fr;ghClass(vUV.x,vL.x,tp,gl,fr);if(gl*(1.0-fr)>.5)discard;m.alb=vec3(.035);m.rough=.9;}
  else if(id==9u){m.alb=vec3(.01);m.rough=.2;
    if(vMat.y==0u){/* two dials: tachometer and speed */
      vec2 q=vec2((vL.z+.38)/.075,(yg-.905)/.07);vec2 d1=q-vec2(-1.05,0.),d2=q-vec2(1.05,0.);
      float r1=length(d1),r2=length(d2);float ring=aa(abs(r1-.85),.05)+aa(abs(r2-.85),.05);
      float ticks=(aa(abs(fract(atan(d1.y,d1.x)*1.59)-.5),.08)*step(.62,r1)*step(r1,.8))+(aa(abs(fract(atan(d2.y,d2.x)*1.59)-.5),.08)*step(.62,r2)*step(r2,.8));
      m.em+=vec3(.25,.85,1.)*(ring*.9+ticks*.7)*.9;m.em+=vec3(1.,.25,.1)*aa(abs(r1-.85),.05)*step(1.2,atan(d1.y,-d1.x)+1.6)*.8;}
    else m.em+=vec3(.15,.3,.7)*.6;}
  else if(id==10u){float t=saturate(uDims.y+.12-vL.x)*6.;m.alb=mix(vec3(.85,.85,.88),vec3(.5,.35,.6),saturate(t*.7));m.metal=1.;m.rough=.12;}
  else if(id==11u){m.alb=vec3(.012);m.rough=.8;}
  else if(id==12u){m.alb=vec3(.01);m.rough=.9;}
  else if(id==13u){m.alb=vec3(.9);m.metal=1.;m.rough=.01;}
  else if(id==15u){/* the taxi sign: lit letters on a warm panel, both ways */
    m.alb=vec3(.85,.7,.25);m.rough=.35;
    vec2 uv=vec2(NL.x>0.0?(.27-vL.z)/.54:(vL.z+.27)/.54,(yg-uMisc.z)/.11);
    float t=abs(NL.x)>.5?taxiText(uv):0.0;
    m.em+=mix(vec3(1.,.72,.25)*1.2,vec3(1.,.9,.6)*14.,t)*(.15+.85*step(.01,uLamps.y+uNight));m.alb*=1.0-t*.6;}
  /* ---------- light it ---------- */
  Surf s;s.P=vP;s.V=V;s.N=N;s.Nc=N;s.ao=1.0;s.spec=1.0;s.trans=0.0;
  vec3 flakeN=N;
  if(m.flake>0.0){float fp=length(fwidth(vL))*900.;vec3 c=floor(vL*700.);vec3 r=vec3(h13(c),h13(c+17.1),h13(c+31.7))-.5;flakeN=normalize(N+r*.45*m.flake*saturate(1.0-fp));}
  s.N=flakeN;
  s.diff=m.alb*(1.0-m.metal);s.F0=mix(vec3(.04),m.alb,m.metal);s.rough=m.rough;s.clear=m.clear;s.clearR=m.clearR;
  float NoV=max(dot(N,V),1e-3);
  vec3 col=m.em;
#ifdef GLASS
  /* glass: reflections on top, the cabin seen through a tint */
  float F=F_Sch(vec3(.04),NoV).x;
  vec3 R=reflect(-V,N);vec3 refl=env(R,.02);
  Surf sg=s;sg.diff=vec3(0);sg.F0=vec3(.04);sg.rough=.04;sg.clear=0.0;
  col+=directAll(sg,gl_FragCoord.xy,length(uCam-vP))+refl*F;
  float tr=vL.x>uGHw.x&&vUV.x>uGHb.x?.78:.42;
  alpha=1.0-(1.0-F)*tr;
  oCol=vec4(col,alpha);
#else
  /* inside the cabin the roof and doors block most light; no light here casts shadows, so shade it down */
  bool inside=id==8u||id==9u||id==14u;float cab=inside?.22:1.0;
  col+=directAll(s,gl_FragCoord.xy,length(uCam-vP))*cab;
  /* ambient from the probe: what surrounds the car, blurred */
  vec3 amb=textureLod(uProbe,N,uProbeLod).rgb;
  float occ=(1.0-.55*saturate(-N.y)-.25*saturate(1.0-(yg-.15)*3.))*(inside?.15:1.0);
  col+=s.diff*amb*occ;
  /* reflections: the base layer, then the clear coat over it */
  vec3 Rb=reflect(-V,flakeN);vec3 eb=envBRDF(s.F0,NoV,s.rough);
  vec3 base=env(Rb,s.rough)*eb*occ;
  if(s.clear>0.0){float Fc=F_Sch(vec3(.04),NoV).x*s.clear;vec3 Rc=reflect(-V,N);col=col*(1.0-Fc)+base*(1.0-Fc)+env(Rc,s.clearR)*Fc;}
  else col+=base;
  if(ghost>.5){float rim=pow(1.0-NoV,2.5);col=col*.25+vec3(.25,.8,1.)*(.18+1.6*rim)*(.75+.25*sin(vP.y*48.-uTime*5.));}
  oCol=vec4(col,1.0);
  oNrm=vec4(octEnc(N),s.rough,0.0);
  oVel=(vCur.xy/vCur.w-vPrev.xy/vPrev.w)*.5;
#endif
}`;
