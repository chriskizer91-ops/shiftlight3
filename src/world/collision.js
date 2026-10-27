/* Collision worlds the vehicle can drive on. Each answers four questions:
   locate(p, hint)     -> where a point is along the track ({s, d, i}) or null
   ground(x, z, hint)  -> the surface under a point: {y, n, surf, i}
   raycast(o, dir, maxT, hint) -> {t, p, n, surf, i} or null
   wall(P, loc)        -> barrier contact {pen, n} or null */
const UP=[0,1,0];

/* an endless flat car park, for tests */
export class PlaneWorld{
  constructor(y=0,mu='road'){this.y=y;this.surf=mu;}
  locate(){return null;}
  ground(){return {y:this.y,n:UP,surf:this.surf,i:-1};}
  raycast(o,dir,maxT){if(dir[1]>=-1e-6)return null;const t=(this.y-o[1])/dir[1];if(t<0||t>maxT)return null;return {t,p:[o[0]+dir[0]*t,this.y,o[2]+dir[2]*t],n:UP,surf:this.surf,i:-1};}
  wall(){return null;}
}

/* a spline street circuit: banked road, curbs and shoulders, concrete barriers either side */
export class TrackWorld{
  constructor(T){this.T=T;}
  locate(p,hint=-1){return this.T.locate(p[0],p[2],hint);}
  ground(x,z,hint=-1){
    const T=this.T,L=T.locate(x,z,hint);
    if(!L)return {y:0,n:UP,surf:'ground',i:-1};
    const ad=Math.abs(L.d),lim=(L.d>0?T.wl:T.wr)+.5;
    if(ad<=lim){const S=T.surf(L.s,L.d);
      const surf=ad<=T.hw?'road':ad<T.hw+.9&&T.curbAt(L.s,L.d)?'curb':'shoulder';
      return {y:S.y,n:S.n,surf,i:L.i,s:L.s,d:L.d};}
    /* behind the barriers: the pavement, level with the road edge */
    return {y:T.yAt(L.s)+.12,n:UP,surf:'ground',i:L.i,s:L.s,d:L.d};
  }
  /* march down the ray against the tangent plane of the surface below the current estimate */
  raycast(o,dir,maxT,hint=-1){
    let t=0,g=null;
    for(let k=0;k<4;k++){
      const x=o[0]+dir[0]*t,z=o[2]+dir[2]*t;g=this.ground(x,z,hint);hint=g.i;
      const den=dir[0]*g.n[0]+dir[1]*g.n[1]+dir[2]*g.n[2];if(den>-1e-4)return null;
      const nt=((x-o[0])*g.n[0]+(g.y-o[1])*g.n[1]+(z-o[2])*g.n[2])/den;
      if(Math.abs(nt-t)<1e-4){t=nt;break;}t=nt;
    }
    if(t<0||t>maxT)return null;
    return {t,p:[o[0]+dir[0]*t,o[1]+dir[1]*t,o[2]+dir[2]*t],n:g.n,surf:g.surf,i:g.i};
  }
  /* the barriers stand at d = +wl (left) and d = -wr (right); their faces push back toward the road */
  wall(P,loc){
    if(!loc)return null;const T=this.T;let pen=0,side=0;
    if(loc.d>T.wl){pen=loc.d-T.wl;side=1;}else if(loc.d<-T.wr){pen=-T.wr-loc.d;side=-1;}
    if(!side)return null;
    const th=T.headAt(loc.s),lx=-Math.sin(th),lz=-Math.cos(th);
    return {pen,n:[-lx*side,0,-lz*side]};
  }
}
