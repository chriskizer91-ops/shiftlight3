/* =====================================================================================
   HUD — drawn in LED dots, the HyperDot way: every readout is the 5x7 font made of round
   lamps (unlit lamps show faintly, like a real panel). In LED mode the same layout is drawn
   one pixel per dot into the matrix so the dot pass turns it into lamps itself.
   With touch controls on (this.touch) the layout moves out of the thumbs' way: the tachometer
   goes to the bottom middle, the minimap steps left of the buttons, the assist lamps go.
   this.ins: the screen's safe-area insets (the notch); this.ui: a scale-up for small screens;
   this.mapRight / this.replayBar: where the touch buttons start, top right and along the bottom.
   ===================================================================================== */
import {G5,G3} from './font.js';

const C={white:'#f4f2ff',cyan:'#4fe3ff',pink:'#ff4fa0',amber:'#ffb040',red:'#ff3d5a',green:'#5dff7a',violet:'#a878ff',dim:'rgba(200,190,230,.10)',ink:'#e8e4f2',faint:'rgba(232,228,242,.55)'};
const fmtT=t=>{if(!(t>0))return '-:--.---';const m=Math.floor(t/60),s=t-m*60;return m+':'+(s<10?'0':'')+s.toFixed(3);};

export class HUD{
  constructor(canvas){this.c=canvas;this.g=canvas.getContext('2d');this.led=null;this.msg=null;this.msgT=0;this.mapPath=null;this.flash=0;
    this.touch=false;this.ui=1;this.ins={l:0,r:0,t:0,b:0};this.mapRight=0;this.replayBar=0;}
  message(text,col=C.white,dur=2.2){this.msg={text,col};this.msgT=dur;}
  /* the minimap outline, normalised to a unit box once */
  /* the minimap: polylines in map coordinates, fitted into a square once */
  setMap(map){let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;const all=[...map.paths.flatMap(p=>p.pts),...(map.hwy||[])];
    for(const [x,y] of all){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    const sc=1/Math.max(x1-x0,y1-y0);this.map={...map,x0,y0,sc,w:(x1-x0)*sc,h:(y1-y0)*sc};}
  /* ------------ dot primitives ------------ */
  dots(ctx,str,x,y,p,col,{r=.38,unlit=true,glow=true,align='l',font=5}={}){
    str=String(str);
    if(this.pixel){p=Math.max(1,Math.round(p));x=Math.round(x);y=Math.round(y);}
    const w=str.length*6*p-p;if(align==='c')x-=Math.round(w/2);else if(align==='r')x-=w;
    if(this.pixel){ctx.fillStyle=col;const d=Math.max(1,p-(p>2?1:0));
      for(const ch of str){const g=G5[ch]||G5[ch.toUpperCase()]||G5[' '];for(let row=0;row<7;row++)for(let c=0;c<5;c++)if(g&&((g[row]>>(4-c))&1))ctx.fillRect(x+c*p,y+row*p,d,d);x+=6*p;}
      return w;}
    const R=p*r;
    for(const ch of str){const g=G5[ch]||G5[ch.toUpperCase()]||G5[' '];
      for(let row=0;row<7;row++)for(let c=0;c<5;c++){const on=g&&((g[row]>>(4-c))&1);const cx=x+c*p+p/2,cy=y+row*p+p/2;
        if(on){if(glow){ctx.fillStyle=col;ctx.globalAlpha=.16;ctx.beginPath();ctx.arc(cx,cy,R*2.1,0,6.283);ctx.fill();ctx.globalAlpha=1;}
          ctx.fillStyle=col;ctx.beginPath();ctx.arc(cx,cy,R,0,6.283);ctx.fill();}
        else if(unlit){ctx.fillStyle=C.dim;ctx.beginPath();ctx.arc(cx,cy,R*.8,0,6.283);ctx.fill();}}
      x+=6*p;}
    return w;
  }
  small(ctx,str,x,y,p,col,align='l'){/* the 3x5 font as square dots, for labels */
    str=String(str);if(this.pixel){p=Math.max(1,Math.round(p));x=Math.round(x);y=Math.round(y);}let w=0;for(const ch of str){const g=G3[ch]||G3[ch.toUpperCase()];w+=((g?g[0].length:3)+1)*p;}w-=p;
    if(align==='c')x-=w/2;else if(align==='r')x-=w;ctx.fillStyle=col;
    for(const ch of str){const g=G3[ch]||G3[ch.toUpperCase()];if(!g){x+=4*p;continue;}
      for(let r=0;r<5;r++){const row=g[r];for(let c=0;c<row.length;c++)if(row.charCodeAt(c)===49)ctx.fillRect(x+c*p,y+r*p,p*.86,p*.86);}
      x+=(g[0].length+1)*p;}
    return w;
  }
  /* ------------ the frame ------------ */
  draw(S,dt){
    const ctx=this.g,W=this.c.width,H=this.c.height;ctx.clearRect(0,0,W,H);
    if(!S||S.hidden)return;
    const T=this.touch,I=this.ins,s=Math.min(W/1920,H/1080)*(this.pixel?1.25:1)*(T&&!this.pixel?this.ui:1),pad=44*s;ctx.imageSmoothingEnabled=!this.pixel;
    this.flash+=dt;if(this.msgT>0)this.msgT-=dt;
    ctx.save();
    if(S.replay){/* the replay: what's playing, a timeline, the keys */
      const R=S.replay,mm=t=>Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
      const px=pad+I.l,py=pad+I.t;
      if((this.flash*2|0)%2===0||R.paused){ctx.fillStyle=C.red;ctx.beginPath();ctx.arc(px+10*s,py+12*s,9*s,0,6.283);ctx.fill();}
      this.small(ctx,'REPLAY',px+30*s,py+3*s,5*s,C.white);
      this.small(ctx,R.cam.toUpperCase()+' CAMERA  X'+(R.speed<1?R.speed.toFixed(2).replace(/0$/,''):R.speed)+(R.paused?'  PAUSED':''),px+30*s,py+40*s,3*s,C.faint);
      const bw=W-2*pad-200*s-I.l-I.r,bx=pad+100*s+I.l,by=T&&this.replayBar?H-this.replayBar-26*s:H-pad-40*s;ctx.fillStyle='rgba(200,190,230,.15)';ctx.fillRect(bx,by,bw,8*s);ctx.fillStyle=C.pink;ctx.fillRect(bx,by,bw*Math.min(1,R.t/Math.max(.1,R.dur)),8*s);
      this.small(ctx,mm(R.t),bx-14*s,by-1*s,3*s,C.ink,'r');this.small(ctx,mm(R.dur),bx+bw+14*s,by-1*s,3*s,C.ink);
      if(!T)this.small(ctx,'SPACE PLAY/PAUSE · LEFT/RIGHT 5 S · UP/DOWN SPEED · C CAMERA · ESC BACK',W/2,by+24*s,3*s,C.faint,'c');
      ctx.restore();return;}
    /* ---- tachometer: an arc of LED segments, the shift light at the top ---- */
    const sT=T?s*.72:s;
    {const s=sT;
    const nb=(S.boostMax>0)+(S.nosMax>0),cx=T?W/2+12*s:W-pad-250*s-I.r,cy=T?H-Math.max(pad*.45,I.b)-(64+nb*24)*s:H-pad-150*s,Rr=210*s,n=34;
    const frac=S.rpm/S.limiter,shift=S.rpm>S.shiftRpm*.985;
    const a0=Math.PI*1.08,a1=Math.PI*1.92;
    for(let i=0;i<n;i++){const t=i/(n-1),a=a0+(a1-a0)*t,lit=t<=frac;
      const col=t>S.shiftRpm/S.limiter?C.red:t>(S.shiftRpm/S.limiter)*.86?C.amber:C.cyan;
      const x0=cx+Math.cos(a)*Rr,y0=cy+Math.sin(a)*Rr,x1=cx+Math.cos(a)*(Rr-26*s),y1=cy+Math.sin(a)*(Rr-26*s);
      ctx.lineCap='round';
      if(lit){ctx.strokeStyle=col;ctx.globalAlpha=.25;ctx.lineWidth=13*s;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();ctx.globalAlpha=1;ctx.lineWidth=6*s;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();}
      else{ctx.strokeStyle='rgba(200,190,230,.10)';ctx.lineWidth=6*s;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();}}
    if(shift&&(this.flash*12|0)%2===0){ctx.fillStyle=C.red;ctx.globalAlpha=.85;for(const d of [-1,1]){ctx.beginPath();ctx.arc(cx+d*36*s,cy-Rr-26*s,9*s,0,6.283);ctx.fill();}ctx.globalAlpha=1;}
    /* ---- speed, gear ---- */
    const kmh=Math.round(Math.abs(S.speed)*3.6),sp=String(kmh).padStart(3,' ');
    this.dots(ctx,sp,cx-12*s,cy-74*s,15*s,C.white,{align:'c'});
    this.small(ctx,S.units||'KM/H',cx-12*s,cy+42*s,4*s,C.faint,'c');
    const gear=S.rev?'R':S.gear===0?'N':String(S.gear);
    this.dots(ctx,gear,cx+150*s,cy-60*s,11*s,S.shiftLamp?C.red:C.pink,{align:'c'});
    this.small(ctx,S.auto?'AUTO':'MAN',cx+150*s,cy+30*s,3*s,C.faint,'c');
    /* boost and nitrous */
    let by=cy+72*s;
    if(S.boostMax>0){const b=Math.max(0,S.boost),bw=230*s;this.small(ctx,'BOOST',cx-130*s,by,3*s,C.faint);
      ctx.fillStyle='rgba(200,190,230,.12)';ctx.fillRect(cx-70*s,by,bw,12*s);ctx.fillStyle=C.violet;ctx.fillRect(cx-70*s,by,bw*Math.min(1,b/S.boostMax),12*s);
      this.small(ctx,(b*1).toFixed(1)+' BAR',cx+170*s,by,3*s,C.faint);by+=24*s;}
    if(S.nosMax>0){this.small(ctx,'N2O',cx-130*s,by,3*s,C.faint);const bw=230*s;ctx.fillStyle='rgba(200,190,230,.12)';ctx.fillRect(cx-70*s,by,bw,12*s);
      ctx.fillStyle=S.nosOn?C.white:C.cyan;ctx.fillRect(cx-70*s,by,bw*S.nos,12*s);}}
    /* ---- laps, or where you are ---- */
    const lx=pad+I.l,ly=pad+I.t;
    this.small(ctx,S.levelName||'NEON LOOP',lx,ly,4*s,C.pink);
    if(S.race){
      /* the race: position big at the top, laps, the order down the left */
      this.dots(ctx,'P'+S.pos,W/2-40*s,pad,11*s,S.pos===1?C.green:C.white,{align:'c'});
      this.small(ctx,'/'+S.n,W/2+60*s,pad+46*s,4*s,C.faint);
      this.small(ctx,'LAP '+S.lap+'/'+S.laps,lx,ly+34*s,4*s,C.faint);
      this.dots(ctx,fmtT(S.lapT),lx,ly+60*s,6*s,C.white,{unlit:false});
      this.small(ctx,'BEST',lx,ly+118*s,3*s,C.faint);this.small(ctx,fmtT(S.best),lx+70*s,ly+118*s,3*s,S.best>0?C.green:C.faint);
      this.small(ctx,'LAST',lx,ly+140*s,3*s,C.faint);this.small(ctx,fmtT(S.last),lx+70*s,ly+140*s,3*s,C.ink);
      let ty=ly+190*s;
      for(const [i,r] of S.tower.entries()){const col=r.you?C.pink:C.ink;
        ctx.fillStyle=r.you?'rgba(255,79,160,.16)':'rgba(10,8,20,.35)';ctx.fillRect(lx-8*s,ty-6*s,300*s,26*s);
        this.small(ctx,String(i+1),lx,ty,3*s,C.faint);this.small(ctx,r.name,lx+34*s,ty,3*s,col);
        const g=r.dnf?'DNF':r.gap===null?(r.finished?'FIN':''):(r.gap>=0?'+':'-')+Math.abs(r.gap).toFixed(1);this.small(ctx,g,lx+200*s,ty,3*s,C.faint);ty+=30*s;}
    }
    else if(S.trial){
      this.small(ctx,'LAP '+S.lap+(isFinite(S.laps)?'/'+S.laps:''),lx,ly+34*s,4*s,C.faint);
      this.dots(ctx,fmtT(S.lapT),lx,ly+60*s,6*s,S.invalid?C.red:C.white,{unlit:false});
      this.small(ctx,'BEST',lx,ly+118*s,3*s,C.faint);this.small(ctx,fmtT(S.best),lx+70*s,ly+118*s,3*s,S.best>0?C.green:C.faint);
      this.small(ctx,'LAST',lx,ly+140*s,3*s,C.faint);this.small(ctx,fmtT(S.last),lx+70*s,ly+140*s,3*s,C.ink);
      if(S.delta!==null&&S.delta!==undefined){const d=S.delta;this.dots(ctx,(d>=0?'+':'-')+Math.abs(d).toFixed(2),W/2,pad,7*s,d>0?C.red:C.green,{align:'c',unlit:false});this.small(ctx,'GHOST',W/2,pad+58*s,3*s,C.faint,'c');}
      if(S.medals){const M=[['GOLD','#ffd23f'],['SILVER','#c8d0dc'],['BRONZE','#d88b4a']];M.forEach(([n,c],i)=>{const got=S.best>0&&S.best<=S.medals[i];
        this.small(ctx,n,lx,ly+180*s+i*24*s,3*s,got?c:C.faint);this.small(ctx,fmtT(S.medals[i]),lx+100*s,ly+180*s+i*24*s,3*s,got?c:C.ink);});}
    }
    else if(S.drift){
      const m=Math.floor(S.timeLeft/60),sec=Math.floor(S.timeLeft%60);
      this.small(ctx,'TIME',lx,ly+34*s,4*s,C.faint);this.dots(ctx,m+':'+String(sec).padStart(2,'0'),lx,ly+60*s,6*s,S.timeLeft<10?C.red:C.white,{unlit:false});
      this.dots(ctx,String(S.driftTotal),W/2,pad,9*s,C.white,{align:'c',unlit:false});this.small(ctx,'POINTS',W/2,pad+72*s,3*s,C.faint,'c');
      if(S.driftChain>0){ctx.globalAlpha=S.driftGap?1-S.driftGap*.6:1;this.dots(ctx,'+'+S.driftChain,W/2,H*.22,7*s,S.driftNear?C.amber:C.pink,{align:'c',unlit:false});
        this.small(ctx,'X'+S.driftMult.toFixed(2).replace(/\.?0+$/,''),W/2,H*.22+60*s,5*s,C.cyan,'c');ctx.globalAlpha=1;}
      /* the angle: a needle on an arc */
      {const cxA=W/2,cyA=H*.22+150*s,r=70*s,a=Math.max(-70,Math.min(70,S.driftAngle))*Math.PI/180;ctx.strokeStyle='rgba(200,190,230,.18)';ctx.lineWidth=5*s;ctx.beginPath();ctx.arc(cxA,cyA,r,Math.PI*1.11,Math.PI*1.89);ctx.stroke();
        if(S.driftOn){ctx.strokeStyle=C.pink;ctx.lineWidth=5*s;ctx.beginPath();ctx.arc(cxA,cyA,r,-Math.PI/2,-Math.PI/2+a,a<0);ctx.stroke();}}
      if(S.targets){const M=[['GOLD','#ffd23f'],['SILVER','#c8d0dc'],['BRONZE','#d88b4a']];M.forEach(([n,c],i)=>{const got=S.driftTotal>=S.targets[i];
        this.small(ctx,n,lx,ly+120*s+i*24*s,3*s,got?c:C.faint);this.small(ctx,String(S.targets[i]),lx+100*s,ly+120*s+i*24*s,3*s,got?c:C.ink);});}
    }
    else if(S.drag){
      /* the tree: two stage bulbs, three ambers (they light together), green, red */
      const tx=W/2,ty=pad+10*s,b=(y,col,on,r=15*s)=>{ctx.fillStyle='rgba(10,8,20,.75)';ctx.beginPath();ctx.arc(tx,y,r+5*s,0,6.283);ctx.fill();ctx.fillStyle=on?col:'rgba(200,190,230,.08)';
        if(on){ctx.globalAlpha=.35;ctx.beginPath();ctx.arc(tx,y,r*1.8,0,6.283);ctx.fill();ctx.globalAlpha=1;}ctx.beginPath();ctx.arc(tx,y,r,0,6.283);ctx.fill();};
      b(ty,'#fff7cc',S.tree>=1||S.staged,9*s);b(ty+28*s,'#fff7cc',S.tree>=1,9*s);
      for(let i=0;i<3;i++)b(ty+66*s+i*40*s,'#ffb040',S.tree===2);
      b(ty+66*s+3*40*s,C.green,S.tree===3&&!S.foul);b(ty+66*s+4*40*s,C.red,S.foul);
      if(S.stagePrompt)this.small(ctx,'HOLD THE BRAKE TO STAGE · ADD THROTTLE FOR REVS · LET GO ON GREEN',W/2,ty+290*s,4*s,C.amber,'c');
      this.small(ctx,'ET',lx,ly+34*s,4*s,C.faint);this.dots(ctx,S.et.toFixed(3),lx,ly+60*s,6*s,C.white,{unlit:false});
      this.small(ctx,'RT',lx,ly+118*s,3*s,C.faint);this.small(ctx,S.rt===null||S.rt===undefined?'-.---':S.rt<0?'RED':S.rt.toFixed(3),lx+60*s,ly+118*s,3*s,S.rt<0?C.red:C.ink);
      /* who's ahead: two bars to the finish */
      const bw=T?300*s:520*s,bx=T?lx+70*s:W/2-bw/2,by=T?ly+170*s:H-pad-110*s;for(const [k,v,col,name] of [[0,S.you,C.pink,'YOU'],[1,S.opp,C.cyan,S.oppName]]){const y=by+k*26*s;
        ctx.fillStyle='rgba(200,190,230,.1)';ctx.fillRect(bx,y,bw,10*s);ctx.fillStyle=col;ctx.fillRect(bx,y,bw*Math.min(1,v),10*s);this.small(ctx,name,bx-12*s,y-2*s,3*s,col,'r');}
      ctx.fillStyle=C.white;ctx.fillRect(bx+bw,by-6*s,3*s,48*s);
    }
    else if(S.laps!==false){
      this.small(ctx,'LAP '+Math.max(1,S.lap),lx,ly+34*s,4*s,C.faint);
      this.dots(ctx,fmtT(S.lapT),lx,ly+60*s,6*s,C.white,{unlit:false});
      this.small(ctx,'BEST',lx,ly+118*s,3*s,C.faint);this.small(ctx,fmtT(S.best),lx+70*s,ly+118*s,3*s,S.best>0?C.green:C.faint);
      this.small(ctx,'LAST',lx,ly+140*s,3*s,C.faint);this.small(ctx,fmtT(S.last),lx+70*s,ly+140*s,3*s,C.ink);
      if(S.delta!==null&&S.delta!==undefined&&S.best>0){const d=S.delta;this.small(ctx,(d>=0?'+':'-')+Math.abs(d).toFixed(2),lx+250*s,ly+74*s,4*s,d>0?C.red:C.green);}
    }else if(S.place){this.dots(ctx,S.place,lx,ly+34*s,5*s,C.white,{unlit:false});}
    /* the start lights (races, trials, drift runs) */
    if(S.lights>0||S.go){const r=20*s,y0=pad+140*s;for(let i=0;i<5;i++){const x=W/2+(i-2)*58*s,on=S.go?1:i<S.lights;
      ctx.fillStyle='rgba(10,8,20,.7)';ctx.beginPath();ctx.arc(x,y0,r+6*s,0,6.283);ctx.fill();
      ctx.fillStyle=S.go?C.green:on?C.red:'rgba(200,190,230,.08)';if(on){ctx.globalAlpha=.35;ctx.beginPath();ctx.arc(x,y0,r*1.7,0,6.283);ctx.fill();ctx.globalAlpha=1;}
      ctx.beginPath();ctx.arc(x,y0,r,0,6.283);ctx.fill();}}
    /* ---- minimap ---- */
    if(this.map&&this.map.paths){const M=this.map,sz=(T?190:230)*s,mx=(T&&this.mapRight?this.mapRight:W-pad-I.r)-sz,my=pad+I.t,P=(x,y)=>[mx+(x-M.x0)*M.sc*sz+(1-M.w)*sz/2,my+sz-((y-M.y0)*M.sc*sz+(1-M.h)*sz/2)];
      ctx.lineJoin='round';ctx.lineCap='round';
      const stroke=(pts,closed,w,col,a)=>{ctx.strokeStyle=col;ctx.globalAlpha=a;ctx.lineWidth=w;ctx.beginPath();pts.forEach(([x,y],i)=>{const [u,v]=P(x,y);if(i)ctx.lineTo(u,v);else ctx.moveTo(u,v);});if(closed)ctx.closePath();ctx.stroke();};
      for(const p of M.paths){stroke(p.pts,p.closed,(this.pixel?1:10*s)*p.w,C.pink,.12);}
      for(const p of M.paths){stroke(p.pts,p.closed,(this.pixel?1:3.4*s)*p.w,C.pink,.8);}
      if(M.hwy)stroke(M.hwy,true,this.pixel?1:2.4*s,C.cyan,.85);
      ctx.globalAlpha=1;
      if(M.start){const [sx,sy]=P(M.start[0],M.start[1]);ctx.fillStyle=C.white;ctx.fillRect(sx-1.5*s,sy-7*s,3*s,14*s);}
      if(S.mapDots){ctx.fillStyle='#ffb347';ctx.globalAlpha=.75;const r=this.pixel?.6:2.1*s;for(const d of S.mapDots){const [x,y]=P(d[0],d[1]);ctx.fillRect(x-r,y-r,2*r,2*r);}ctx.globalAlpha=1;}
      if(S.mapCar){const [x,y]=P(S.mapCar[0],S.mapCar[1]);ctx.fillStyle=C.white;ctx.globalAlpha=.3;ctx.beginPath();ctx.arc(x,y,12*s,0,6.283);ctx.fill();ctx.globalAlpha=1;ctx.beginPath();ctx.arc(x,y,6*s,0,6.283);ctx.fill();
        if(S.mapHead!==undefined){ctx.strokeStyle=C.white;ctx.lineWidth=2*s;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(S.mapHead)*16*s,y-Math.sin(S.mapHead)*16*s);ctx.stroke();}}}
    /* ---- assists ---- */
    const ax=pad+I.l,ay=H-pad-30*s-I.b;
    if(!T){this.small(ctx,S.assistName||'',ax,ay-40*s,3*s,C.faint);
    const lamps=[['TC',S.tc],['ABS',S.abs],['ESC',S.esc],['DRIFT',S.drift]];if(S.guide)lamps.push(['GUIDE',S.guide>.9]);
    lamps.forEach(([t,on],i)=>{const x=ax+i*86*s;
      ctx.strokeStyle=on?C.amber:'rgba(200,190,230,.18)';ctx.lineWidth=2*s;ctx.strokeRect(x,ay,74*s,26*s);
      if(on){ctx.fillStyle='rgba(255,176,64,.22)';ctx.fillRect(x,ay,74*s,26*s);}
      this.small(ctx,t,x+37*s,ay+7*s,3*s,on?C.amber:'rgba(200,190,230,.35)','c');});}
    /* a drift chain while roaming */
    if(S.freeChain>0){ctx.globalAlpha=S.freeGap?1-S.freeGap*.6:1;this.dots(ctx,'+'+S.freeChain,W/2,H*.2,6*s,C.pink,{align:'c',unlit:false});this.small(ctx,'DRIFT X'+S.freeMult.toFixed(2).replace(/\.?0+$/,''),W/2,H*.2+50*s,4*s,C.cyan,'c');ctx.globalAlpha=1;}
    /* ---- messages ---- */
    if(this.msg&&this.msgT>0){ctx.globalAlpha=Math.min(1,this.msgT*2);this.dots(ctx,this.msg.text,W/2,H*.32,9*s,this.msg.col,{align:'c',unlit:false});ctx.globalAlpha=1;}
    if(S.hint){ctx.globalAlpha=.85;this.small(ctx,S.hint,W/2,T?H*.5:H-pad-20*s,4*s,C.faint,'c');ctx.globalAlpha=1;}
    ctx.restore();
  }
}
