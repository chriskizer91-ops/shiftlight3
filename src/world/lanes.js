/* =====================================================================================
   LANES — the city's road network as the traffic sees it: every lane a polyline with its
   direction of travel, joined into a graph.
     road lanes   along each street between two intersections, one per lane per direction
     connectors   across each intersection: straight on, right from the kerb lane, left from
                  the inside lane; each knows which other connectors it would cross
     expressway   two lanes each way around the elevated ring, closed loops
     ramps        one lane each; off-ramps leave the expressway's kerb lane and land on the
                  boulevard's kerb lane, on-ramps do the reverse
   Joins that happen part way along a lane (ramps, lane changes) are "branches": at s on this
   lane you may move to s' on that one, offset sideways by lat (which the car then closes).
   Map coordinates: x east, y north, h up. A lane's right is (ty, -tx).
   ===================================================================================== */
import {GRID,RING,CORNER,ROADS,HWY,DECK_H} from './citymap.js';

const SPEED={ring:17,main:15.5,ave:14,street:11.5,hwy:27,ramp:17};
const LAT_ACC=2.6;          /* m/s^2 the traffic is happy to corner at */

export class Lane{
  constructor(pts,{kind,closed=false,step=2}={}){
    /* resample evenly */
    const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
    if(closed)cum.push(cum[cum.length-1]+Math.hypot(pts[0][0]-pts[pts.length-1][0],pts[0][1]-pts[pts.length-1][1]));
    const P=closed?[...pts,pts[0]]:pts,total=cum[cum.length-1];
    const N=closed?Math.max(4,Math.round(total/step)):Math.max(2,Math.round(total/step)+1),ds=closed?total/N:total/Math.max(1,N-1);
    this.x=new Float64Array(N);this.y=new Float64Array(N);this.h=new Float64Array(N);
    let j=0;for(let i=0;i<N;i++){const s=i*ds;while(j<cum.length-2&&cum[j+1]<s)j++;const t=Math.min(1,Math.max(0,(s-cum[j])/Math.max(1e-9,cum[j+1]-cum[j]))),a=P[j],b=P[j+1];
      this.x[i]=a[0]+(b[0]-a[0])*t;this.y[i]=a[1]+(b[1]-a[1])*t;this.h[i]=(a[2]||0)+((b[2]||0)-(a[2]||0))*t;}
    this.N=N;this.ds=ds;this.closed=closed;this.len=closed?N*ds:(N-1)*ds;this.kind=kind;
    this.next=[];this.branches=[];this.cars=[];this.conflicts=[];
    /* the fastest the traffic takes each point, from its curvature, then braked back from the corners ahead */
    const vm=new Float32Array(N);this.vmax=vm;
    for(let i=0;i<N;i++){const a=this.idx(i-2),b=this.idx(i+2);if(!closed&&(i<2||i>N-3)){vm[i]=99;continue;}
      const t0=Math.atan2(this.y[i]-this.y[a],this.x[i]-this.x[a]),t1=Math.atan2(this.y[b]-this.y[i],this.x[b]-this.x[i]);
      let da=t1-t0;da=Math.atan2(Math.sin(da),Math.cos(da));const k=Math.abs(da)/(4*ds);vm[i]=k>1e-4?Math.sqrt(LAT_ACC/k):99;}
    for(let pass=0;pass<(closed?2:1);pass++)for(let i=N-2+(closed?1:0);i>=0;i--){const n=this.idx(i+1);vm[i]=Math.min(vm[i],Math.sqrt(vm[n]*vm[n]+2*2.2*ds));}
  }
  idx(i){return this.closed?((i%this.N)+this.N)%this.N:Math.max(0,Math.min(this.N-1,i));}
  wrap(s){return this.closed?((s%this.len)+this.len)%this.len:s;}
  /* point and heading at s (map coordinates) */
  at(s){let f=this.wrap(s)/this.ds,i=Math.floor(f);f-=i;if(!this.closed){if(i>=this.N-1){i=this.N-2;f=1+(s-this.len)/this.ds;}if(i<0){i=0;f=s/this.ds;}}
    const a=this.idx(i),b=this.idx(i+1),dx=this.x[b]-this.x[a],dy=this.y[b]-this.y[a],l=Math.hypot(dx,dy)||1;
    return {x:this.x[a]+dx*f,y:this.y[a]+dy*f,h:this.h[a]+(this.h[b]-this.h[a])*Math.max(0,Math.min(1,f)),tx:dx/l,ty:dy/l,slope:(this.h[b]-this.h[a])/this.ds,i:a};}
  speedAt(s){const f=this.wrap(s)/this.ds,i=Math.floor(f);return this.vmax[this.idx(Math.max(0,i))];}
  /* where a map point is along the lane: s, and d to the right of it */
  locate(x,y,hint=-1){let i=hint;const d2=k=>(this.x[k]-x)**2+(this.y[k]-y)**2;
    if(i<0||i>=this.N){let b=1e18;for(let k=0;k<this.N;k+=4){const v=d2(k);if(v<b){b=v;i=k;}}}
    for(let it=0;it<200;it++){const a=this.idx(i-1),b=this.idx(i+1),di=d2(i);if(d2(a)<di&&a!==i)i=a;else if(d2(b)<di&&b!==i)i=b;else break;}
    let i0=i,i1=this.idx(i+1);if(!this.closed&&i>=this.N-1){i0=this.N-2;i1=this.N-1;}
    let ex=this.x[i1]-this.x[i0],ey=this.y[i1]-this.y[i0],t=((x-this.x[i0])*ex+(y-this.y[i0])*ey)/(ex*ex+ey*ey||1);
    if(t<0&&(this.closed||i0>0)){const p=this.idx(i0-1);const fx=this.x[i0]-this.x[p],fy=this.y[i0]-this.y[p],tt=((x-this.x[p])*fx+(y-this.y[p])*fy)/(fx*fx+fy*fy||1);if(tt<=1){i0=p;i1=this.idx(p+1);ex=fx;ey=fy;t=tt;}}
    const l=Math.hypot(ex,ey)||1,s=i0*this.ds+t*this.ds,px=this.x[i0]+ex*t,py=this.y[i0]+ey*t;
    return {s:this.closed?this.wrap(s):s,d:((x-px)*ey-(y-py)*ex)/l,i:i0};}
}

export function buildLanes(M){
  const lanes=[],nodes=M.nodes,add=(L)=>{L.id=lanes.length;lanes.push(L);return L;};
  const R=(tx,ty)=>[ty,-tx];
  /* ---------- road lanes ---------- */
  const roadLanes=new Map();   /* seg id -> {f:[lanes A->B by k], b:[lanes B->A]} */
  for(const sg of M.segs){const A=nodes[sg.a],B=nodes[sg.b],cls=ROADS[sg.cls],out={f:[],b:[]};roadLanes.set(sg.id,out);
    /* the centre line from A's box edge to B's, as dense points */
    let C;
    if(sg.axis==='arc'){const sgn=Math.sign(sg.a1-sg.a0),a0=sg.a0+(A.hx/sg.r)*sgn,a1=sg.a1-(B.hy/sg.r)*sgn,n=Math.ceil(Math.abs(a1-a0)*sg.r/1.5);C=[];
      for(let i=0;i<=n;i++){const a=a0+(a1-a0)*i/n;C.push([sg.cx+Math.cos(a)*sg.r,sg.cy+Math.sin(a)*sg.r]);}}
    else{const dx=B.x-A.x,dy=B.y-A.y,l=Math.hypot(dx,dy),tx=dx/l,ty=dy/l,eA=sg.axis==='x'?A.hx:A.hy,eB=sg.axis==='x'?B.hx:B.hy;
      C=[];const L=l-eA-eB,n=Math.max(1,Math.ceil(L/4));for(let i=0;i<=n;i++){const t=eA+L*i/n;C.push([A.x+tx*t,A.y+ty*t]);}}
    const tang=(P,i)=>{const a=P[Math.max(0,i-1)],b=P[Math.min(P.length-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;return [dx/l,dy/l];};
    for(const dir of [1,-1]){const P=dir>0?C:C.slice().reverse();
      for(let k=0;k<cls.lanes;k++){const off=(cls.med||0)+cls.lw*(k+.5);
        const pts=P.map((p,i)=>{const [tx,ty]=tang(P,i),[rx,ry]=R(tx,ty);return [p[0]+rx*off,p[1]+ry*off,0];});
        const L=add(new Lane(pts,{kind:'road',step:sg.axis==='arc'?1.5:4}));
        Object.assign(L,{seg:sg.id,dir,k,lanes:cls.lanes,cls:sg.cls,speed:SPEED[sg.cls],startNode:dir>0?sg.a:sg.b,node:dir>0?sg.b:sg.a,group:sg.id*2+(dir>0?0:1)});
        for(let i=0;i<L.N;i++)L.vmax[i]=Math.min(L.vmax[i],L.speed);
        const e=L.at(L.len);L.axis=Math.abs(e.tx)>Math.abs(e.ty)?0:1;
        (dir>0?out.f:out.b).push(L);}}
  }
  /* the lanes beside each other on one road, for lane changes */
  const groups=new Map();for(const L of lanes){if(!groups.has(L.group))groups.set(L.group,[]);groups.get(L.group)[L.k]=L;}
  for(const L of lanes)L.siblings=groups.get(L.group);
  /* ---------- connectors across the intersections ---------- */
  const conns=[];
  for(const n of nodes){const inc=lanes.filter(L=>L.kind==='road'&&L.node===n.id),out=lanes.filter(L=>L.kind==='road'&&L.startNode===n.id);n.conns=[];
    for(const Li of inc){const e=Li.at(Li.len);
      for(const Lo of out){if(Lo.seg===Li.seg)continue;const b=Lo.at(0),dt=e.tx*b.tx+e.ty*b.ty,cr=e.tx*b.ty-e.ty*b.tx;
        let turn=dt>.7?'S':cr>.5?'L':cr<-.5?'R':null;if(!turn)continue;
        if(turn==='S'&&Lo.k!==Math.min(Li.k,Lo.lanes-1))continue;
        if(turn==='R'&&(Li.k!==Li.lanes-1||Lo.k!==Lo.lanes-1))continue;
        if(turn==='L'&&(Li.k!==0||Lo.k!==0))continue;
        const P0=[e.x,e.y],P3=[b.x,b.y],D=Math.hypot(P3[0]-P0[0],P3[1]-P0[1]),k=turn==='S'?D/3:D*.42;
        const P1=[P0[0]+e.tx*k,P0[1]+e.ty*k],P2=[P3[0]-b.tx*k,P3[1]-b.ty*k],pts=[],nn=Math.max(2,Math.ceil(D/1.2));
        for(let i=0;i<=nn;i++){const t=i/nn,u=1-t;pts.push([u*u*u*P0[0]+3*u*u*t*P1[0]+3*u*t*t*P2[0]+t*t*t*P3[0],u*u*u*P0[1]+3*u*u*t*P1[1]+3*u*t*t*P2[1]+t*t*t*P3[1],0]);}
        const C=add(new Lane(pts,{kind:'conn',step:1.2}));
        Object.assign(C,{node:n.id,from:Li.id,to:Lo.id,turn,speed:turn==='S'?Li.speed:turn==='R'?6.5:8});
        for(let i=0;i<C.N;i++)C.vmax[i]=Math.min(C.vmax[i],C.speed);
        Li.next.push(C);C.next.push(Lo);n.conns.push(C);conns.push(C);}}
    /* which connectors cross (or join) which: they can't both be in use */
    for(let a=0;a<n.conns.length;a++)for(let b=a+1;b<n.conns.length;b++){const A=n.conns[a],B=n.conns[b];if(A.from===B.from)continue;
      let hit=A.to===B.to;
      for(let i=0;i<A.N&&!hit;i+=1)for(let j=0;j<B.N;j+=1){if((A.x[i]-B.x[j])**2+(A.y[i]-B.y[j])**2<2.4*2.4){hit=true;break;}}
      if(hit){A.conflicts.push(B);B.conflicts.push(A);}}
  }
  /* ---------- the expressway ---------- */
  const H=M.hwy,hw={};
  for(const dir of [1,-1])for(const [k,off] of [[0,HWY.lane1],[1,HWY.lane2]]){const d=dir>0?-off:off,pts=[];
    for(let i=0;i<H.N;i++){const s=(dir>0?i:(H.N-i)%H.N)*H.ds,p=H.pos(s,d);pts.push([p[0],-p[2],p[1]]);}
    const L=add(new Lane(pts,{kind:'hwy',closed:true,step:H.ds}));
    Object.assign(L,{dir,k,lanes:2,speed:SPEED.hwy,group:'hwy'+dir,node:null});for(let i=0;i<L.N;i++)L.vmax[i]=Math.min(L.vmax[i],L.speed);
    hw[dir+':'+k]=L;}
  for(const dir of [1,-1])for(const k of [0,1])hw[dir+':'+k].siblings=[hw[dir+':0'],hw[dir+':1']];
  /* the nearest boulevard lane that runs the same way as (tx, ty) */
  const ringLanes=lanes.filter(L=>L.kind==='road'&&L.cls==='ring');
  const nearestLane=(cands,x,y,tx,ty)=>{let best=null;for(const L of cands){const q=L.locate(x,y,-1);if(q.s<-1||q.s>L.len+1)continue;const a=L.at(q.s);if(a.tx*tx+a.ty*ty<.8)continue;
      const dd=Math.abs(q.d);if(!best||dd<best.dd)best={L,s:q.s,d:q.d,dd};}return best;};
  /* ---------- ramps ---------- */
  for(const r of M.ramps){const pts=[];for(let i=0;i<r.N;i++){const p=r.pos(i*r.ds,0);pts.push([p[0],-p[2],p[1]]);}
    const L=add(new Lane(pts,{kind:'ramp',step:2}));Object.assign(L,{ramp:r,rkind:r.kind,speed:SPEED.ramp,node:null,lanes:1,k:0});
    for(let i=0;i<L.N;i++)L.vmax[i]=Math.min(L.vmax[i],L.speed);
    const s0=L.at(0),s1=L.at(L.len),hwDir=r.dir;   /* clockwise ramps serve the clockwise (increasing s) carriageway */
    const HL=hw[hwDir+':1'];
    if(r.kind==='off'){
      /* leaves the expressway's kerb lane, lands on the boulevard's kerb lane */
      const q=HL.locate(s0.x,s0.y,-1);HL.branches.push({s:q.s,to:L,toS:0,lat:0,kind:'exit'});
      const g=nearestLane(ringLanes.filter(R=>R.k===R.lanes-1),s1.x,s1.y,s1.tx,s1.ty);
      if(g)L.next.push({lane:g.L,s:g.s,lat:-g.d,merge:true});
    }else{
      const g=nearestLane(ringLanes.filter(R=>R.k===R.lanes-1),s0.x,s0.y,s0.tx,s0.ty);
      if(g)g.L.branches.push({s:g.s,to:L,toS:0,lat:g.d,kind:'ramp'});
      const q=HL.locate(s1.x,s1.y,-1);L.next.push({lane:HL,s:q.s,lat:-q.d,merge:true});
    }
  }
  /* normalise: every lane's next is a list of {lane, s, lat, merge} */
  for(const L of lanes)L.next=L.next.map(x=>x instanceof Lane?{lane:x,s:0,lat:0,merge:false}:x);
  /* a spatial index of lane points for "which lane is this" */
  const B=24,grid=new Map();
  for(const L of lanes){if(L.kind==='conn')continue;for(let i=0;i<L.N;i+=2){const k=Math.floor(L.x[i]/B)+','+Math.floor(L.y[i]/B);let a=grid.get(k);if(!a)grid.set(k,a=new Set());a.add(L);}}
  const G={lanes,conns,nodes,hw,grid,B,
    /* lanes near a map point (excluding connectors) */
    near(x,y,r=1){const bx=Math.floor(x/B),by=Math.floor(y/B),out=new Set();for(let a=-r;a<=r;a++)for(let b=-r;b<=r;b++){const s=grid.get((bx+a)+','+(by+b));if(s)for(const L of s)out.add(L);}return [...out];},
    /* the best lane for a car at (x, y, h) heading (tx, ty) */
    find(x,y,h,tx,ty,maxD=6){let best=null;for(const L of G.near(x,y,1)){const q=L.locate(x,y,-1);if(q.s<0||q.s>L.len)continue;const a=L.at(q.s);if(Math.abs(a.h-h)>3)continue;
        const al=tx===undefined?1:a.tx*tx+a.ty*ty;if(al<.5)continue;const sc=Math.abs(q.d)+(1-al)*6;if(Math.abs(q.d)<maxD&&(!best||sc<best.sc))best={L,s:q.s,d:q.d,sc};}return best;}};
  return G;
}

/* the signal at a node for traffic arriving along axis (0: east-west, 1: north-south) at time t:
   2 green, 1 amber, 0 red. The shader runs exactly this cycle. */
export function signalState(n,axis,t){const c=((t+(n.sig||0)/256*36+(axis?18:0))%36+36)%36;return c<14?2:c<17?1:0;}
export function signalNext(n,axis,t){const c=((t+(n.sig||0)/256*36+(axis?18:0))%36+36)%36;return c<14?14-c:c<17?17-c:36-c;}
