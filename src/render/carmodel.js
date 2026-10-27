/* =====================================================================================
   CAR MODEL — bodies built from cross-sections (designs.js says what each one looks like).
   The lower body is a loft through stations along the car, each a smoothed profile from the
   rocker to the centre line; the greenhouse is a second loft from the beltline to the roof,
   drawn twice (once as paint and pillars, once as glass) with the split decided per pixel.
   Wheel arches are cut by the shader; lamps, grille, panel gaps and badges are painted on by
   the shader too, so the outline can be changed here without touching any of that.
   lod 0 is the full car; lod 1 is the same shape with far fewer triangles and a bare cabin,
   for cars that are more than a few car lengths away.
   Body coordinates: x forward, y up, z right, origin at the centre of mass.
   Car materials: 0 paint  1 greenhouse  2 black trim  3 chrome  4 tyre  5 rim  6 disc
                  7 caliper  8 interior  9 dash  10 exhaust  11 under  12 liner  13 mirror glass
                  14 headliner  15 roof sign
   ===================================================================================== */
import {MeshBuilder,cross,norm,sub} from './mesh.js';
import {DESIGNS} from './designs.js';
export const SL3_BODY=DESIGNS.sl3;

/* Catmull-Rom through a list of numbers, at parameter t in [0, n-1] */
function cr(a,t){const n=a.length,i=Math.max(0,Math.min(n-2,Math.floor(t))),f=t-i;
  const p0=a[Math.max(0,i-1)],p1=a[i],p2=a[i+1],p3=a[Math.min(n-1,i+2)];
  return .5*((2*p1)+(-p0+p2)*f+(2*p0-5*p1+4*p2-p3)*f*f+(-p0+3*p1-3*p2+p3)*f*f*f);}
/* smooth a 2D polyline by Catmull-Rom subdivision */
function smooth2(P,sub){if(sub<=1)return P.map(p=>p.slice());const out=[];for(let i=0;i<P.length-1;i++)for(let k=0;k<sub;k++){const t=i+k/sub;out.push([cr(P.map(p=>p[0]),t),cr(P.map(p=>p[1]),t)]);}out.push(P[P.length-1].slice());return out;}
/* linear interpolation in a table of [x, ...] rows sorted either way */
function tableAt(T,x,j){for(let i=0;i<T.length-1;i++){const a=T[i],b=T[i+1],lo=Math.min(a[0],b[0]),hi=Math.max(a[0],b[0]);
    if(x>=lo&&x<=hi){const f=(x-a[0])/((b[0]-a[0])||1);return a[j]+(b[j]-a[j])*f;}}
  return Math.abs(x-T[0][0])<Math.abs(x-T[T.length-1][0])?T[0][j]:T[T.length-1][j];}

export function buildCar(ch,design=DESIGNS.sl3,{lod=0}={}){
  const D=design,hcg=ch.hcg,Y=y=>y-hcg,hi=lod===0;
  const st=D.st,ns=st.length,xF=st[ns-1][0],xR=st[0][0],hw=Math.max(...st.map(s=>s[2]));
  const B=new MeshBuilder(hi?8192:2048);   /* paint, trims, interior */
  const GH=new MeshBuilder(hi?4096:1024);  /* the greenhouse (paint pass + glass pass) */
  const SUBX=hi?4:1,SUBP=hi?3:1,SUBG=hi?4:2;
  const sx=[];for(let i=0;i<ns-1;i++)for(let k=0;k<SUBX;k++)sx.push(i+k/SUBX);sx.push(ns-1);
  const prm=(t,j)=>cr(st.map(s=>s[j]),t);
  const profile=(t)=>{const yb=prm(t,1),w=prm(t,2),ym=prm(t,3),yt=prm(t,4),c=prm(t,5);
    const P=[[0,yb],[w*.8,yb],[w*.95,yb+.05],[w*.995,yb+(ym-yb)*.55],[w,ym],[w*.985,ym+(yt-ym)*.55],[w*.93,yt-.015],[w*.8,yt+c*.4],[w*.45,yt+c*.9],[0,yt+c]];
    return smooth2(P,SUBP);};
  /* ---- lower body loft ---- */
  B.mat(0);const rows=[];
  for(const t of sx){const x=prm(t,0),pr=profile(t);const half=pr.map(([z,y])=>[x,Y(y),z]);
    const full=[...half.slice(1).reverse().map(p=>[p[0],p[1],-p[2]]),...half];rows.push(full);}
  const nr=rows.length,np=rows[0].length;
  const idx=[];
  for(let i=0;i<nr;i++){const r=[];for(let j=0;j<np;j++){
      const a=rows[Math.min(nr-1,i+1)][j],b=rows[Math.max(0,i-1)][j],c=rows[i][Math.min(np-1,j+1)],d=rows[i][Math.max(0,j-1)];
      let n=cross(sub(a,b),sub(c,d));
      if(j===0||j===np-1)n=[n[0],n[1],0];/* the seam at the top centre */
      const p=rows[i][j];r.push(B.v(p,n,j/(np-1),p[0]));}idx.push(r);}
  /* wind so the outside faces out: rows go rear to front, columns go left-bottom ... right-bottom over the top */
  for(let i=0;i<nr-1;i++)for(let j=0;j<np-1;j++)B.quad(idx[i][j],idx[i+1][j],idx[i+1][j+1],idx[i][j+1]);
  /* end caps: nose and tail */
  for(const [i,dir] of [[0,-1],[nr-1,1]]){const r=rows[i],c=[r[0][0]+dir*.004,(r[0][1]+r[(np-1)>>1][1])/2,0];
    const ci=B.v(c,[dir,0,0],.5,c[0]);const ring=r.map(p=>B.v(p,[dir,0,0],.5,p[0]));
    for(let j=0;j<np-1;j++){if(dir>0)B.tri(ci,ring[j+1],ring[j]);else B.tri(ci,ring[j],ring[j+1]);}}
  /* ---- greenhouse loft ---- */
  const gh=D.gh,ng=gh.length,gsx=[];for(let i=0;i<ng-1;i++)for(let k=0;k<SUBG;k++)gsx.push(i+k/SUBG);gsx.push(ng-1);
  const bodyAt=x=>{let lo=0;for(let i=0;i<ns-1;i++)if(st[i][0]<=x)lo=i;const f=(x-st[lo][0])/Math.max(1e-6,st[lo+1][0]-st[lo][0]);return lo+Math.max(0,Math.min(1,f));};
  const grows=[];const gU=[];
  for(const t of gsx){const x=cr(gh.map(g=>g[0]),t),yr=cr(gh.map(g=>g[1]),t),wr=cr(gh.map(g=>g[2]),t);
    const bt=bodyAt(x),yb=prm(bt,4),wb=prm(bt,2)*.905;
    const P=[[wb,yb-.004],[(wb+wr)*.5+.012,yb+(yr-yb)*.48],[wr+.012,yr-.06],[wr*.86,yr-.012],[wr*.45,yr],[0,yr+.004]];
    const sm=smooth2(P,SUBG);const u=sm.map((_,k)=>k/(sm.length-1));
    const half=sm.map(([z,y])=>[x,Y(y),z]);grows.push([...half.map(p=>[p[0],p[1],-p[2]]),...half.slice(0,-1).reverse()]);
    gU.push([...u,...u.slice(0,-1).reverse()]);}
  const gr=grows.length,gp=grows[0].length,gidx=[];
  for(let i=0;i<gr;i++){const r=[];for(let j=0;j<gp;j++){
      const a=grows[Math.min(gr-1,i+1)][j],b=grows[Math.max(0,i-1)][j],c=grows[i][Math.min(gp-1,j+1)],d=grows[i][Math.max(0,j-1)];
      const p=grows[i][j];GH.mat(1);r.push(GH.v(p,cross(sub(a,b),sub(c,d)),gU[i][j],p[0]));}gidx.push(r);}
  /* the greenhouse stations run front to back, so wind the other way */
  for(let i=0;i<gr-1;i++)for(let j=0;j<gp-1;j++)GH.quad(gidx[i][j],gidx[i+1][j],gidx[i+1][j+1],gidx[i][j+1]);
  /* headliner: the same surface 2 cm inside, facing in */
  {const li=[];for(let i=0;i<gr;i++){const r=[];for(let j=0;j<gp;j++){const p=grows[i][j];const q=[p[0],p[1]-.025,p[2]*.975];B.mat(14,40);r.push(B.v(q,[0,-1,-p[2]],gU[i][j],p[0]));}li.push(r);}
    for(let i=0;i<gr-1;i++)for(let j=0;j<gp-1;j++)B.quad(li[i][j],li[i][j+1],li[i+1][j+1],li[i+1][j]);}
  /* ---- the cabin tub (so you can't see the road through the glass) ---- */
  const C=D.cab,[tx0,tx1,ty0,ty1,tz]=C.tub,dy=C.dy||0;
  B.mat(8,60);
  {const P=(x,y,z)=>[x,Y(y),z],x0=tx0,x1=tx1,y0=ty0,y1=ty1,z0=-tz,z1=tz;
    B.quadP(P(x0,y0,z0),P(x0,y0,z1),P(x1,y0,z1),P(x1,y0,z0),undefined,[0,1,0]);           /* floor */
    B.quadP(P(x1,y0,z0),P(x1,y0,z1),P(x1,y1,z1),P(x1,y1,z0),undefined,[-1,0,0]);          /* firewall */
    B.quadP(P(x0,y0,z1),P(x0,y0,z0),P(x0,y1,z0),P(x0,y1,z1),undefined,[1,0,0]);           /* rear bulkhead */
    B.quadP(P(x0,y0,z0),P(x1,y0,z0),P(x1,y1,z0),P(x0,y1,z0),undefined,[0,0,1]);           /* left door card */
    B.quadP(P(x1,y0,z1),P(x0,y0,z1),P(x0,y1,z1),P(x1,y1,z1),undefined,[0,0,-1]);}         /* right door card */
  /* seats */
  const seat=(x,z,w=.27)=>{B.mat(8,90);B.box([x,Y(.36+dy),z],[1,0,0],[0,1,0],[0,0,1],[.26,.07,w]);
    const bk=[x-.27,Y(.68+dy),z],ax=norm([.25,-1,0]),ay=norm([1,.25,0]);B.box(bk,ay,[0,0,1],ax,[.33,w,.06]);
    if(hi){B.box([x-.33,Y(1.06+dy),z],[1,0,0],[0,1,0],[0,0,1],[.05,.08,w*.55]);
      B.mat(8,30);B.box([x+.02,Y(.42+dy),z+w*.92],[1,0,0],[0,1,0],[0,0,1],[.25,.05,.03]);B.box([x+.02,Y(.42+dy),z-w*.92],[1,0,0],[0,1,0],[0,0,1],[.25,.05,.03]);}};
  seat(C.seat,-.38);seat(C.seat,.38);
  if(C.rear!=null){B.mat(8,70);B.box([C.rear,Y(.38+dy*.6),0],[1,0,0],[0,1,0],[0,0,1],[.25,.08,.62]);B.box([C.rear-.24,Y(.62+dy*.6),0],norm([1,.35,0]),norm([-.35,1,0]),[0,0,1],[.06,.25,.62]);}
  /* dashboard, gauges, console, steering wheel */
  const dx=C.dash,ddy=dy*1.2;
  B.mat(8,40);B.box([dx,Y(.78+ddy),0],[1,0,0],[0,1,0],[0,0,1],[.2,.08,tz-.04]);
  B.box([dx-.12,Y(.70+ddy),0],[1,0,0],[0,1,0],[0,0,1],[.12,.05,tz-.04]);
  if(hi){
    /* the instrument binnacle: a hood over two dials, facing the driver */
    B.mat(8,30);B.box([dx-.12,Y(.93+ddy),-.38],norm([1,.15,0]),norm([-.15,1,0]),[0,0,1],[.09,.012,.2]);
    B.mat(9,C.dials?0:1);B.quadP([dx-.185,Y(.84+ddy),-.56],[dx-.185,Y(.84+ddy),-.20],[dx-.175,Y(.97+ddy),-.20],[dx-.175,Y(.97+ddy),-.56],undefined,[-1,.08,0]);
    B.mat(9,1);B.box([dx-.09,Y(.77+ddy),0],norm([.6,1,0]),norm([-1,.6,0]),[0,0,1],[.07,.01,.12]);
    B.mat(8,50);B.box([C.seat+.23,Y(.45+dy),0],[1,0,0],[0,1,0],[0,0,1],[.42,.11,.11]);
    B.mat(2,60);{const [wx,wy,wz]=C.wheel,c=[wx,Y(wy),wz],ax=norm([1,C.tilt||.55,0]);const u=[0,0,1],w=norm(cross(ax,u));const n=20;
      for(let k=0;k<n;k++){const a0=k/n*Math.PI*2,a1=(k+1)/n*Math.PI*2,p=a=>[c[0]+(u[0]*Math.cos(a)+w[0]*Math.sin(a))*.18,c[1]+(u[1]*Math.cos(a)+w[1]*Math.sin(a))*.18,c[2]+(u[2]*Math.cos(a)+w[2]*Math.sin(a))*.18];
        B.tube(p(a0),p(a1),.017,5,false);}
      B.tube(c,[c[0]+.28,c[1]-.12,c[2]],.025,5,false);B.tube([c[0]-.01,c[1],c[2]-.17],[c[0]-.01,c[1],c[2]+.17],.012,4,false);}
  }
  /* ---- mirrors ---- */
  const big=D.sh.van?1.35:1;
  for(const s of [-1,1]){const [mx,my,mz]=D.mirror;const c=[mx,Y(my),mz*s];
    B.mat(0);B.box(c,[1,0,0],[0,1,0],[0,0,1],[.065,.048*big,.085]);
    B.mat(13);const zz=[c[2]-.072,c[2]+.072];B.quadP([c[0]-.067,c[1]-.04*big,zz[0]],[c[0]-.067,c[1]-.04*big,zz[1]],[c[0]-.067,c[1]+.04*big,zz[1]],[c[0]-.067,c[1]+.04*big,zz[0]],undefined,[-1,0,0]);
    B.mat(2,60);B.tube([c[0]+.01,c[1]-.02,c[2]-.07*s],[c[0]+.06,c[1]-.07,c[2]-.13*s],.014,hi?5:3,false);}
  /* ---- exhaust tips ---- */
  for(const [ex,ey,ez,er] of D.exhaust){const c=[ex,Y(ey),ez];B.mat(10);B.tube([c[0]+.12,c[1],c[2]],[c[0]-.07,c[1],c[2]],er,hi?12:6,false);
    B.mat(11);B.tube([c[0]-.04,c[1],c[2]],[c[0]-.065,c[1],c[2]],er*.88,hi?10:5,true);}
  /* ---- wheel liners inside the arches ---- */
  for(const ax of [D.axF,D.axR])for(const s of [-1,1]){
    const r=D.archR-.005,z0=s*(ch.trackF/2-.21),z1=s*(hw+.03),cx=ax,cy=Y(D.R);B.mat(12);const n=hi?16:6,pts=[];
    for(let k=0;k<=n;k++){const a=Math.PI*(k/n);pts.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]);}
    for(let k=0;k<n;k++){const [x0,y0]=pts[k],[x1,y1]=pts[k+1];const nn=[-(x0+x1)/2+cx,-(y0+y1)/2+cy,0];
      const a=B.v([x0,y0,z0],nn),b=B.v([x1,y1,z0],nn),c=B.v([x1,y1,z1],nn),d=B.v([x0,y0,z1],nn);if(s>0)B.quad(a,d,c,b);else B.quad(a,b,c,d);}
    for(let k=0;k<n;k++){const [x0,y0]=pts[k],[x1,y1]=pts[k+1];const a=B.v([x0,y0,z0],[0,0,s]),b=B.v([x1,y1,z0],[0,0,s]),c=B.v([cx,cy,z0],[0,0,s]);if(s>0)B.tri(a,b,c);else B.tri(a,c,b);}}
  /* ---- underbody tray ---- */
  {const yb=Math.min(...st.map(s=>s[1]))+.02;B.mat(11);B.quadP([xR+.2,Y(yb),hw-.1],[xR+.2,Y(yb),-(hw-.1)],[xF-.25,Y(yb+.02),-(hw-.12)],[xF-.25,Y(yb+.02),hw-.12],undefined,[0,-1,0]);}
  /* ---- aero: a ducktail lip, or a splitter and a GT wing ---- */
  if(D.lip||D.wing){const xe=xR+.12,yt=tableAt(st,xe,4);
    if(D.lip){B.mat(0);B.box([xe,Y(yt+.025),0],norm([1,.35,0]),norm([-.35,1,0]),[0,0,1],[.09,.02,hw*.72]);}
    if(D.wing){const yw=yt+.27,c=[xR+.24,Y(yw),0],ax=norm([1,-.12,0]),ay=norm([.12,1,0]);
      B.mat(2,50);B.box(c,ax,ay,[0,0,1],[.17,.012,hw*.86]);                                   /* the blade */
      for(const zz of [-1,1]){B.box([c[0],c[1]+.03,zz*hw*.86],[1,0,0],[0,1,0],[0,0,1],[.2,.09,.006]);  /* end plates */
        B.box([c[0]+.04,Y((yt+yw)/2),zz*.5],norm([1,.15,0]),norm([-.15,1,0]),[0,0,1],[.035,(yw-yt)/2,.012]);}   /* uprights */
      const xf=xF-.06;B.mat(2,50);B.box([xf,Y(.165),0],[1,0,0],[0,1,0],[0,0,1],[.12,.008,hw*.8]);}}  /* the splitter */
  /* ---- taxi roof sign ---- */
  if(D.roofSign){const x=-.55,yr=tableAt(D.gh,x,1);B.mat(2,40);B.box([x,Y(yr+.015),0],[1,0,0],[0,1,0],[0,0,1],[.12,.015,.34]);
    B.mat(15);B.box([x,Y(yr+.085),0],[1,0,0],[0,1,0],[0,0,1],[.09,.055,.30]);}
  return {body:B,glass:GH,wheel:buildWheel(D.R,{style:D.rim,tw:D.tyreW,rimR:D.rimR,lod}),caliper:hi?buildCaliper(D.rimR||.2413):null,driver:buildDriver(D,hcg,lod),
    dims:{xF,xR,hw,H:Math.max(...D.gh.map(g=>g[1]))}};
}

/* someone at the wheel: a silhouette is all a passing glance needs */
export function buildDriver(D,hcg,lod=0){const B=new MeshBuilder(512),Y=y=>y-hcg,C=D.cab,dy=C.dy||0,z=-.38,x=C.seat,hi=lod===0;
  B.mat(8,45);
  const tb=[x-.17,Y(.72+dy),z],up=norm([-.28,1,0]),fw=norm([1,.28,0]);B.box(tb,fw,up,[0,0,1],[.11,.26,.19]);   /* torso, leaning back */
  B.mat(8,60);B.box([x+.12,Y(.50+dy),z-.1],[1,0,0],[0,1,0],[0,0,1],[.22,.07,.08]);B.box([x+.12,Y(.50+dy),z+.1],[1,0,0],[0,1,0],[0,0,1],[.22,.07,.08]);
  B.mat(8,110);B.sphere([x-.24,Y(1.10+dy),z],.105,hi?10:6,hi?7:4);B.tube([x-.22,Y(.98+dy),z],[x-.23,Y(1.03+dy),z],.05,hi?6:4,false); /* head, neck */
  B.mat(8,45);const [wx,wy]=C.wheel;
  for(const s of [-1,1]){const sh=[x-.14,Y(.94+dy),z+s*.19],el=[(x+wx)/2-.02,Y((.94+dy+wy)/2-.12),z+s*.22],hd=[wx+.02,Y(wy+.05),z+s*.15];
    B.tube(sh,el,.045,hi?6:4,false);B.tube(el,hd,.04,hi?6:4,true);}
  return B;}

/* a wheel: tyre, rim, disc. Axle along +z (the outside); centre at the origin.
   style: 'ten' ten-spoke alloy, 'five' five-spoke alloy, 'cap' a steel wheel under a cover */
export function buildWheel(R=.335,{style='ten',tw=.245,rimR=.2413,lod=0}={}){
  const hi=lod===0,W=new MeshBuilder(hi?8192:1024),n=hi?40:16;
  /* tyre: lathe a profile of (radius, z) */
  const prof=[[rimR+.005,-tw*.46],[rimR+.035,-tw*.53],[R-.045,-tw*.52],[R-.012,-tw*.47],[R,-tw*.38],[R+.002,0],[R,tw*.38],[R-.012,tw*.47],[R-.045,tw*.52],[rimR+.035,tw*.53],[rimR+.005,tw*.46]];
  const sp=hi?smooth2(prof,3):prof;
  W.mat(4);lathe(W,sp,n,(k,j)=>[k/n,j/(sp.length-1)]);
  /* rim barrel and lip */
  W.mat(5,1);lathe(W,[[rimR-.004,tw*.47],[rimR-.012,tw*.42],[rimR-.012,-tw*.42],[rimR-.004,-tw*.47]],n,(k,j)=>[k/n,j]);
  W.mat(5,2);lathe(W,[[rimR+.004,tw*.47],[rimR-.018,tw*.47],[rimR-.022,tw*.43]],n,(k,j)=>[k/n,j]);
  const zf=tw*.40,zh=tw*.47;
  if(!hi||style==='cap'){
    /* a dished disc across the rim: the cover (or, far away, any wheel) */
    W.mat(5,hi?4:(style==='cap'?4:5));const ring=[[0,zh+.006],[rimR*.3,zh+.004],[rimR*.75,zh-.006],[rimR-.012,zh-.012]];
    const ix=[];for(let k=0;k<=n;k++){const a=k/n*Math.PI*2,c=Math.cos(a),s=Math.sin(a),row=[];
      for(const [r,z] of ring)row.push(W.v([c*r,s*r,z],[c*.12,s*.12,1],k/n,r/rimR));ix.push(row);}
    for(let k=0;k<n;k++)for(let j=0;j<ring.length-1;j++)W.quad(ix[k][j],ix[k][j+1],ix[k+1][j+1],ix[k+1][j]);
  }else{
    /* the face: spokes from the hub to the lip, dished inward */
    const NS=style==='five'?5:10,k5=style==='five';W.mat(5,k5?6:0);
    for(let s=0;s<NS;s++){const a=s/NS*Math.PI*2;const t=[Math.cos(a),Math.sin(a),0],sd=[-Math.sin(a),Math.cos(a),0];
      const P=(r,o,z)=>[t[0]*r+sd[0]*o,t[1]*r+sd[1]*o,z];
      const r0=.065,r1=rimR-.02,w0=k5?.04:.021,w1=k5?.032:.016,zz0=zh,zz1=zf;
      W.quadP(P(r0,-w0,zz0),P(r1,-w1,zz1),P(r1,w1,zz1),P(r0,w0,zz0),undefined,undefined);
      W.quadP(P(r0,w0,zz0),P(r1,w1,zz1),P(r1,w1,zz1-.035),P(r0,w0,zz0-.035));
      W.quadP(P(r1,-w1,zz1),P(r0,-w0,zz0),P(r0,-w0,zz0-.035),P(r1,-w1,zz1-.035));}
  }
  if(hi){
    /* hub and centre cap, lug nuts */
    W.mat(5,style==='five'?6:0);{const hub=[];for(let k=0;k<=n;k++){const a=k/n*Math.PI*2;hub.push([Math.cos(a),Math.sin(a)]);}
      for(let k=0;k<n;k++){const [c0,s0]=hub[k],[c1,s1]=hub[k+1];const a=W.v([c0*.07,s0*.07,zh],[0,0,1]),b=W.v([c1*.07,s1*.07,zh],[0,0,1]),c=W.v([0,0,zh+.008],[0,0,1]);W.tri(a,b,c);
        const d=W.v([c0*.07,s0*.07,zh],[c0,s0,0]),e=W.v([c1*.07,s1*.07,zh],[c1,s1,0]),f=W.v([c1*.07,s1*.07,zh-.04],[c1,s1,0]),g=W.v([c0*.07,s0*.07,zh-.04],[c0,s0,0]);W.quad(d,g,f,e);}}
    if(style!=='cap'){W.mat(3);for(let k=0;k<5;k++){const a=k/5*Math.PI*2+.3;W.tube([Math.cos(a)*.048,Math.sin(a)*.048,zh-.005],[Math.cos(a)*.048,Math.sin(a)*.048,zh+.012],.009,6,true);}
      W.mat(5,3);W.tube([0,0,zh+.002],[0,0,zh+.011],.028,16,true);}
    /* brake disc: inside the rim */
    W.mat(6);const zd=-.02,sc=rimR/.2413,ri=.10*sc,ro=.180*sc;
    for(let k=0;k<n;k++){const a0=k/n*Math.PI*2,a1=(k+1)/n*Math.PI*2;
      for(const [z,nz] of [[zd+.014,1],[zd-.014,-1]]){const a=W.v([Math.cos(a0)*ri,Math.sin(a0)*ri,z],[0,0,nz],a0,ri/sc),b=W.v([Math.cos(a1)*ri,Math.sin(a1)*ri,z],[0,0,nz],a1,ri/sc),
        c=W.v([Math.cos(a1)*ro,Math.sin(a1)*ro,z],[0,0,nz],a1,ro/sc),d=W.v([Math.cos(a0)*ro,Math.sin(a0)*ro,z],[0,0,nz],a0,ro/sc);if(nz>0)W.quad(a,d,c,b);else W.quad(a,b,c,d);}
      const e=W.v([Math.cos(a0)*ro,Math.sin(a0)*ro,zd+.014],[Math.cos(a0),Math.sin(a0),0]),f=W.v([Math.cos(a1)*ro,Math.sin(a1)*ro,zd+.014],[Math.cos(a1),Math.sin(a1),0]),
        g=W.v([Math.cos(a1)*ro,Math.sin(a1)*ro,zd-.014],[Math.cos(a1),Math.sin(a1),0]),h=W.v([Math.cos(a0)*ro,Math.sin(a0)*ro,zd-.014],[Math.cos(a0),Math.sin(a0),0]);W.quad(e,h,g,f);}
  }else{
    /* the inner face, so the wheel isn't hollow seen from the other side */
    W.mat(11);const ix=[];const c0=W.v([0,0,-tw*.3],[0,0,-1]);for(let k=0;k<=n;k++){const a=k/n*Math.PI*2;ix.push(W.v([Math.cos(a)*rimR,Math.sin(a)*rimR,-tw*.3],[0,0,-1]));}
    for(let k=0;k<n;k++)W.tri(c0,ix[k+1],ix[k]);
  }
  return W;
}
function lathe(B,prof,n,uvf){const ix=[];for(let k=0;k<=n;k++){const a=k/n*Math.PI*2,c=Math.cos(a),s=Math.sin(a),row=[];
    for(let j=0;j<prof.length;j++){const [r,z]=prof[j];const pa=prof[Math.max(0,j-1)],pb=prof[Math.min(prof.length-1,j+1)];
      const dr=pb[0]-pa[0],dz=pb[1]-pa[1];/* profile tangent (dr, dz) -> normal (dz, -dr) in (radial, z) */
      const nr=dz,nz=-dr;const uv=uvf(k,j);row.push(B.v([c*r,s*r,z],[c*nr,s*nr,nz],uv[0],uv[1]));}ix.push(row);}
  for(let k=0;k<n;k++)for(let j=0;j<prof.length-1;j++)B.quad(ix[k][j],ix[k+1][j],ix[k+1][j+1],ix[k][j+1]);}
/* the caliper doesn't turn with the wheel */
export function buildCaliper(rimR=.2413){const C=new MeshBuilder(256);C.mat(7);
  const a0=.35,a1=1.25,r=.165*rimR/.2413,n=8;
  for(let k=0;k<n;k++){const t0=a0+(a1-a0)*k/n,t1=a0+(a1-a0)*(k+1)/n;
    C.box([-Math.cos((t0+t1)/2)*r,Math.sin((t0+t1)/2)*r,-.02],norm([-Math.sin((t0+t1)/2),-Math.cos((t0+t1)/2),0]),[0,0,1],norm([-Math.cos((t0+t1)/2),Math.sin((t0+t1)/2),0]),[(t1-t0)*r*.55,.032,.03]);}
  return C;}
/* mirror a builder across z (for the wheels on the left side) */
export function mirrorZ(B){const M=new MeshBuilder(B.nv+16);M.append(B);
  for(let i=0;i<M.nv;i++){M.f[i*9+2]*=-1;M.s[i*18+8]*=-1;}
  for(let i=0;i<M.idx.length;i+=3){const t=M.idx[i+1];M.idx[i+1]=M.idx[i+2];M.idx[i+2]=t;}
  M.mn[2]=-B.mx[2];M.mx[2]=-B.mn[2];return M;}
