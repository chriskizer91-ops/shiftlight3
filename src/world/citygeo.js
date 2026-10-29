/* =====================================================================================
   SHIFT CITY — what you see. Built from the map (citymap.js) with the city kit:
   streets with their markings, intersections with working signals, medians, sidewalks and
   blocks, buildings by district, a park, street trees and lamps, the elevated expressway on
   its hammerhead piers with barriers, deck lights and ramps on embankments, the skyline.
   New world materials: 16 foliage, 17 city street, 18 expressway deck, 19 grass.
   ===================================================================================== */
import {Chunked,rng,norm} from '../render/mesh.js';
import {makeKit,W,NEON,WORDS} from './kit.js';
import {GRID,RING,CORNER,ROADS,HWY,DECK_H,classOf,hwOf,baseGround} from './citymap.js';
import {skylineBlocks,FLATS} from './flats.js';

const CLS={ring:0,main:1,ave:2,street:3};
export function buildShiftCity(M){
  const R=rng(9001),C=new Chunked(64),SKY=new Chunked(420),lights=[],steam=[];
  const K=makeKit(C,R,lights),info={spawn:null,signals:[]};
  const S=RING-CORNER;
  const quad=(x0,y0,x1,y1,h,uv)=>{const B=C.at((x0+x1)/2,-(y0+y1)/2);B.quadP(W(x0,y0,h),W(x1,y0,h),W(x1,y1,h),W(x0,y1,h),uv,[0,1,0]);};
  /* ---------- streets ---------- */
  for(const sg of M.segs){
    const A=M.nodes[sg.a],B=M.nodes[sg.b];
    if(sg.axis==='arc'){roadArc(sg,A,B);continue;}
    const L0=sg.axis==='x'?A.x+A.hx:A.y+A.hy,L1=sg.axis==='x'?B.x-B.hx:B.y-B.hy,L=L1-L0,hw=sg.hw;
    C.mat(17,CLS[sg.cls],Math.min(255,Math.round(L*2)),0).col(255,0,0,255);
    const n=Math.max(1,Math.ceil(L/30));
    /* the ring boulevard is split across so the part under the deck can stay dry */
    const strips=sg.cls==='ring'?[[-hw,-HWY.hw-.4,255],[-HWY.hw-.4,HWY.hw+.4,0],[HWY.hw+.4,hw,255]]:[[-hw,hw,255]];
    for(const [d0,d1,sh] of strips){C.col(sh,0,0,255);
    for(let k=0;k<n;k++){const a=L0+L*k/n,b=L0+L*(k+1)/n,ua=a-L0,ub=b-L0;
      if(sg.axis==='x')quad(a,sg.line+d0,b,sg.line+d1,0,[[ua,d0],[ub,d0],[ub,d1],[ua,d1]]);
      else{/* running north: left of travel is west (d = line - x) */
        const Bq=C.at(sg.line,-(a+b)/2);Bq.quadP(W(sg.line-d0,a,0),W(sg.line-d0,b,0),W(sg.line-d1,b,0),W(sg.line-d1,a,0),[[ua,d0],[ub,d0],[ub,d1],[ua,d1]],[0,1,0]);}}}
    /* a raised median on the big roads, stopping short of the junctions */
    if(sg.med>0){const m0=L0+3,m1=L1-3;C.mat(3).col(255,0,0,255);
      for(let a=m0;a<m1;a+=40){const b=Math.min(m1,a+40),c=(a+b)/2,hl=(b-a)/2;
        if(sg.axis==='x')C.at(c,-sg.line).box(W(c,sg.line,.08),[1,0,0],[0,1,0],[0,0,1],[hl,.08,sg.med],8);
        else C.at(sg.line,-c).box(W(sg.line,c,.08),[1,0,0],[0,1,0],[0,0,1],[sg.med,.08,hl],8);}}
    /* street lamps both sides, staggered; the ring has its lamps hung under the deck instead */
    if(sg.cls!=='ring')for(const side of [1,-1]){for(let a=L0+14+(side>0?0:18);a<L1-8;a+=36){
      const off=hw+.7,lx=sg.axis==='x'?a:sg.line+side*off,ly=sg.axis==='x'?sg.line+side*off:a,dir=sg.axis==='x'?[0,-side]:[-side,0];
      K.lamp(lx,ly,.15,dir,{arm:sg.cls==='street'?1.8:2.6,height:sg.cls==='street'?7:8.5,led:M.district(lx,ly)==='downtown'});}}
    /* trees along the avenues */
    if(sg.cls==='main'||sg.cls==='ave')for(const side of [1,-1])for(let a=L0+8+(side>0?6:0);a<L1-8;a+=14){
      const off=hw+2.2,tx=sg.axis==='x'?a:sg.line+side*off,ty=sg.axis==='x'?sg.line+side*off:a;if(R()<.85)K.tree(tx,ty,.15,.9);}
    /* steam from a manhole now and then */
    if(R()<.3){const a=L0+L*(.2+R()*.6),d=(R()<.5?1:-1)*sg.lw*.5;steam.push({pos:sg.axis==='x'?W(a,sg.line+d,.02):W(sg.line-d,a,.02),rate:.6+R()});}
  }
  /* ---------- intersections and their signals ---------- */
  M.nodes.forEach((n,i)=>{
    C.mat(17,4,0,0).col(255,0,0,255);quad(n.x-n.hx,n.y-n.hy,n.x+n.hx,n.y+n.hy,0,[[n.x-n.hx,n.y-n.hy],[n.x+n.hx,n.y-n.hy],[n.x+n.hx,n.y+n.hy],[n.x-n.hx,n.y+n.hy]]);
    n.sig=Math.floor(R()*255);
    const corners=n.ring?[[1,1],[-1,-1]].filter(([sx,sy])=>Math.abs(n.y)===RING?sy===-Math.sign(n.y):sx===-Math.sign(n.x)):[[-1,-1],[1,1]];
    for(const [sx,sy] of corners)K.signal(n.x+sx*(n.hx+.9),n.y+sy*(n.hy+.9),-sx*Math.min(9,n.hx*1.45),-sy*Math.min(9,n.hy*1.45),n.sig);
    info.signals.push({x:n.x,y:n.y,id:n.sig});
  });
  function roadArc(sg,A,B){
    const n=48,hw=sg.hw,cx=sg.cx,cy=sg.cy,r=sg.r,a0=sg.a0+(A.hx/r)*Math.sign(sg.a1-sg.a0),a1=sg.a1-(B.hy/r)*Math.sign(sg.a1-sg.a0);
    C.mat(17,0,255,1).col(255,0,0,255);
    for(let k=0;k<n;k++){const t0=a0+(a1-a0)*k/n,t1=a0+(a1-a0)*(k+1)/n,P=(t,rr)=>[cx+Math.cos(t)*rr,cy+Math.sin(t)*rr];
      const [p0,p1,p2,p3]=[P(t0,r+hw),P(t1,r+hw),P(t1,r-hw),P(t0,r-hw)],ua=Math.abs(t0-a0)*r,ub=Math.abs(t1-a0)*r;
      /* clockwise arcs: travel turns right, so the outside of the curve is on the left (d > 0) */
      const Bq=C.at((p0[0]+p2[0])/2,-(p0[1]+p2[1])/2);
      /* d is left of the a->b direction: outward on clockwise corners, inward on anticlockwise ones */
      if(a1<a0)Bq.quadP(W(p3[0],p3[1],0),W(p2[0],p2[1],0),W(p1[0],p1[1],0),W(p0[0],p0[1],0),[[ua,-hw],[ub,-hw],[ub,hw],[ua,hw]],[0,1,0]);
      else Bq.quadP(W(p0[0],p0[1],0),W(p1[0],p1[1],0),W(p2[0],p2[1],0),W(p3[0],p3[1],0),[[ua,-hw],[ub,-hw],[ub,hw],[ua,hw]],[0,1,0]);}
    C.mat(3).col(255,0,0,255);
    for(let k=0;k<12;k++){const t0=a0+(a1-a0)*(k+.05)/12,t1=a0+(a1-a0)*(k+.95)/12,tm=(t0+t1)/2,c=[cx+Math.cos(tm)*r,cy+Math.sin(tm)*r];
      C.at(c[0],-c[1]).box(W(c[0],c[1],.08),[-Math.sin(tm),0,-Math.cos(tm)],[0,1,0],[Math.cos(tm),0,-Math.sin(tm)],[Math.abs(t1-t0)*r/2,.08,sg.med],8);}
  }
  /* ---------- blocks: raised sidewalks, then buildings, the park ---------- */
  const slab=(x0,y0,x1,y1,edges)=>{C.mat(3).col(255,0,0,255);quad(x0,y0,x1,y1,.15,[[x0,-y0],[x1,-y0],[x1,-y1],[x0,-y1]]);
    if(!edges)return;C.mat(4,0).col(255,0,0,255);const B2=C.at((x0+x1)/2,-(y0+y1)/2),lo=-.06,t=.15;
    B2.quadP(W(x0,y0,lo),W(x1,y0,lo),W(x1,y0,t),W(x0,y0,t),[[x0,lo],[x1,lo],[x1,t],[x0,t]],[0,0,1]);
    B2.quadP(W(x1,y1,lo),W(x0,y1,lo),W(x0,y1,t),W(x1,y1,t),[[x1,lo],[x0,lo],[x0,t],[x1,t]],[0,0,-1]);
    B2.quadP(W(x1,y0,lo),W(x1,y1,lo),W(x1,y1,t),W(x1,y0,t),[[y0,lo],[y1,lo],[y1,t],[y0,t]],[1,0,0]);
    B2.quadP(W(x0,y1,lo),W(x0,y0,lo),W(x0,y0,t),W(x0,y1,t),[[y1,lo],[y0,lo],[y0,t],[y1,t]],[-1,0,0]);};
  for(const b of M.blocks){
    if(!b.corner)slab(b.x0,b.y0,b.x1,b.y1,true);
    else for(let x=b.x0;x<b.x1;x+=4)for(let y=b.y0;y<b.y1;y+=4){const x1=Math.min(b.x1,x+4),y1=Math.min(b.y1,y+4);if(baseGround(M,(x+x1)/2,(y+y1)/2)>.1)slab(x,y,x1,y1,false);}
    if(b.district==='park')park(b);
  }
  /* outside the ring: the band of sidewalk and lots, out to the skyline */
  const O0=RING+ROADS.ring.hw,O1=RING+200;
  for(const sg of [1,-1]){slab(-S,sg>0?O0:-O1,S,sg>0?O1:-O0,true);slab(sg>0?O0:-O1,-S,sg>0?O1:-O0,S,true);}
  for(const [sx,sy] of [[1,1],[1,-1],[-1,1],[-1,-1]])for(let a=S;a<O1;a+=6)for(let c=S;c<O1;c+=6){if(a+6<=RING-ROADS.ring.hw&&c+6<=RING-ROADS.ring.hw)continue;const x=sx*(a+3),y=sy*(c+3);if(baseGround(M,x,y)>.1&&Math.hypot(a+3-S,c+3-S)>CORNER+ROADS.ring.hw)slab(sx>0?a:-a-6,sy>0?c:-c-6,sx>0?a+6:-a,sy>0?c+6:-c,false);}
  function park(b){
    const x0=b.x0+b.sw.w,x1=b.x1-b.sw.e,y0=b.y0+b.sw.s,y1=b.y1-b.sw.n;
    C.mat(19).col(255,0,0,255);quad(x0,y0,x1,y1,.17,[[x0,-y0],[x1,-y0],[x1,-y1],[x0,-y1]]);
    C.mat(3).col(255,0,0,255);const cx=(x0+x1)/2,cy=(y0+y1)/2;
    for(const [ax,ay] of [[1,1],[1,-1]]){/* two diagonal paths */
      const L=Math.hypot(x1-x0,y1-y0)/2,d=norm([ax*(x1-x0),0,-ay*(y1-y0)]);C.at(cx,-cy).box(W(cx,cy,.18),d,[0,1,0],norm([d[2],0,-d[0]]),[L,.015,1.4]);}
    for(let k=0;k<34;k++){const tx=x0+4+R()*(x1-x0-8),ty=y0+4+R()*(y1-y0-8);if(Math.abs(Math.abs((tx-cx)/(x1-x0))-Math.abs((ty-cy)/(y1-y0)))<.04)continue;K.tree(tx,ty,.17,1.2);}
    for(let k=0;k<8;k++){const a=k/8*6.283,px=cx+Math.cos(a)*(x1-x0)*.32,py=cy+Math.sin(a)*(y1-y0)*.32;K.lamp(px,py,.17,[0,0],{arm:0,height:4.5});}
    /* a fountain in the middle */
    C.mat(4,0).col(255,0,0,255);C.at(cx,-cy).tube(W(cx,cy,.17),W(cx,cy,.6),5,24,true);C.mat(9,8).col(90,140,255);C.at(cx,-cy).tube(W(cx,cy,.55),W(cx,cy,.62),4.6,24,true);
  }
  /* ---------- buildings ---------- */
  const SIGNS={neon:.9,downtown:.25,mixed:.35,residential:.15,industrial:.05,edge:.12};
  for(const lot of M.lots){
    const dz=lot.district;
    K.building(lot,f=>K.signs(f,SIGNS[dz]||.2,dz==='neon'||dz==='downtown'||dz==='mixed'));
    if((dz==='downtown'||dz==='neon'||dz==='mixed')&&!lot.tower&&lot.h<34&&R()<.22){
      const sides=Object.keys(lot.street).filter(k=>lot.street[k]);if(sides.length){const sd=sides[Math.floor(R()*sides.length)];
        const F={s:[[lot.x0,lot.y0],[lot.x1,lot.y0],0,-1],n:[[lot.x1,lot.y1],[lot.x0,lot.y1],0,1],e:[[lot.x1,lot.y0],[lot.x1,lot.y1],1,0],w:[[lot.x0,lot.y1],[lot.x0,lot.y0],-1,0]}[sd];
        K.billboard(F[0],F[1],F[2],F[3],lot.h);}}
  }
  /* ---------- the expressway ---------- */
  expressway();
  function deck(Rb,{kind,gapFn,embank=true,lamps=true}){
    const hw=Rb.hw,dsq=2;
    for(let s=0;s<Rb.len-.01;s+=dsq){const s1=Math.min(Rb.len,s+dsq),sm=(s+s1)/2,h=Rb.yAt(sm);if(!Rb.closed&&h<.04&&Rb.yAt(s)<.04&&Rb.yAt(s1)<.04)continue;
      const cen=Rb.pos(sm,0),Bk=C.at(cen[0],cen[2]),fr=Rb.frame(sm);
      /* the surface */
      C.mat(18,kind,0,0).col(255,0,0,255);
      for(const [d0,d1] of [[-hw,-hw/2],[-hw/2,0],[0,hw/2],[hw/2,hw]])Bk.quadP(Rb.pos(s,d0),Rb.pos(s1,d0),Rb.pos(s1,d1),Rb.pos(s,d1),[[s,d0],[s1,d0],[s1,d1],[s,d1]],fr.u);
      /* fascia and underside where it is off the ground */
      if(h>.3){const th=1.1,hb=Math.min(th,h);C.mat(4,0).col(255,0,0,255);
        for(const sd of [1,-1]){const d=sd*(hw+.4),a0=Rb.pos(s,d,.1),a1=Rb.pos(s1,d,.1),b0=Rb.pos(s,d,-hb),b1=Rb.pos(s1,d,-hb);
          if(sd>0)Bk.quadP(a0,a1,b1,b0,[[s,.1],[s1,.1],[s1,-hb],[s,-hb]]);else Bk.quadP(a1,a0,b0,b1,[[s1,.1],[s,.1],[s,-hb],[s1,-hb]]);}
        if(h>th+.2){C.mat(13,220).col(60,60,62,255);const u0=Rb.pos(s,hw+.4,-th),u1=Rb.pos(s1,hw+.4,-th),v0=Rb.pos(s,-hw-.4,-th),v1=Rb.pos(s1,-hw-.4,-th);Bk.quadP(u0,u1,v1,v0,[[0,0],[1,0],[1,1],[0,1]],[0,-1,0]);}}
      /* the embankment under a low ramp */
      if(embank&&h>.05&&h<4.6){C.mat(4,0).col(255,0,0,255);for(const sd of [1,-1]){const d=sd*(hw+.4),a0=Rb.pos(s,d,-h),a1=Rb.pos(s1,d,-h),b0=Rb.pos(s,d,0),b1=Rb.pos(s1,d,0);
        if(sd>0)Bk.quadP(a0,a1,b1,b0,[[s,0],[s1,0],[s1,h],[s,h]]);else Bk.quadP(a1,a0,b0,b1,[[s1,0],[s,0],[s,h],[s1,h]]);}}
      /* parapets */
      for(const sd of [1,-1]){if(h<.35)continue;if(gapFn&&gapFn(sm,sd))continue;
        const d=sd*(hw+.2),c=Rb.pos(sm,d,.55);C.mat(4,1).col(255,0,0,255);Bk.box(c,fr.f,[0,1,0],norm([sd*fr.l[0],0,sd*fr.l[2]]),[(s1-s)/2+.02,.55,.2],0);}
    }
  }
  function expressway(){
    const H=M.hwy,gaps=M.ramps.map(r=>r.gap);
    deck(H,{kind:0,gapFn:(sm,sd)=>gaps.some(g=>g.side===sd&&sm>g.s0-1&&sm<g.s1+1)});
    /* the median barrier */
    C.mat(4,1).col(255,0,0,255);for(let s=0;s<H.len;s+=4){const fr=H.frame(s+2),c=H.pos(s+2,0,.45);C.at(c[0],c[2]).box(c,fr.f,[0,1,0],norm([fr.l[0],0,fr.l[2]]),[2.02,.45,.3],0);}
    for(const r of M.ramps)deck(r,{kind:1,gapFn:(sm,sd)=>{const a0=r.attach[0]*r.len,a1=r.attach[1]*r.len;return sd>0&&sm>a0-2&&sm<a1+2;}});
    /* hammerhead piers in the boulevard median */
    const ringNodes=M.nodes.filter(n=>n.ring);
    for(let s=8;s<H.len;s+=32){const p=H.pos(s,0),mx=p[0],my=-p[2];if(ringNodes.some(n=>Math.hypot(n.x-mx,n.y-my)<24))continue;
      const fr=H.frame(s),ax=norm([fr.l[0],0,fr.l[2]]);C.mat(4,3).col(255,0,0,255);
      C.at(mx,-my).box(W(mx,my,(DECK_H-2)/2),fr.f,[0,1,0],ax,[.9,(DECK_H-2)/2,.9]);
      C.mat(4,0).col(255,0,0,255);C.at(mx,-my).box(W(mx,my,DECK_H-1.55),fr.f,[0,1,0],ax,[1.1,.45,HWY.hw-1.2]);
      /* lamps hung under the deck light the boulevard below */
      for(const sd of [1,-1]){const q=H.pos(s+16,sd*5.5,-1.25);C.mat(7,90,0,1).col(255,175,90);C.at(q[0],q[2]).box(q,[1,0,0],[0,1,0],[0,0,1],[.35,.04,.2]);
        lights.push({type:1,pos:[q[0],q[1]-.2,q[2]],r:20,col:[150,82,32],dir:[0,-1,0],cosO:Math.cos(1.25),cosI:Math.cos(.7),src:.25,axis:[0,0,0],flick:0});}}
    for(const r of M.ramps)for(let s=12;s<r.len;s+=24){const h=r.yAt(s);if(h<4.6)continue;const a0=r.attach[0]*r.len,a1=r.attach[1]*r.len;if(s>a0-6&&s<a1+6)continue;
      const p=r.pos(s,0),fr=r.frame(s);C.mat(4,3).col(255,0,0,255);C.at(p[0],p[2]).box([p[0],(h-1.1)/2,p[2]],fr.f,[0,1,0],norm([fr.l[0],0,fr.l[2]]),[.55,(h-1.1)/2,.55]);}
    /* deck lights on the median: twin LED arms every 42 m */
    for(let s=20;s<H.len;s+=42){const fr=H.frame(s),base=H.pos(s,0,.9),top=[base[0],base[1]+9,base[2]];C.mat(8,140,230).col(70,72,76);const B=C.at(base[0],base[2]);
      B.tube(base,top,.12,6,true,.08);
      for(const sd of [1,-1]){const head=H.pos(s,sd*4.2,10);B.tube(top,head,.06,4,false);C.mat(7,110,0,1).col(235,242,255);B.box([head[0],head[1]-.08,head[2]],[1,0,0],[0,1,0],[0,0,1],[.32,.03,.16]);C.mat(8,140,230).col(70,72,76);
        lights.push({type:1,pos:[head[0],head[1]-.3,head[2]],r:30,col:[200,215,250],dir:[0,-1,0],cosO:Math.cos(1.2),cosI:Math.cos(.62),src:.2,axis:[0,0,0],flick:0});}}
    for(const r of M.ramps)for(let s=20;s<r.len-10;s+=38){if(r.yAt(s)<.5)continue;const p=r.pos(s,-(r.hw+.6));const dir=r.frame(s).l;K.lamp(p[0],-p[2],p[1],[dir[0],-dir[2]],{arm:2,height:8,led:true});}
    /* green signs over the deck before each exit */
    for(const r of M.ramps.filter(q=>q.kind==='off')){const sAt=r.dir>0?r.hs0-140:r.hs0+140,s=H.wrapS(sAt);const side=r.gap.side;
      const fr=H.frame(s),c0=H.pos(s,side*4.2,6.6),f=r.dir>0?fr.f:fr.f.map(v=>-v),rt=norm([f[2],0,-f[0]]).map(v=>-v);
      C.mat(8,150,200).col(60,62,66);const B=C.at(c0[0],c0[2]);for(const sd of [-1,1]){const pp=H.pos(s,side*4.2+sd*4.6,0);B.tube([pp[0],pp[1]+.9,pp[2]],[pp[0],pp[1]+7.4,pp[2]],.13,6,true);}
      B.box([c0[0],c0[1]+.6,c0[2]],[fr.l[0],0,fr.l[2]],[0,1,0],[fr.f[0],0,fr.f[2]],[4.8,.12,.12]);
      C.mat(10,6).col(20,110,60);const fb=[c0[0]-f[0]*.12,c0[1],c0[2]-f[2]*.12];B.box(fb,rt,[0,1,0],[f[0],0,f[2]],[3.6,1.0,.06]);
      const name=(['NORTH','EAST','SOUTH','WEST'][r.side])+' EXIT',px=.12,len=name.length*6*px-px;
      K.neonText(name,[fb[0]-rt[0]*len/2-f[0]*.08,fb[1]-.3,fb[2]-rt[2]*len/2-f[2]*.08],rt,[0,1,0],px,[.95,.97,.9]);}
  }
  /* ---------- the skyline out on the flats ---------- */
  /* the ground under the city (the flats around it are drawn around the camera, see flatsgeo.js) */
  const ground=SKY;ground.mat(11,1).col(255,0,0,255);
  for(let gx=-750;gx<750;gx+=250)for(let gy=-750;gy<750;gy+=250){ground.at(gx+125,-(gy+125)).quadP(W(gx,gy,-.09),W(gx+250,gy,-.09),W(gx+250,gy+250,-.09),W(gx,gy+250,-.09),[[gx,-gy],[gx+250,-gy],[gx+250,-gy-250],[gx,-gy-250]],[0,1,0]);}
  for(const b of skylineBlocks()){
    const {cx,cy,w,l,H,style,seed,tint}=b,bw0=style===2?1.7:3.2,x0=cx-w/2,x1=cx+w/2,y0=cy-l/2,y1=cy+l/2,g=FLATS.y-.05;
    [[[x0,y0],[x1,y0],[0,0,1]],[[x1,y1],[x0,y1],[0,0,-1]],[[x1,y0],[x1,y1],[1,0,0]],[[x0,y1],[x0,y0],[-1,0,0]]].forEach(([bl,br,nn],k2)=>{
      const Wd=Math.hypot(br[0]-bl[0],br[1]-bl[1]),bw=Wd/Math.max(1,Math.round(Wd/bw0));SKY.mat(5,style,seed,8<<4).col(tint[0],tint[1],tint[2],Math.round((bw-1)/3*255));
      SKY.at(cx,-cy).quadP(W(bl[0],bl[1],g),W(br[0],br[1],g),W(br[0],br[1],H),W(bl[0],bl[1],H),[[k2*64*bw,0],[k2*64*bw+Wd,0],[k2*64*bw+Wd,H],[k2*64*bw,H]],nn);});
    SKY.mat(6).col(255,0,0,255);SKY.at(cx,-cy).quadP(W(x0,y0,H),W(x1,y0,H),W(x1,y1,H),W(x0,y1,H),[[0,0],[1,0],[1,1],[0,1]],[0,1,0]);
    if(H>140){SKY.mat(7,60,7).col(255,30,20);SKY.at(cx,-cy).sphere(W(cx,cy,H+1.5),.6,5,3);}}
  for(const [k,B] of SKY.tiles)C.tiles.set('sky'+k,B);
  info.spawn={x:4.2,y:-60,yaw:Math.PI/2};
  return {geo:C.pack(),lights,steam,info};
}
