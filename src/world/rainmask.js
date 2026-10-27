/* =====================================================================================
   RAIN MASK — a 2 m grid over the city: ground height (for splashes) and how open to the
   sky each spot is (0 in the tunnel, partial under the railway deck).
   ===================================================================================== */
export function buildRainMask(T,city,{x0=-340,z0=-600,size=860,cell=2}={}){
  const n=Math.ceil(size/cell),data=new Float32Array(n*n*2);
  const tun=city.info.tunnel,el=city.info.el;
  let hint=-1;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const X=x0+(i+.5)*cell,Z=z0+(j+.5)*cell,mx=X,my=-Z;
    let h=.15,open=1;
    const k=T.nearest(mx,my,1);
    if(k>=0&&Math.hypot(T.mx[k]-mx,T.my[k]-my)<16){const L=T.locate(X,Z,k);
      if(L){const ad=Math.abs(L.d);if(ad<T.wl+4.5){h=ad<=T.wl?T.surf(L.s,L.d).y:T.yAt(L.s)+.12;
        if(tun&&L.s>tun[0]-1&&L.s<tun[1]+1&&ad<T.wl+.6)open=0;}}}
    else h=.0;
    if(el&&Math.abs(mx-el.x)<4.2&&my>el.y0&&my<el.y1)open=Math.min(open,.35);
    if(tun&&mx>-130&&mx<-82&&my>205&&my<275)open=0;
    data[(j*n+i)*2]=h;data[(j*n+i)*2+1]=open;
  }
  return {n,data,params:[x0,z0,1/size,n]};
}
