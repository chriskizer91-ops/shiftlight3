/* =====================================================================================
   THE CITY AROUND NEON LOOP — generated once, the same every time (seeded).
   - the track ribbon: road, curbs, gutters, concrete barriers, sidewalks, catch fences
   - a street grid of blocks; buildings on lots, kept clear of the track
   - a tunnel under a building on the west straight, an elevated railway on 170th Street
   - street lamps, traffic signals, neon signs built from the 5x7 font, rooftop billboards
   - a skyline ring far out
   Returns packed geometry tiles, every light, steam vents, and facts the shaders need.
   Map coordinates are x east, y north; world is X = x, Y = up, Z = -y.
   ===================================================================================== */
import {Chunked,MeshBuilder,rng,cross,norm} from '../render/mesh.js';
import {glyphPixels} from '../ui/font.js';

export const NEON=[[1,.18,.55],[.2,.85,1],[.65,.3,1],[1,.25,.15],[1,.6,.12],[.35,1,.45],[1,.9,.3],[.95,.4,1]];
const WORDS=['NOODLES','HOTEL','BAR','RAMEN','MOTEL','24H','ARCADE','KARAOKE','DINER','TATTOO','LIQUOR','PARTS','GARAGE','OPEN','PIZZA','SUSHI','CLUB','DANCE','CAFE','RECORDS',
  'PAWN','LAUNDRY','PHARMACY','CINEMA','BOWLING','SHIFT','TURBO','NITRO','DRIFT','REDLINE','ROOMS','VACANCY','BEER','COFFEE','DONUTS','CASINO','POOL','JAZZ','VIDEO','TAXI'];
const W=(x,y,h=0)=>[x,h,-y];
/* the GLSL h11, in float32 steps, so steam rises from the manholes the road shader draws */
const f=Math.fround;function h11(p){p=f(p*f(.1031));p=f(p-Math.floor(p));p=f(p*f(p+f(33.33)));p=f(p*f(p+p));return p-Math.floor(p);}

export function buildCity(T){
  const R=rng(20241),C=new Chunked(64),SKY=new Chunked(420),lights=[],steam=[],occupied=[];
  const info={xw:[],tunnel:null,el:null,lamps:0};
  const hw=T.hw,wl=T.wl,wr=T.wr,SW=3.5,BAR=.5,N=T.N,ds=T.ds;
  const addLight=L=>{lights.push(Object.assign({type:0,r:12,col:[1,1,1],dir:[0,-1,0],cosO:-1,cosI:-1,axis:[0,0,0],flick:0,src:.05},L));};
  /* ---------- distances to the track ---------- */
  const trackDist=(x,y)=>{const i=T.nearest(x,y,1);if(i<0)return 99;let best=1e9;
    for(let k=-3;k<=3;k++){const a=T.idx(i+k),b=T.idx(i+k+1),ex=T.mx[b]-T.mx[a],ey=T.my[b]-T.my[a],el=ex*ex+ey*ey||1;
      let t=((x-T.mx[a])*ex+(y-T.my[a])*ey)/el;t=Math.max(0,Math.min(1,t));best=Math.min(best,Math.hypot(T.mx[a]+ex*t-x,T.my[a]+ey*t-y));}
    return best;};
  const rectDist=(x0,y0,x1,y1)=>{let m=1e9;const nx=Math.max(2,Math.ceil((x1-x0)/3)),ny=Math.max(2,Math.ceil((y1-y0)/3));
    for(let i=0;i<=nx;i++)for(let j=0;j<=ny;j++){if(i>0&&i<nx&&j>0&&j<ny&&(i+j)%2)continue;m=Math.min(m,trackDist(x0+(x1-x0)*i/nx,y0+(y1-y0)*j/ny));}return m;};
  const overlaps=(x0,y0,x1,y1)=>occupied.some(o=>x0<o[2]&&x1>o[0]&&y0<o[3]&&y1>o[1]);

  /* ---------- tunnel and railway placement ---------- */
  let t0=-1,t1=-1;
  for(let i=0;i<N;i++){const x=T.mx[i],y=T.my[i];if(Math.abs(x+106)<4&&y>207&&y<273){if(t0<0)t0=i*ds;t1=i*ds;}}
  if(t0>=0){info.tunnel=[t0,t1];occupied.push([-130,203,-82,277]);}
  const inTun=s=>info.tunnel&&s>=info.tunnel[0]-.5&&s<=info.tunnel[1]+.5;
  const EL_X=170;info.el={x:EL_X,y0:-200,y1:540,h:9.2};

  /* ---------- the track ribbon ---------- */
  const flatP=(s,d,h)=>{const th=T.headAt(s),x=T.at(T.mx,s),y=T.at(T.my,s);return [x-Math.sin(th)*d,T.yAt(s)+h,-(y+Math.cos(th)*d)];};
  const q=(B,a,b,c,d,n,uv)=>B.quadP(a,b,c,d,uv,n);
  const at=(p)=>C.at(p[0],p[2]);
  const curbHere=(i,left)=>left?(T.curb[i]&1):(T.curb[i]&2);
  const fenceAt=s=>(s>12&&s<175)||(s>285&&s<395)||(s>735&&s<860);
  for(let i=0;i<N;i++){
    const s0=i*ds,s1=s0+ds,sm=s0+ds*.5,tun=inTun(sm),shel=tun?0:255;
    const fr0=T.frame(s0),fr1=T.frame(s1);const up=fr0.u;
    const cen=T.pos(sm,0);
    /* road in four lanes' worth of strips */
    C.mat(0).col(shel,0,0,255);const B=at(cen);
    for(let k=0;k<4;k++){const d0=-hw+k*hw/2,d1=d0+hw/2;
      q(B,T.pos(s0,d0),T.pos(s1,d0),T.pos(s1,d1),T.pos(s0,d1),up,[[s0,d0],[s1,d0],[s1,d1],[s0,d1]]);}
    /* shoulders: a painted curb on the inside of corners, then the gutter */
    for(const left of [true,false]){
      const sg=left?1:-1,edge=left?wl:wr;let d=hw;
      const strip=(da,db,mat)=>{C.mat(mat).col(shel,0,0,255);const a0=sg*da,a1=sg*db,lo=Math.min(a0,a1),hi=Math.max(a0,a1);
        q(at(cen),T.pos(s0,lo),T.pos(s1,lo),T.pos(s1,hi),T.pos(s0,hi),up,[[s0,lo],[s1,lo],[s1,hi],[s0,hi]]);};
      if(curbHere(i,left)){strip(hw,hw+.9,1);d=hw+.9;}
      strip(d,edge,2);
    }
    if(tun){
      /* tunnel walls: glazed tile up to the ceiling */
      C.mat(4,2).col(0,0,0,255);
      const H=6.0;
      q(at(cen),T.pos(s0,wl),T.pos(s1,wl),T.pos(s1,wl,H),T.pos(s0,wl,H),[-fr0.l[0],0,-fr0.l[2]],[[s0,0],[s1,0],[s1,H],[s0,H]]);
      q(at(cen),T.pos(s1,-wr),T.pos(s0,-wr),T.pos(s0,-wr,H),T.pos(s1,-wr,H),[fr0.l[0],0,fr0.l[2]],[[s1,0],[s0,0],[s0,H],[s1,H]]);
      C.mat(13,200).col(40,40,42,255);
      q(at(cen),T.pos(s0,-wr,H),T.pos(s0,wl,H),T.pos(s1,wl,H),T.pos(s1,-wr,H),[0,-1,0],[[s0,1],[s0,0],[s1,0],[s1,1]]);
      continue;
    }
    /* concrete barrier blocks: vertical face at the physics wall, chamfered top */
    for(const left of [true,false]){
      const sg=left?1:-1,e=left?wl:wr,P=(s,dd,h)=>T.pos(s,sg*(e+dd),h);
      const nIn=left?[-fr0.l[0],0,-fr0.l[2]]:[fr0.l[0],0,fr0.l[2]];
      C.mat(4,1).col(255,0,0,255);const B2=at(P(sm,0,0));
      const prof=[[0,0],[0,.92],[.07,1.0],[BAR-.07,1.0],[BAR,.92],[BAR,-.2]];
      for(let k=0;k<prof.length-1;k++){const [da,ha]=prof[k],[db,hb]=prof[k+1];
        const a0=P(s0,da,ha),a1=P(s1,da,ha),b0=P(s0,db,hb),b1=P(s1,db,hb);
        if(left)q(B2,a0,a1,b1,b0,null,[[s0,ha],[s1,ha],[s1,hb],[s0,hb]]);else q(B2,a1,a0,b0,b1,null,[[s1,ha],[s0,ha],[s0,hb],[s1,hb]]);}
      /* the sidewalk behind, level with the road's centre line, and its kerb face down to the street */
      const dIn=e+BAR,dOut=e+BAR+SW,sh=.12;
      C.mat(3).col(255,0,0,255);const S=(s,dd,h)=>flatP(s,sg*dd,h);
      const p00=S(s0,dIn,sh),p01=S(s0,dOut,sh),p10=S(s1,dIn,sh),p11=S(s1,dOut,sh);
      const uvw=p=>[p[0],p[2]];
      if(left)q(at(p00),p00,p10,p11,p01,[0,1,0],[uvw(p00),uvw(p10),uvw(p11),uvw(p01)]);
      else q(at(p00),p01,p11,p10,p00,[0,1,0],[uvw(p01),uvw(p11),uvw(p10),uvw(p00)]);
      C.mat(4,0).col(255,0,0,255);
      const g0=S(s0,dOut,-.6),g1=S(s1,dOut,-.6);
      if(left)q(at(p01),p01,p11,g1,g0,null,[[s0,.12],[s1,.12],[s1,-.6],[s0,-.6]]);else q(at(p01),p11,p01,g0,g1,null,[[s1,.12],[s0,.12],[s0,-.6],[s1,-.6]]);
      /* catch fences on the fast stretches */
      if(fenceAt(sm)){const fd=e+BAR*.5;const f0=T.pos(s0,sg*fd,1.0),f1=T.pos(s1,sg*fd,1.0),f2=T.pos(s1,sg*fd,4.2),f3=T.pos(s0,sg*fd,4.2);
        C.mat(12).col(255,255,255,255);q(at(f0),f0,f1,f2,f3,null,[[s0,1],[s1,1],[s1,4.2],[s0,4.2]]);q(at(f0),f1,f0,f3,f2,null,[[s1,1],[s0,1],[s0,4.2],[s1,4.2]]);
        if(i%4===0){C.mat(8,120,200).col(70,72,76);at(f0).tube(T.pos(s0,sg*fd,.95),T.pos(s0,sg*fd,4.35),.045,5,true);}
        if(i%2===0){C.mat(8,120,200).col(70,72,76);at(f2).tube(T.pos(s0,sg*fd,4.2),T.pos(s1+1,sg*fd,4.2),.025,4,false);}}
    }
  }
  /* ---------- crosswalks where the grid streets meet the track ---------- */
  const XS=[-300,-230,-170,-106,-40,30,100,170,256,330,400,470],YS=[-210,-140,-64,0,72,144,216,278,340,410,480,550];
  for(let i=0;i<N&&info.xw.length<8;i++){const a=i,b=T.idx(i+1);
    for(const X of XS){if((T.mx[a]-X)*(T.mx[b]-X)<0&&Math.abs(Math.cos(T.TH[a]))>.85){const s=i*ds;if(!inTun(s)&&info.xw.every(v=>Math.abs(v-s)>30))info.xw.push(s);}}
    for(const Y of YS){if((T.my[a]-Y)*(T.my[b]-Y)<0&&Math.abs(Math.sin(T.TH[a]))>.85){const s=i*ds;if(!inTun(s)&&info.xw.every(v=>Math.abs(v-s)>30))info.xw.push(s);}}}

  /* ---------- streets, sidewalk slabs, blocks, buildings ---------- */
  const STREET=5,BLD=8.5;
  /* the ground far below everything */
  SKY.mat(11,1).col(255,0,0,255);
  for(let gx=-1600;gx<1700;gx+=200)for(let gy=-1600;gy<1700;gy+=200){const a=W(gx,gy,-.09),b=W(gx+200,gy,-.09),c=W(gx+200,gy+200,-.09),d=W(gx,gy+200,-.09);
    SKY.at(gx+100,-(gy+100)).quadP(a,b,c,d,[[a[0],a[2]],[b[0],b[2]],[c[0],c[2]],[d[0],d[2]]],[0,1,0]);}
  /* street segments between intersections */
  for(const X of XS)for(let j=0;j<YS.length-1;j++){const y0=YS[j]+STREET,y1=YS[j+1]-STREET;
    for(let y=y0;y<y1;y+=10){const yb=Math.min(y1,y+10);if(trackDist(X,(y+yb)/2)<9.5)continue;
      C.mat(11,0).col(255,0,0,255);const a=W(X-STREET,y,-.05),b=W(X+STREET,y,-.05),c=W(X+STREET,yb,-.05),d=W(X-STREET,yb,-.05);
      C.at(X,-y).quadP(a,b,c,d,[[y,STREET],[y,-STREET],[yb,-STREET],[yb,STREET]],[0,1,0]);}}
  for(const Y of YS)for(let j=0;j<XS.length-1;j++){const x0=XS[j]+STREET,x1=XS[j+1]-STREET;
    for(let x=x0;x<x1;x+=10){const xb=Math.min(x1,x+10);if(trackDist((x+xb)/2,Y)<9.5)continue;
      C.mat(11,0).col(255,0,0,255);const a=W(x,Y-STREET,-.05),b=W(xb,Y-STREET,-.05),c=W(xb,Y+STREET,-.05),d=W(x,Y+STREET,-.05);
      C.at(x,-Y).quadP(a,b,c,d,[[x,-STREET],[xb,-STREET],[xb,STREET],[x,STREET]],[0,1,0]);}}
  for(const X of XS)for(const Y of YS){if(trackDist(X,Y)<9.5)continue;C.mat(11,1).col(255,0,0,255);
    const a=W(X-STREET,Y-STREET,-.05),b=W(X+STREET,Y-STREET,-.05),c=W(X+STREET,Y+STREET,-.05),d=W(X-STREET,Y+STREET,-.05);
    C.at(X,-Y).quadP(a,b,c,d,[[a[0],a[2]],[b[0],b[2]],[c[0],c[2]],[d[0],d[2]]],[0,1,0]);}
  /* slabs: one box per block when it is clear of the track, else 2 m tiles that stop at the track's sidewalks */
  const slabTop=.15;
  const slabBox=(x0,y0,x1,y1,edges)=>{C.mat(3).col(255,0,0,255);const B=C.at((x0+x1)/2,-(y0+y1)/2);
    const a=W(x0,y0,slabTop),b=W(x1,y0,slabTop),c=W(x1,y1,slabTop),d=W(x0,y1,slabTop);B.quadP(a,b,c,d,[[a[0],a[2]],[b[0],b[2]],[c[0],c[2]],[d[0],d[2]]],[0,1,0]);
    if(edges){C.mat(4,0).col(255,0,0,255);const B2=C.at((x0+x1)/2,-(y0+y1)/2);const lo=-.06;
      B2.quadP(W(x0,y0,lo),W(x1,y0,lo),W(x1,y0,slabTop),W(x0,y0,slabTop),[[x0,lo],[x1,lo],[x1,slabTop],[x0,slabTop]],[0,0,1]);
      B2.quadP(W(x1,y1,lo),W(x0,y1,lo),W(x0,y1,slabTop),W(x1,y1,slabTop),[[x1,lo],[x0,lo],[x0,slabTop],[x1,slabTop]],[0,0,-1]);
      B2.quadP(W(x1,y0,lo),W(x1,y1,lo),W(x1,y1,slabTop),W(x1,y0,slabTop),[[y0,lo],[y1,lo],[y1,slabTop],[y0,slabTop]],[1,0,0]);
      B2.quadP(W(x0,y1,lo),W(x0,y0,lo),W(x0,y0,slabTop),W(x0,y1,slabTop),[[y1,lo],[y0,lo],[y0,slabTop],[y1,slabTop]],[-1,0,0]);}};
  const CLEAR=wl+BAR+SW+.3;
  for(let bi=0;bi<XS.length-1;bi++)for(let bj=0;bj<YS.length-1;bj++){
    const x0=XS[bi]+STREET,x1=XS[bi+1]-STREET,y0=YS[bj]+STREET,y1=YS[bj+1]-STREET;
    if(rectDist(x0,y0,x1,y1)>CLEAR+3)slabBox(x0,y0,x1,y1,true);
    else for(let x=x0;x<x1;x+=2)for(let y=y0;y<y1;y+=2){const xb=Math.min(x1,x+2),yb=Math.min(y1,y+2);
      if(trackDist((x+xb)/2,(y+yb)/2)>CLEAR+.8&&!overlaps(x,y,xb,yb))slabBox(x,y,xb,yb,false);}
    /* lots */
    const bx0=XS[bi]+BLD,bx1=XS[bi+1]-BLD,by0=YS[bj]+BLD,by1=YS[bj+1]-BLD;
    const rows=by1-by0>34?2:1;
    const cols=[];let x=bx0;while(x<bx1-6){let w=11+R()*13;if(bx1-(x+w)<9)w=bx1-x;cols.push([x,Math.min(bx1,x+w)]);x+=w;}
    cols.forEach(([cx0,cx1],ci)=>{for(let r=0;r<rows;r++){
      const north=rows===1?true:r===1,south=rows===1?true:r===0;
      const depth=rows===1?by1-by0:Math.min((by1-by0)/2,12+R()*16);
      let ly0=r===0?by0:by1-depth,ly1=r===0?by0+depth:by1;if(rows===1){ly0=by0;ly1=by1;}
      const gap=R()<.3?1.2:0;const lx0=cx0+(ci>0?gap*.5:0),lx1=cx1-(ci<cols.length-1?gap*.5:0);
      if(rectDist(lx0,ly0,lx1,ly1)<CLEAR+.3)continue;if(overlaps(lx0,ly0,lx1,ly1))continue;
      if(EL_X>lx0-4.3&&EL_X<lx1+4.3)continue;
      building(lx0,ly0,lx1,ly1,{n:north,s:south,w:ci===0,e:ci===cols.length-1});
    }});
  }
  /* ---------- buildings ---------- */
  function building(x0,y0,x1,y1,street){
    const cx=(x0+x1)/2,cy=(y0+y1)/2,dt=Math.hypot(cx-110,cy-150);
    const down=Math.max(0,1-dt/260);
    let H=8+Math.pow(R(),1.6)*22+down*14;const tower=R()<.08+down*.18;if(tower)H=42+R()*75*(.5+down);
    let style=R();style=tower?(style<.6?2:style<.85?1:0):(style<.32?0:style<.5?1:style<.6?2:style<.88?3:4);
    const fh={0:3.3,1:3.6,2:3.9,3:3.2,4:4.2}[style]+R()*.3,bw0={0:2.3,1:3.1,2:1.6,3:2.5,4:3.6}[style]+R()*.4;
    const tints={0:[[150,68,48],[120,58,44],[165,92,62],[96,52,44]],1:[[150,148,140],[120,120,118],[170,160,140]],2:[[60,90,110],[40,70,80],[90,110,120]],
      3:[[190,170,130],[150,165,170],[200,150,120],[120,150,130],[170,120,130],[210,200,180]],4:[[90,95,100],[110,80,60],[70,90,80]]}[style];
    const tint=tints[Math.floor(R()*tints.length)],seed=Math.floor(R()*255),fhc=Math.max(0,Math.min(15,Math.round((fh-3)/.1)));
    const store=H>7&&style!==4;
    const faceSet=(fx0,fy0,fx1,fy1,h0,h1,storeOK,fidx0)=>{
      const F=[[[fx0,fy0],[fx1,fy0],[0,0,1],'s'],[[fx1,fy1],[fx0,fy1],[0,0,-1],'n'],[[fx1,fy0],[fx1,fy1],[1,0,0],'e'],[[fx0,fy1],[fx0,fy0],[-1,0,0],'w']];
      F.forEach(([bl,br,n,side],k)=>{const Wd=Math.hypot(br[0]-bl[0],br[1]-bl[1]),nb=Math.max(1,Math.round(Wd/bw0)),bw=Wd/nb,al=Math.max(0,Math.min(255,Math.round((bw-1)/3*255)));
        const st=storeOK&&street[side]?1:0;C.mat(5,style,seed,st|(fhc<<4)).col(tint[0],tint[1],tint[2],al);
        const u0=(fidx0+k)*64*bw;const a=W(bl[0],bl[1],h0),b=W(br[0],br[1],h0),c=W(br[0],br[1],h1),d=W(bl[0],bl[1],h1);
        C.at((bl[0]+br[0])/2,-(bl[1]+br[1])/2).quadP(a,b,c,d,[[u0,h0],[u0+Wd,h0],[u0+Wd,h1],[u0,h1]],n);
        if(st&&h0<1)facadeExtras(bl,br,n,Wd,side);});
    };
    let hTop=H,rx0=x0,ry0=y0,rx1=x1,ry1=y1;
    if(tower&&(x1-x0)>18&&(y1-y0)>18){const hp=10+R()*8,ins=3+R()*3;faceSet(x0,y0,x1,y1,0,hp,store,0);roof(x0,y0,x1,y1,hp,false);
      rx0=x0+ins;ry0=y0+ins;rx1=x1-ins;ry1=y1-ins;faceSet(rx0,ry0,rx1,ry1,hp,H,false,4);}
    else faceSet(x0,y0,x1,y1,0,H,store,0);
    roof(rx0,ry0,rx1,ry1,hTop,true);
    if(tower&&R()<.7){const ax=(rx0+rx1)/2,ay=(ry0+ry1)/2,ah=6+R()*14;C.mat(8,100,230).col(80,80,85);C.at(ax,-ay).tube(W(ax,ay,hTop),W(ax,ay,hTop+ah),.12,5,true,.05);
      C.mat(7,60,7).col(255,30,20);C.at(ax,-ay).sphere(W(ax,ay,hTop+ah+.15),.18,6,3);
      addLight({type:0,pos:W(ax,ay,hTop+ah+.4),r:8,col:[4,.4,.2],flick:7});}
    /* rooftop billboards facing the track */
    if(!tower&&H<26&&R()<.35){const best=bestFace(x0,y0,x1,y1);if(best&&best.dist<70)billboard(best,H);}
    return H;
  }
  function roof(x0,y0,x1,y1,H,props){
    C.mat(6).col(255,0,0,255);const B=C.at((x0+x1)/2,-(y0+y1)/2);
    const a=W(x0,y0,H-.05),b=W(x1,y0,H-.05),c=W(x1,y1,H-.05),d=W(x0,y1,H-.05);B.quadP(a,b,c,d,[[x0,-y0],[x1,-y0],[x1,-y1],[x0,-y1]],[0,1,0]);
    C.mat(4,0).col(255,0,0,255);const pt=.3,ph=1.0;
    for(const [ax,ay,bx,by] of [[x0,y0,x1,y0+pt],[x0,y1-pt,x1,y1],[x0,y0,x0+pt,y1],[x1-pt,y0,x1,y1]]){
      C.at((ax+bx)/2,-(ay+by)/2).box(W((ax+bx)/2,(ay+by)/2,H-.05+ph/2),[1,0,0],[0,1,0],[0,0,1],[(bx-ax)/2,ph/2,(by-ay)/2],8);}
    if(!props)return;
    const n=1+Math.floor(R()*3);for(let k=0;k<n;k++){const w=1.2+R()*2.5,l=1.2+R()*3,h=.8+R()*1.6,px=x0+2+R()*Math.max(.1,x1-x0-4-w),py=y0+2+R()*Math.max(.1,y1-y0-4-l);
      C.mat(8,150,150).col(120,122,125);C.at(px,-py).box(W(px+w/2,py+l/2,H+h/2-.05),[1,0,0],[0,1,0],[0,0,1],[w/2,h/2,l/2],8);}
    if(R()<.3&&x1-x0>8&&y1-y0>8){const px=x0+3+R()*(x1-x0-6),py=y0+3+R()*(y1-y0-6);C.mat(13,230).col(120,80,55);
      C.at(px,-py).tube(W(px,py,H+2.2),W(px,py,H+5.5),1.4,10,true);
      C.mat(8,200,0).col(60,60,60);for(const [ox,oy] of [[-1,-1],[1,-1],[1,1],[-1,1]])C.at(px,-py).tube(W(px+ox,py+oy,H),W(px+ox,py+oy,H+2.3),.08,4,false);}
  }
  /* the face of a lot that looks most directly at the track */
  function bestFace(x0,y0,x1,y1){let best=null;
    for(const [mx,my,nx,ny,bl,br] of [[(x0+x1)/2,y0,0,-1,[x0,y0],[x1,y0]],[(x0+x1)/2,y1,0,1,[x1,y1],[x0,y1]],[x1,(y0+y1)/2,1,0,[x1,y0],[x1,y1]],[x0,(y0+y1)/2,-1,0,[x0,y1],[x0,y0]]]){
      const d=trackDist(mx+nx*20,my+ny*20);const d0=trackDist(mx,my);if(d<d0-5&&(!best||d0<best.dist))best={dist:d0,mx,my,nx,ny,bl,br};}
    return best;}
  /* neon and lit boxes on the street faces of buildings */
  function facadeExtras(bl,br,n,Wd,side){
    const mx=(bl[0]+br[0])/2,my=(bl[1]+br[1])/2,nm=[n[0],-n[2]];const near=trackDist(mx+nm[0]*6,my+nm[1]*6);
    const rt=[(br[0]-bl[0])/Wd,(br[1]-bl[1])/Wd];
    /* light spilling out of the shop windows onto the sidewalk */
    if(trackDist(mx,my)<70)for(let u=4;u<Wd-2;u+=12){const px=bl[0]+rt[0]*u+nm[0]*1.4,py=bl[1]+rt[1]*u+nm[1]*1.4;const hs=R();
      const c=hs<.55?[1,.7,.42]:hs<.85?[.8,.9,1]:[1,.55,.8];addLight({type:0,pos:W(px,py,2.4),r:7.5,col:c.map(v=>v*1.6),src:.4});}
    if(near>45||Wd<7)return;
    const r=R();
    if(r<.62){/* a horizontal neon word over the shop */
      const word=WORDS[Math.floor(R()*WORDS.length)],px=.13+R()*.05,len=word.length*6*px-px;if(len>Wd-1.5)return;
      const u0=1+R()*(Wd-1.5-len),col=NEON[Math.floor(R()*NEON.length)],h0=5.15+R()*.6;
      const o=[bl[0]+rt[0]*u0+nm[0]*.32,bl[1]+rt[1]*u0+nm[1]*.32];
      C.mat(13,140).col(30,30,34);C.at(mx,-my).box(W(o[0]+rt[0]*len/2-nm[0]*.12,o[1]+rt[1]*len/2-nm[1]*.12,h0+3*px),[rt[0],0,-rt[1]],[0,1,0],[nm[0],0,-nm[1]],[len/2+.25,3.5*px+.2,.08]);
      const fl=R()<.18?1+Math.floor(R()*5):0;
      neonText(word,W(o[0],o[1],h0),[rt[0],0,-rt[1]],[0,1,0],px,col,fl);
      addLight({type:2,pos:W(o[0]+rt[0]*len/2+nm[0]*.5,o[1]+rt[1]*len/2+nm[1]*.5,h0+3*px),axis:[rt[0]*len/2,0,-rt[1]*len/2],r:13,col:col.map(v=>v*2.6),flick:fl,src:.15});
    }else if(r<.9){/* a vertical blade sign sticking out from the wall */
      const word=WORDS[Math.floor(R()*WORDS.length)].slice(0,7),px=.15,lh=9*px,len=word.length*lh;
      const u0=R()<.5?1.2:Wd-1.2,col=NEON[Math.floor(R()*NEON.length)],h0=7+R()*3;
      const base=[bl[0]+rt[0]*u0,bl[1]+rt[1]*u0],out=1.9,thick=.18;
      C.mat(13,120).col(25,25,30);const c0=[base[0]+nm[0]*(out/2+.3),base[1]+nm[1]*(out/2+.3)];
      C.at(mx,-my).box(W(c0[0],c0[1],h0+len/2),[nm[0],0,-nm[1]],[0,1,0],[rt[0],0,-rt[1]],[out/2,len/2+.2,thick/2]);
      C.mat(8,90,230).col(60,60,64);for(const hh of [h0+.3,h0+len-.3])C.at(mx,-my).tube(W(base[0],base[1],hh),W(base[0]+nm[0]*.4,base[1]+nm[1]*.4,hh),.04,4,false);
      const fl=R()<.2?1+Math.floor(R()*5):0;
      for(const sgn of [1,-1]){/* both faces of the blade */
        for(let k=0;k<word.length;k++){const ch=word[k],hh=h0+len-(k+1)*lh+px;
          const rs=sgn>0?-1:1,facePos=[c0[0]+rt[0]*sgn*(thick/2+.04)-nm[0]*rs*2.5*px,c0[1]+rt[1]*sgn*(thick/2+.04)-nm[1]*rs*2.5*px];
          const right=[nm[0]*rs,0,-nm[1]*rs];
          neonText(ch,W(facePos[0],facePos[1],hh),right,[0,1,0],px,col,fl);}}
      addLight({type:2,pos:W(c0[0],c0[1],h0+len/2),axis:[0,len/2,0],r:14,col:col.map(v=>v*3),flick:fl,src:.2});
    }else{/* a neon outline along the shopfront */
      const col=NEON[Math.floor(R()*NEON.length)];C.mat(7,70,0).col(col[0]*255,col[1]*255,col[2]*255);
      const a=[bl[0]+rt[0]*.6+nm[0]*.12,bl[1]+rt[1]*.6+nm[1]*.12],b=[br[0]-rt[0]*.6+nm[0]*.12,br[1]-rt[1]*.6+nm[1]*.12];
      C.at(mx,-my).tube(W(a[0],a[1],4.55),W(b[0],b[1],4.55),.03,5,true);
      addLight({type:2,pos:W((a[0]+b[0])/2+nm[0]*.4,(a[1]+b[1])/2+nm[1]*.4,4.5),axis:[(b[0]-a[0])/2,0,-(b[1]-a[1])/2],r:9,col:col.map(v=>v*1.6),src:.1});
    }
  }
  function billboard(F,H){
    const Wd=Math.hypot(F.br[0]-F.bl[0],F.br[1]-F.bl[1]);if(Wd<9)return;const w=Math.min(Wd-2,14),h=w*.38,rt=[(F.br[0]-F.bl[0])/Wd,(F.br[1]-F.bl[1])/Wd];
    const cx=(F.bl[0]+F.br[0])/2-F.nx*1.5,cy=(F.bl[1]+F.br[1])/2-F.ny*1.5,y0=H+1.2;
    C.mat(8,140,220).col(60,60,62);for(const o of [-w/3,w/3])C.at(cx,-cy).tube(W(cx+rt[0]*o,cy+rt[1]*o,H),W(cx+rt[0]*o,cy+rt[1]*o,y0+.2),.1,5,false);
    const col=NEON[Math.floor(R()*NEON.length)].map(v=>v*.55+.25);
    C.mat(10,28).col(col[0]*255,col[1]*255,col[2]*255);
    const fa=W(cx+rt[0]*-w/2+F.nx*.2,cy+rt[1]*-w/2+F.ny*.2,y0),fb=W(cx+rt[0]*w/2+F.nx*.2,cy+rt[1]*w/2+F.ny*.2,y0);
    C.at(cx,-cy).quadP(fa,fb,[fb[0],y0+h,fb[2]],[fa[0],y0+h,fa[2]],[[0,0],[1,0],[1,1],[0,1]],[F.nx,0,-F.ny]);
    C.mat(13,150).col(30,30,30);C.at(cx,-cy).box(W(cx,cy,y0+h/2),[rt[0],0,-rt[1]],[0,1,0],[F.nx,0,-F.ny],[w/2+.15,h/2+.15,.15]);
    const word=WORDS[Math.floor(R()*WORDS.length)];const px=Math.min(h*.7/7,(w-1)/(word.length*6));const len=word.length*6*px-px;
    const ncol=NEON[Math.floor(R()*NEON.length)];
    neonText(word,W(cx-rt[0]*len/2+F.nx*.35,cy-rt[1]*len/2+F.ny*.35,y0+(h-7*px)/2),[rt[0],0,-rt[1]],[0,1,0],px,ncol,0);
    addLight({type:2,pos:W(cx+F.nx*3,cy+F.ny*3,y0+h/2),axis:[rt[0]*w/2,0,-rt[1]*w/2],r:26,col:col.map(v=>v*7),src:.5});
  }
  /* neon letters: runs of lit pixels become glass tubes */
  function neonText(text,origin,right,up,px,col,fl){
    C.mat(7,Math.round(52+R()*16),fl,0).col(col[0]*255,col[1]*255,col[2]*255);
    const B=C.at(origin[0],origin[2]),rad=px*.17;
    const P=(x,y)=>[origin[0]+right[0]*x*px+up[0]*y*px,origin[1]+right[1]*x*px+up[1]*y*px,origin[2]+right[2]*x*px+up[2]*y*px];
    let cx=0;
    for(const ch of text){const pix=glyphPixels(ch),on=new Set(pix.map(([c,r])=>c+','+r));const has=(c,r)=>on.has(c+','+r);const used=new Set();
      for(let r=0;r<7;r++){let c=0;while(c<5){if(has(c,r)&&has(c+1,r)){let e=c;while(has(e+1,r))e++;B.tube(P(cx+c,6-r),P(cx+e,6-r),rad,5,true);for(let k=c;k<=e;k++)used.add(k+','+r);c=e+1;}else c++;}}
      for(let c=0;c<5;c++){let r=0;while(r<7){if(has(c,r)&&has(c,r+1)){let e=r;while(has(c,e+1))e++;B.tube(P(cx+c,6-r),P(cx+c,6-e),rad,5,true);for(let k=r;k<=e;k++)used.add(c+','+k);r=e+1;}else r++;}}
      for(const [c,r] of pix){for(const dc of [-1,1])if(has(c+dc,r+1)&&!has(c+dc,r)&&!has(c,r+1))B.tube(P(cx+c,6-r),P(cx+c+dc,6-r-1),rad,5,true),used.add(c+','+r),used.add((c+dc)+','+(r+1));}
      for(const [c,r] of pix)if(!used.has(c+','+r))B.tube(P(cx+c-.3,6-r),P(cx+c+.3,6-r),rad,5,true);
      cx+=6;}
  }

  /* ---------- the tunnel building ---------- */
  if(info.tunnel){
    const tx0=-130,tx1=-82,ty0=205,ty1=275,Ht=30,open=[-106-wl-BAR,-106+wr+BAR],oh=6.0;
    const fac=(bl,br,n,u0,h0,h1)=>{C.mat(5,1,77,(6<<4)).col(140,138,132,Math.round((3.0-1)/3*255));const Wd=Math.hypot(br[0]-bl[0],br[1]-bl[1]);const a=W(bl[0],bl[1],h0),b=W(br[0],br[1],h0),c=W(br[0],br[1],h1),d=W(bl[0],bl[1],h1);
      C.at((bl[0]+br[0])/2,-(bl[1]+br[1])/2).quadP(a,b,c,d,[[u0,h0],[u0+Wd,h0],[u0+Wd,h1],[u0,h1]],n);};
    /* north and south faces with the portal cut out */
    for(const [y,n,s] of [[ty1,[0,0,-1],-1],[ty0,[0,0,1],1]]){
      const xa=s>0?tx0:tx1,xb=s>0?tx1:tx0,oa=s>0?open[0]:open[1],ob=s>0?open[1]:open[0];
      fac([xa,y],[oa,y],n,0,0,Ht);fac([ob,y],[xb,y],n,Math.abs(ob-xa),0,Ht);fac([oa,y],[ob,y],n,Math.abs(oa-xa),oh,Ht);
      /* portal frame */
      C.mat(4,3).col(255,0,0,255);const yy=y+(s>0?-.4:.4);
      C.at(-106,-y).box(W(-106,yy,oh+.5),[1,0,0],[0,1,0],[0,0,1],[(open[1]-open[0])/2+.6,.5,.6]);
      C.mat(7,40,0).col(255,180,90);C.at(-106,-y).box(W(-106,yy+(s>0?-.62:.62),oh+.5),[1,0,0],[0,1,0],[0,0,1],[(open[1]-open[0])/2,.06,.03]);
      addLight({type:2,pos:W(-106,yy+(s>0?-2:2),oh+.2),axis:[(open[1]-open[0])/2,0,0],r:16,col:[10,7,4],src:.1});
    }
    fac([tx1,ty0],[tx1,ty1],[1,0,0],0,0,Ht);fac([tx0,ty1],[tx0,ty0],[-1,0,0],0,0,Ht);
    roof(tx0,ty0,tx1,ty1,Ht,true);
    /* a big neon word over the north portal, the way in */
    /* drivers arrive from the north looking south, so the words run east to west */
    neonText('NEON LOOP',W(-106+(9*6*.42-.42)/2,ty1+.5,oh+2.4),[-1,0,0],[0,1,0],.42,[1,.2,.6],0);
    addLight({type:2,pos:W(-106,ty1+3,oh+3.9),axis:[11,0,0],r:30,col:[45,9,26],src:.6});
    /* the lights inside: tube fittings down both sides of the ceiling */
    for(let s=info.tunnel[0]+2;s<info.tunnel[1]-1;s+=4.5)for(const d of [-4.2,4.2]){
      const a=T.pos(s-.75,d,5.92),b=T.pos(s+.75,d,5.92);C.mat(7,80,0).col(235,240,255);C.at(a[0],a[2]).box([(a[0]+b[0])/2,a[1]-.04,(a[2]+b[2])/2],norm([b[0]-a[0],0,b[2]-a[2]]),[0,1,0],norm(cross(norm([b[0]-a[0],0,b[2]-a[2]]),[0,1,0])),[.75,.05,.09]);
      addLight({type:2,pos:[(a[0]+b[0])/2,a[1]-.2,(a[2]+b[2])/2],axis:[(b[0]-a[0])/2,0,(b[2]-a[2])/2],r:9.5,col:[7,7.4,8],src:.1});}
  }

  /* ---------- the elevated railway on 170th ---------- */
  {const x=EL_X,y0=info.el.y0,y1=info.el.y1,steel=[38,58,48];
    const bents=[];for(let y=y0;y<=y1;y+=18){if(trackDist(x-5.2,y)<CLEAR+.5||trackDist(x+5.2,y)<CLEAR+.5)continue;bents.push(y);}
    for(const y of bents){C.mat(8,170,200,1).col(...steel);
      for(const ox of [-5.2,5.2])C.at(x+ox,-y).box(W(x+ox,y,3.9),[1,0,0],[0,1,0],[0,0,1],[.32,3.9,.32]);
      C.at(x,-y).box(W(x,y,7.95),[1,0,0],[0,1,0],[0,0,1],[5.8,.45,.38]);}
    for(let ya=y0;ya<y1;ya+=40){const yb=Math.min(y1,ya+40),ym=(ya+yb)/2;
      C.mat(8,170,200,1).col(...steel);
      for(const ox of [-3.7,3.7])C.at(x+ox,-ym).box(W(x+ox,ym,8.9),[1,0,0],[0,1,0],[0,0,1],[.16,.65,(yb-ya)/2]);
      for(const ox of [-1.3,1.3])C.at(x+ox,-ym).box(W(x+ox,ym,8.6),[1,0,0],[0,1,0],[0,0,1],[.12,.35,(yb-ya)/2]);
      /* ties with gaps between them: the light comes through */
      C.mat(13,230).col(70,52,40);const B=C.at(x,-ym);
      for(let y=ya;y<yb;y+=.62)B.box(W(x,y+.13,9.33),[1,0,0],[0,1,0],[0,0,1],[3.9,.09,.13],3);
      C.mat(14).col(150,150,155);for(const ox of [-2.5,-1.08,1.08,2.5])B.box(W(x+ox,ym,9.5),[1,0,0],[0,1,0],[0,0,1],[.035,.08,(yb-ya)/2],48);
      C.mat(8,150,200).col(...steel);for(const ox of [-3.95,3.95])B.box(W(x+ox,ym,10.1),[1,0,0],[0,1,0],[0,0,1],[.03,.03,(yb-ya)/2],0);}
    /* sodium lamps hanging under the deck */
    bents.forEach((y,k)=>{if(k%2)return;for(const ox of [-4.6,4.6]){C.mat(7,90,0,1).col(255,170,80);C.at(x+ox,-y).sphere(W(x+ox,y+.9,7.1),.22,6,3);
      addLight({type:1,pos:W(x+ox,y+.9,6.9),r:18,col:[110,62,26],dir:[0,-1,0],cosO:Math.cos(1.25),cosI:Math.cos(.7),src:.25});}});
  }

  /* ---------- street lamps along the track ---------- */
  let k=0;
  for(let s=6;s<T.len-6;s+=31,k++){
    if(inTun(s)||inTun(s+8)||inTun(s-8))continue;
    const left=k%2===0,sg=left?1:-1,e=left?wl:wr;const pp=flatP(s,sg*(e+BAR+.55),.12),ap=T.pos(s,sg*(e-1.6),8.4);
    const p=[pp[0],pp[1],pp[2]];
    const yb=-p[2];if(Math.abs(p[0]-EL_X)<7&&yb>info.el.y0&&yb<info.el.y1)continue;
    const led=Math.hypot(p[0]-110,-p[2]-150)<170;
    C.mat(8,140,230).col(58,60,64);const B=C.at(p[0],p[2]);
    B.tube(p,[p[0],p[1]+8.6,p[2]],.11,6,true,.075);
    const top=[p[0],p[1]+8.6,p[2]],head=[ap[0],p[1]+8.5,ap[2]];
    B.tube(top,head,.06,5,false);
    const dir=norm([head[0]-p[0],0,head[2]-p[2]]),side=norm(cross(dir,[0,1,0]));
    C.mat(8,120,200).col(70,72,76);C.at(head[0],head[2]).box([head[0],head[1]-.06,head[2]],dir,[0,1,0],side,[.45,.09,.2]);
    const lc=led?[235,242,255]:[255,190,110];C.mat(7,led?110:90,0,1).col(...lc);
    C.at(head[0],head[2]).box([head[0],head[1]-.16,head[2]],dir,[0,1,0],side,[.35,.012,.14]);
    const tilt=norm([-dir[0]*.25,-1,-dir[2]*.25]);
    addLight({type:1,pos:[head[0],head[1]-.3,head[2]],r:31,col:led?[230,250,290]:[320,175,70],dir:tilt,cosO:Math.cos(1.22),cosI:Math.cos(.62),src:.25});
    info.lamps++;
  }
  /* street lamps and flashing signals on the grid streets */
  for(const X of XS)for(let j=0;j<YS.length-1;j++)for(let y=YS[j]+18;y<YS[j+1]-10;y+=36){
    for(const sd of [-1,1]){const px=X+sd*(STREET+.6),py=y+(sd>0?18:0);if(trackDist(px,py)<16||trackDist(px,py)>220||overlaps(px,py,px,py))continue;if(Math.abs(X-EL_X)<1)continue;lamp(px,py,[-sd,0]);}}
  for(const Y of YS)for(let j=0;j<XS.length-1;j++)for(let x=XS[j]+18;x<XS[j+1]-10;x+=36){
    for(const sd of [-1,1]){const px=x+(sd>0?18:0),py=Y+sd*(STREET+.6);if(trackDist(px,py)<16||trackDist(px,py)>220||overlaps(px,py,px,py))continue;lamp(px,py,[0,-sd]);}}
  function lamp(px,py,dn){
    const p=W(px,py,slabTop),head=W(px+dn[0]*2.2,py+dn[1]*2.2,7.4);
    C.mat(8,140,230).col(58,60,64);const B=C.at(px,-py);B.tube(p,[p[0],7.5,p[2]],.09,5,true,.06);B.tube([p[0],7.5,p[2]],head,.05,4,false);
    C.mat(7,90,0,1).col(255,180,100);B.box([head[0],head[1]-.1,head[2]],[1,0,0],[0,1,0],[0,0,1],[.3,.03,.18]);
    addLight({type:1,pos:[head[0],head[1]-.3,head[2]],r:24,col:[230,128,52],dir:[0,-1,0],cosO:Math.cos(1.2),cosI:Math.cos(.6),src:.2});
  }
  for(const X of XS)for(const Y of YS){if(trackDist(X,Y)<22||R()<.4)continue;const px=X+STREET+.6,py=Y+STREET+.6;if(overlaps(px,py,px,py))continue;
    C.mat(8,150,230).col(45,48,40);const B=C.at(px,-py);B.tube(W(px,py,slabTop),W(px,py,4.6),.08,5,true);
    for(const [dx,dy] of [[-1,0],[0,-1]]){const c=W(px+dx*.3,py+dy*.3,4.2);C.mat(8,160,100).col(30,32,26);B.box(c,[1,0,0],[0,1,0],[0,0,1],[.16,.45,.16]);
      for(let l=0;l<3;l++){C.mat(15,l,2).col(255,255,255);B.sphere(W(px+dx*.48,py+dy*.48,4.5-l*.3),.1,6,3);}}
    addLight({type:0,pos:W(px-.8,py-.8,4.3),r:9,col:[9,5,.4],flick:6,src:.1});}

  /* ---------- start / finish gantry ---------- */
  {const s=0,P=(d,h)=>T.pos(s,d,h),dl=wl+BAR*.5,dr=-(wr+BAR*.5);
    C.mat(8,90,240).col(40,40,46);const B=C.at(P(0,0)[0],P(0,0)[2]);
    for(const d of [dl,dr]){const b=P(d,1.0);B.box([b[0],b[1]+3.2,b[2]],[1,0,0],[0,1,0],[0,0,1],[.25,3.2,.25]);}
    const a=P(dl,7.2),b=P(dr,7.2),cen=[(a[0]+b[0])/2,a[1],(a[2]+b[2])/2],ax=norm([a[0]-b[0],0,a[2]-b[2]]),fw=norm(cross([0,1,0],ax));
    B.box(cen,ax,[0,1,0],fw,[Math.hypot(a[0]-b[0],a[2]-b[2])/2,.7,.4]);
    const word='SHIFTLIGHT',px=.21,len=word.length*6*px-px;
    for(const sg of [-1,1]){const o=[cen[0]-ax[0]*len/2*(sg>0?1:-1)-fw[0]*.42*sg,cen[1]-.5,cen[2]-ax[2]*len/2*(sg>0?1:-1)-fw[2]*.42*sg];
      neonText(word,o,sg>0?ax:ax.map(v=>-v),[0,1,0],px,[1,.25,.55],0);}
    /* the start lights: five pods under the beam facing the grid, two red lamps each (channels 8-12),
       and a row of green below them (channel 13) */
    {const f0=T.frame(0).f,bk=norm([-f0[0],0,-f0[2]]),cy=cen[1]-.95;
      for(let i=0;i<5;i++){const o=(i-2)*.95,pc=[cen[0]+ax[0]*o+bk[0]*.5,cy,cen[2]+ax[2]*o+bk[2]*.5];
        C.mat(8,60,40).col(18,18,22);B.box(pc,ax,[0,1,0],bk,[.36,.42,.14]);
        for(const dy of [.17,-.08]){C.mat(7,170,8+i).col(255,22,14);B.sphere([pc[0]+bk[0]*.14,pc[1]+dy,pc[2]+bk[2]*.14],.11,8,4);}
        C.mat(7,150,13).col(40,255,90);B.sphere([pc[0]+bk[0]*.14,pc[1]-.3,pc[2]+bk[2]*.14],.075,8,4);
        addLight({type:0,pos:[pc[0]+bk[0]*.9,pc[1],pc[2]+bk[2]*.9],r:9,col:[4,.15,.08],flick:8+i,src:.1});}
      addLight({type:0,pos:[cen[0]+bk[0]*.9,cy-.3,cen[2]+bk[2]*.9],r:14,col:[.6,4,1.2],flick:13,src:.2});}
    addLight({type:2,pos:[cen[0]-fw[0]*1.5,cen[1]-1.2,cen[2]-fw[2]*1.5],axis:ax.map(v=>v*len/2),r:22,col:[12,3,6.5],src:.4});
    addLight({type:2,pos:[cen[0]+fw[0]*1.5,cen[1]-1.2,cen[2]+fw[2]*1.5],axis:ax.map(v=>v*len/2),r:22,col:[12,3,6.5],src:.4});
  }

  /* ---------- steam from manholes (the same hash the road shader uses) and sidewalk grates ---------- */
  for(let ms=0;ms*41<T.len;ms++){const mp=h11(ms*1.9)*41,s=ms*41+mp;if(s>=T.len||inTun(s))continue;
    const md=(h11(ms*8.3)>.5?1:-1)*(1.625+(h11(ms*6.1)-.5)*1.2);if(h11(ms*4.7)<.45)steam.push({pos:T.pos(s,md,.02),rate:.6+h11(ms*2.2)});}

  /* ---------- the skyline far out ---------- */
  for(let n=0;n<340;n++){
    const a=R()*Math.PI*2,r=560+Math.pow(R(),.7)*950,cx=110+Math.cos(a)*r,cy=170+Math.sin(a)*r;
    if(cx>-320&&cx<490&&cy>-230&&cy<570)continue;
    const w=18+R()*40,l=18+R()*40,H=25+Math.pow(R(),2)*190*(r<900?1:.7),style=R()<.5?2:1,seed=Math.floor(R()*255);
    const tint=style===2?[50+R()*40,80+R()*30,100+R()*30]:[120+R()*50,118+R()*45,110+R()*40],bw0=style===2?1.7:3.2;
    const x0=cx-w/2,x1=cx+w/2,y0=cy-l/2,y1=cy+l/2;
    const F=[[[x0,y0],[x1,y0],[0,0,1]],[[x1,y1],[x0,y1],[0,0,-1]],[[x1,y0],[x1,y1],[1,0,0]],[[x0,y1],[x0,y0],[-1,0,0]]];
    F.forEach(([bl,br,nn],k2)=>{const Wd=Math.hypot(br[0]-bl[0],br[1]-bl[1]),nb=Math.max(1,Math.round(Wd/bw0)),bw=Wd/nb;
      SKY.mat(5,style,seed,(8<<4)).col(tint[0],tint[1],tint[2],Math.round((bw-1)/3*255));
      const a2=W(bl[0],bl[1],0),b2=W(br[0],br[1],0),c2=W(br[0],br[1],H),d2=W(bl[0],bl[1],H);const u0=k2*64*bw;
      SKY.at(cx,-cy).quadP(a2,b2,c2,d2,[[u0,0],[u0+Wd,0],[u0+Wd,H],[u0,H]],nn);});
    SKY.mat(6).col(255,0,0,255);SKY.at(cx,-cy).quadP(W(x0,y0,H),W(x1,y0,H),W(x1,y1,H),W(x0,y1,H),[[0,0],[1,0],[1,1],[0,1]],[0,1,0]);
    if(H>120){SKY.mat(7,60,7).col(255,30,20);SKY.at(cx,-cy).sphere(W(cx,cy,H+1.5),.6,5,3);}
  }
  /* merge the coarse skyline tiles into the same buffers */
  for(const [k,B] of SKY.tiles)C.tiles.set('sky'+k,B);
  const packed=C.pack();
  return {geo:packed,lights,steam,info};
}
