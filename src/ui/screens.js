/* =====================================================================================
   SCREENS — the title menu, the career hub, the garage (parts, tuning, paint, the dyno) and
   the results. Plain HTML in one overlay, driven by the same keys and gamepad as the menu:
   up/down/left/right, enter, back, plus a few letters. Each screen is told what to show and
   calls back to the game for what to do; none of them knows about the renderer.
   ===================================================================================== */
import {PARTS,CATEGORIES,TUNE,ENGINE_PRICES,build,fits,tuneVal,CLASSES} from '../game/setup.js';
import {EVENTS,KIND_NAME,MEDALS,TIER_REP,MEDAL_LAPS,DRIFT_TARGETS} from '../game/career.js';
import {Dyno} from '../game/dyno.js';
import {SIM} from '../engine/engine-sim.js';
import {PAINTS} from '../render/car.js';

const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money=n=>'$'+Math.round(n).toLocaleString('en-US');
const fmtT=t=>{if(!(t>0))return '-:--.---';const m=Math.floor(t/60),s=t-m*60;return m+':'+(s<10?'0':'')+s.toFixed(3);};
const clsCol=c=>(CLASSES.find(x=>x.id===c)||{}).col||'#fff';
const badge=(cls,pi)=>`<span class="cls" style="--c:${clsCol(cls)}">${cls}${pi!==undefined?` <i>${pi}</i>`:''}</span>`;
const swatch=p=>`rgb(${p.col.map(c=>Math.round(Math.pow(c,1/2.2)*255)).join(',')})`;

/* ---------------- the title menu ---------------- */
export class TitleMenu{
  constructor(root,items,onPick){this.root=root;this.items=items;this.onPick=onPick;this.sel=0;
    root.addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(!b)return;this.sel=+b.dataset.i;this.render();this.onPick(this.items[this.sel].id);});
    root.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse')return;const b=e.target.closest('[data-i]');if(b&&+b.dataset.i!==this.sel){this.sel=+b.dataset.i;this.render();}});}
  set(items){this.items=items;this.sel=Math.min(this.sel,items.length-1);this.render();}
  key(k){if(k==='up')this.sel=(this.sel-1+this.items.length)%this.items.length;else if(k==='down')this.sel=(this.sel+1)%this.items.length;
    else if(k==='enter'){this.onPick(this.items[this.sel].id);return true;}else return false;this.render();return true;}
  render(){this.root.innerHTML=this.items.map((it,i)=>`<button class="ti${i===this.sel?' sel':''}" data-i="${i}"><b>${esc(it.label)}</b>${it.sub?`<span>${esc(it.sub)}</span>`:''}</button>`).join('');}
}

/* ---------------- a screen in the overlay ---------------- */
class Screen{
  constructor(root){this.root=root;this.open=false;}
  show(){this.open=true;this.root.hidden=false;this.root.className='scr '+this.kind;this.render();}
  hide(){this.open=false;this.root.hidden=true;}
}

/* ---------------- the career hub ---------------- */
export class CareerHub extends Screen{
  /* G: the game's callbacks {career, start(ev), garage(), back(), wipe()} */
  constructor(root,G){super(root);this.kind='career';this.G=G;this.sel=0;this.confirm=false;
    root.addEventListener('click',e=>{if(!this.open||this.root.className.indexOf('career')<0)return;const r=e.target.closest('[data-ev]');if(r){const i=+r.dataset.ev;if(i===this.sel)this.key('enter');else{this.sel=i;this.render();}return;}
      const a=e.target.closest('[data-act]');if(a)this.key(a.dataset.act);});}
  key(k){const C=this.G.career;
    if(k==='up')this.sel=(this.sel-1+EVENTS.length)%EVENTS.length;else if(k==='down')this.sel=(this.sel+1)%EVENTS.length;
    else if(k==='left'||k==='right'){const tiers=Object.keys(TIER_REP),cur=EVENTS[this.sel].cls,ti=(tiers.indexOf(cur)+(k==='left'?-1:1)+tiers.length)%tiers.length;this.sel=EVENTS.findIndex(e=>e.cls===tiers[ti]);}
    else if(k==='enter'){const ev=EVENTS[this.sel],ck=C.check(ev);if(ck.ok){this.G.start(ev);return true;}this.flash=ck.why;}
    else if(k==='g'){this.G.garage();return true;}else if(k==='back'){this.G.back();return true;}
    else if(k==='x'){if(this.confirm){this.G.wipe();this.confirm=false;}else{this.confirm=true;this.flash='Press X (or tap “Erase it?”) again to start a new career. This one is erased.';}}
    else return false;
    if(k!=='x')this.confirm=false;if(this.open)this.render();return true;}
  render(){
    const C=this.G.career,car=C.car(),ev=EVENTS[this.sel],rep=C.rep;
    let list='';let cls=null;
    EVENTS.forEach((e,i)=>{if(e.cls!==cls){cls=e.cls;const open=C.tierOpen(cls);list+=`<div class="tier">${badge(cls)}<span>${open?'':'🔒 '+TIER_REP[cls]+' reputation'}</span></div>`;}
      const r=C.d.results[e.id],m=r&&r.rank?MEDALS[r.rank]:'';
      list+=`<div class="ev${i===this.sel?' sel':''}${C.tierOpen(e.cls)?'':' locked'}" data-ev="${i}"><span class="k">${KIND_NAME[e.kind]}</span><b>${esc(e.name)}</b><span class="m m${r&&r.rank||0}">${e.kind==='race'&&r&&r.rank?['','1ST','2ND','3RD'][r.rank]:m}</span></div>`;});
    const r=C.d.results[ev.id]||{},ck=C.check(ev);
    const what=ev.kind==='race'?`${ev.laps} laps against five rivals (${{relaxed:'relaxed',racing:'racing',hard:'hard'}[ev.diff]}).`:ev.kind==='trial'?`${ev.laps} laps alone; your best lap counts. Medals: gold ${fmtT(MEDAL_LAPS[ev.cls][0])}, silver ${fmtT(MEDAL_LAPS[ev.cls][1])}, bronze ${fmtT(MEDAL_LAPS[ev.cls][2])}${ev.env==='rain'?' (plus 7% in the rain)':''}.`
      :ev.kind==='drift'?`${ev.time} seconds of drifting. Gold ${Math.round(DRIFT_TARGETS[ev.cls][0]*ev.time/90).toLocaleString()} points, silver ${Math.round(DRIFT_TARGETS[ev.cls][1]*ev.time/90).toLocaleString()}, bronze ${Math.round(DRIFT_TARGETS[ev.cls][2]*ev.time/90).toLocaleString()}.`
      :'One run against a class '+ev.cls+' car in the other lane. Hold the brake to stage, let go on the green.';
    const best=ev.kind==='trial'&&r.best?`Your best lap: ${fmtT(r.best)}`:ev.kind==='drift'&&r.score?`Your best: ${r.score.toLocaleString()} points`:ev.kind==='drag'&&r.et?`Your best: ${r.et.toFixed(3)} s`:'';
    this.root.innerHTML=`<div class="panel">
      <div class="top"><b class="ttl">CAREER</b><span class="money">${money(C.money)}</span><span class="rep">REP ${rep}</span><span class="car">Your car ${badge(car.cls,car.pi)} ${esc(car.spec.name)} · ${Math.round(car.kw)} kW · ${Math.round(car.kg)} kg</span></div>
      <div class="body"><div class="list">${list}</div>
        <div class="detail"><div class="dk">${KIND_NAME[ev.kind]} · ${ev.place==='loop'?'Neon Loop':'Shift City, Main Ave'} · ${{night:'Clear night',rain:'Midnight rain',dusk:'Golden hour',day:'High noon'}[ev.env]}</div>
          <h2>${esc(ev.name)}</h2><p>${esc(ev.blurb)}</p><p class="what">${esc(what)}</p>
          <div class="pay">Class ${badge(ev.cls)} and below · pays ${ev.pay.map(money).join(' / ')}</div>
          ${best?`<div class="best">${esc(best)}</div>`:''}
          ${r.rank?`<div class="got m${r.rank}">${ev.kind==='race'?['','Won','2nd place','3rd place'][r.rank]:MEDALS[r.rank]}</div>`:''}
          <div class="why">${esc(this.flash||(ck.ok?'':ck.why))}</div>
          <div class="btns"><button data-act="enter" class="go"${ck.ok?'':' disabled'}>Start</button><button data-act="g">Garage</button><button data-act="back">Back</button><button data-act="x" class="wipe">${this.confirm?'Erase it?':'New career'}</button></div></div></div>
      <div class="foot">↑ ↓ events · ← → tiers · Enter start · G garage · X new career · Esc back</div></div>`;
    this.flash=null;
    const s=this.root.querySelector('.ev.sel');if(s&&s.scrollIntoView)s.scrollIntoView({block:'nearest'});
  }
}

/* ---------------- the garage ---------------- */
const GCATS=[...CATEGORIES.map(k=>({k,name:k==='engine'?'Engine':PARTS[k].name})),{k:'tune',name:'Tuning'},{k:'paint',name:'Paint'},{k:'dyno',name:'Dyno'}];
GCATS.unshift({k:'engine',name:'Engine'});
export class Garage extends Screen{
  /* G: {career (or a sandbox with the same shape), changed(), back(), sound(on)} */
  constructor(root,G){super(root);this.kind='garage';this.G=G;this.ci=0;this.oi=0;this.col=0;this.dyno=null;this.runs=[];this.msg='';
    root.addEventListener('click',e=>{if(!this.open||this.root.className.indexOf('garage')<0)return;
      const c=e.target.closest('[data-c]');if(c){this.ci=+c.dataset.c;this.col=1;this.oi=this.cur();this.render();return;}
      const o=e.target.closest('[data-o]');if(o){const i=+o.dataset.o;if(i===this.oi&&this.col===1)this.key('enter');else{this.oi=i;this.col=1;this.render();}return;}
      const st=e.target.closest('[data-step]');if(st){this.col=1;this.oi=+st.dataset.row;this.key(+st.dataset.step>0?'right':'left');return;}
      const a=e.target.closest('[data-act]');if(a)this.key(a.dataset.act);});}
  get C(){return this.G.career;}
  cat(){return GCATS[this.ci].k;}
  /* what the middle column lists for the category */
  opts(){const k=this.cat(),S=this.C.setup;
    if(k==='engine')return Object.keys(ENGINE_PRICES).sort((a,b)=>ENGINE_PRICES[a]-ENGINE_PRICES[b]).map(id=>({id,name:SIM.PRESETS.find(p=>p.id===id).name,desc:SIM.PRESETS.find(p=>p.id===id).tag}));
    if(k==='tune')return Object.entries(TUNE).filter(([,t])=>!t.needs||t.needs(S)).map(([id,t])=>({id,name:t.name,tune:t}));
    if(k==='paint')return Object.entries(PAINTS).map(([id,p])=>({id,name:p.name,paint:p}));
    if(k==='dyno')return [{id:'pull',name:'Run a pull'},{id:'nos',name:'Run a pull with nitrous'},{id:'clear',name:'Clear the chart'}];
    return PARTS[k].opts.map((o,i)=>({id:i,name:o.name,fits:fits(S,k,i)}));}
  cur(){const k=this.cat(),S=this.C.setup,O=this.opts();if(k==='engine')return Math.max(0,O.findIndex(o=>o.id===S.engine));if(k==='paint')return Math.max(0,O.findIndex(o=>o.id===S.paint));if(k==='tune'||k==='dyno')return 0;return S[k]||0;}
  /* the setup with the highlighted option fitted, for the preview */
  preview(){const k=this.cat(),S=this.C.setup,o=this.opts()[this.oi];if(!o||k==='tune'||k==='paint'||k==='dyno')return null;
    if(k!=='engine'&&!o.fits)return null;const P=JSON.parse(JSON.stringify(S));P[k]=o.id;return P;}
  key(k){const O=this.opts();
    if(k==='done'){this.G.back();return true;}
    if(this.col===0){
      if(k==='up'){this.ci=(this.ci-1+GCATS.length)%GCATS.length;this.oi=this.cur();}else if(k==='down'){this.ci=(this.ci+1)%GCATS.length;this.oi=this.cur();}
      else if(k==='right'||k==='enter'){this.col=1;this.oi=this.cur();}else if(k==='back'){this.G.back();return true;}else if(k==='d'){this.pull(false);}else return false;}
    else{
      const o=O[this.oi],c=this.cat();
      if(k==='up')this.oi=(this.oi-1+O.length)%O.length;else if(k==='down')this.oi=(this.oi+1)%O.length;
      else if((k==='left'||k==='right')&&c==='tune'){const t=o.tune,v=tuneVal(this.C.setup,o.id),nv=Math.round((v+(k==='right'?1:-1)*t.step)/t.step)*t.step;this.C.tune(o.id,Math.max(t.min,Math.min(t.max,+nv.toFixed(4))));this.G.changed();}
      else if(k==='left'||k==='back'){this.col=0;}
      else if(k==='enter'){
        if(c==='paint'){this.C.paint(o.id);this.G.changed();}
        else if(c==='dyno'){if(o.id==='clear')this.runs=[];else this.pull(o.id==='nos');}
        else if(c==='tune'){const t=o.tune;this.C.tune(o.id,t.def);this.G.changed();this.msg=t.name+' back to '+t.fmt(t.def);}
        else{const id=c==='engine'?o.id:o.id;if(c!=='engine'&&!o.fits){this.msg='That doesn’t fit this engine.';}
          else{const was=this.C.owns(c,id),r=this.C.fit(c,id);this.msg=r.ok?(was?'Fitted: ':'Bought and fitted: ')+o.name:r.msg;if(r.ok)this.G.changed();}}}
      else if(k==='d')this.pull(false);
      else return false;}
    if(this.open)this.render();return true;}
  /* the dyno: a pull of the car as it stands */
  pull(nos){const b=build(this.C.setup);this.dyno=new Dyno(b.chassis,b.spec,{nos});this.dyno.start();this.dynoNos=nos;this.G.sound(this.dyno);this.msg='';this.ci=GCATS.findIndex(c=>c.k==='dyno');this.col=1;}
  step(dt){if(!this.dyno)return;const was=this.dyno.state;this.dyno.step(dt);
    if(was==='pull'&&this.dyno.state!=='pull'){const b=build(this.C.setup);this.runs.push({label:`${b.spec.name}${this.dynoNos?' + N2O':''}`,samples:this.dyno.samples,peak:this.dyno.peak});if(this.runs.length>3)this.runs.shift();this.render();}
    if(this.open&&this.dyno.state==='pull')this.drawChart();}
  render(){
    const C=this.C,S=C.setup,cur=build(S),O=this.opts(),cat=this.cat(),pv=this.preview(),nb=pv?build(pv):null;
    const d=(a,b,f=x=>Math.round(x),inv=false)=>b===null||b===undefined||Math.abs(b-a)<1e-6?'':`<i class="${(b>a)!==inv?'up':'dn'}">→ ${f(b)}</i>`;
    const cats=GCATS.map((c,i)=>`<div class="c${i===this.ci?' sel':''}${this.col===0&&i===this.ci?' foc':''}" data-c="${i}">${esc(c.name)}</div>`).join('');
    let opts='';
    O.forEach((o,i)=>{const sel=i===this.oi?' sel':'',foc=this.col===1&&i===this.oi?' foc':'';
      if(cat==='tune'){const t=o.tune,v=tuneVal(S,o.id),f=(v-t.min)/(t.max-t.min);
        opts+=`<div class="o tune${sel}${foc}" data-o="${i}"><b>${esc(o.name)}</b><span class="tv"><button data-step="-1" data-row="${i}">◀</button><span class="bar"><i style="width:${(f*100).toFixed(1)}%"></i></span><button data-step="1" data-row="${i}">▶</button></span><span class="pr">${esc(t.fmt(v))}</span></div>`;return;}
      if(cat==='paint'){opts+=`<div class="o${sel}${foc}" data-o="${i}"><span class="sw" style="--sw:${swatch(o.paint)}"></span><b>${esc(o.name)}</b><span class="pr">${S.paint===o.id?'on the car':'free'}</span></div>`;return;}
      if(cat==='dyno'){opts+=`<div class="o${sel}${foc}" data-o="${i}"><b>${esc(o.name)}</b></div>`;return;}
      const fitted=cat==='engine'?S.engine===o.id:S[cat]===o.id,owned=C.owns(cat,o.id),price=C.price(cat,o.id);
      const tag=fitted?'<span class="pr on">fitted</span>':owned?'<span class="pr">owned</span>':`<span class="pr${price>C.money?' no':''}">${money(price)}</span>`;
      opts+=`<div class="o${sel}${foc}${cat!=='engine'&&!o.fits?' nofit':''}" data-o="${i}"><b>${esc(o.name)}</b>${tag}${o.desc&&i===this.oi?`<span class="ds">${esc(o.desc)}</span>`:''}</div>`;});
    const st=[['Class',badge(cur.cls,cur.pi),nb?(nb.pi!==cur.pi?`<i class="${nb.pi>cur.pi?'up':'dn'}">→ ${badge(nb.cls,nb.pi)}</i>`:''):''],
      ['Power',`${Math.round(cur.kw)} kW · ${Math.round(cur.hp)} hp`,nb?d(cur.kw,nb.kw,x=>Math.round(x)+' kW'):''],
      ['Torque',`${Math.round(cur.tq)} N m`,nb?d(cur.tq,nb.tq,x=>Math.round(x)+' N m'):''],
      ['Weight',`${Math.round(cur.kg)} kg`,nb?d(cur.kg,nb.kg,x=>Math.round(x)+' kg',true):''],
      ['Grip',`${cur.chassis.tyre.mu.toFixed(2)} μ`,nb?d(cur.chassis.tyre.mu,nb.chassis.tyre.mu,x=>x.toFixed(2)+' μ'):''],
      ['Est. lap',fmtT(cur.lap),nb?d(cur.lap,nb.lap,fmtT,true):'']];
    this.root.innerHTML=`<div class="panel">
      <div class="top"><b class="ttl">GARAGE</b><span class="money">${C.free?'FREE PLAY':money(C.money)}</span>${C.rep!==undefined?`<span class="rep">REP ${C.rep}</span>`:''}<span class="car">${esc(cur.spec.name)} · ${cur.spec.drv} · ${badge(cur.cls,cur.pi)}</span><span class="btns"><button data-act="done" class="go">Done</button></span></div>
      <div class="body"><div class="cats">${cats}</div><div class="opts">${opts}</div></div>
      <div class="info"><div class="stats">${st.map(([a,b,c])=>`<div><span>${a}</span><b>${b}</b>${c||''}</div>`).join('')}</div>
        <div class="chart"><canvas width="900" height="260"></canvas><div class="legend">${this.legend()}</div></div></div>
      <div class="msg">${esc(this.msg)}</div>
      <div class="foot">${this.col===0?'↑ ↓ choose · → or Enter open · D dyno pull · Esc done':cat==='tune'?'↑ ↓ choose · ← → adjust · Enter reset · Esc back':'↑ ↓ choose · Enter '+(cat==='dyno'?'run':cat==='paint'?'paint':'buy / fit')+' · ← back · D dyno pull'}</div></div>`;
    this.msg='';this.drawChart(pv);
    const s=this.root.querySelector('.opts .sel');if(s&&s.scrollIntoView)s.scrollIntoView({block:'nearest'});
  }
  legend(){const cols=['#ff4fa0','#4fe3ff','#ffd23f'];
    return this.runs.map((r,i)=>`<span style="color:${cols[(i+3-this.runs.length)%3]}">${esc(r.label)}: ${Math.round(r.peak.kw)} kW at the wheels (${Math.round(r.peak.hp)} hp) @ ${r.peak.rpm} · ${Math.round(r.peak.tq)} N m</span>`).join('')||'<span>Dashed: the engine on paper. Run a pull (D) to measure it at the wheels.</span>';}
  /* power and torque against rpm: the paper curve dashed (and the preview's), measured pulls solid */
  drawChart(pv){
    const cv=this.root.querySelector('canvas');if(!cv)return;const g=cv.getContext('2d'),W=cv.width,H=cv.height,pad=38;g.clearRect(0,0,W,H);
    const b=build(this.C.setup,{noPI:true}),paper=Dyno.curve(b.spec),pp=pv?Dyno.curve(build(pv,{noPI:true}).spec):null;
    const live=this.dyno&&this.dyno.state==='pull'?this.dyno.samples:null;
    const all=[paper,pp,live,...this.runs.map(r=>r.samples)].filter(Boolean).flat();
    const rmax=Math.max(...all.map(p=>p.rpm))*1.02,kmax=Math.max(50,...all.map(p=>p.kw))*1.15,tmax=Math.max(100,...all.map(p=>p.tq))*1.15;
    const X=r=>pad+(W-2*pad)*r/rmax,Yk=k=>H-pad-(H-2*pad)*k/kmax,Yt=t=>H-pad-(H-2*pad)*t/tmax;
    g.strokeStyle='rgba(200,190,230,.12)';g.lineWidth=1;g.font='13px ui-monospace,monospace';g.fillStyle='rgba(200,190,230,.5)';
    for(let r=1000;r<rmax;r+=1000){g.beginPath();g.moveTo(X(r),pad*.5);g.lineTo(X(r),H-pad);g.stroke();if(r%2000===0||rmax<9000)g.fillText((r/1000)+'k',X(r)-8,H-pad+18);}
    g.fillText('kW',6,pad*.6);g.fillText('N m',W-pad+4,pad*.6);
    for(let k=0;k<=kmax;k+=Math.max(50,Math.round(kmax/5/50)*50)){g.fillText(String(k),4,Yk(k)+4);}
    const line=(pts,f,col,dash,w=2)=>{if(!pts||!pts.length)return;g.setLineDash(dash||[]);g.strokeStyle=col;g.lineWidth=w;g.beginPath();pts.forEach((p,i)=>{const x=X(p.rpm),y=f(p);i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();g.setLineDash([]);};
    line(paper,p=>Yk(p.kw),'rgba(255,79,160,.55)',[6,6]);line(paper,p=>Yt(p.tq),'rgba(79,227,255,.45)',[6,6]);
    if(pp){line(pp,p=>Yk(p.kw),'rgba(255,210,63,.8)',[2,5]);line(pp,p=>Yt(p.tq),'rgba(255,210,63,.5)',[2,5]);}
    const cols=['#ff4fa0','#4fe3ff','#ffd23f'];
    this.runs.forEach((r,i)=>{const c=cols[(i+3-this.runs.length)%3];line(r.samples,p=>Yk(p.kw),c,null,2.5);line(r.samples,p=>Yt(p.tq),c+'99',null,1.5);});
    if(live){line(live,p=>Yk(p.kw),'#fff',null,3);line(live,p=>Yt(p.tq),'rgba(255,255,255,.6)',null,2);
      const L=this.dyno.live;g.fillStyle='#fff';g.font='bold 20px ui-monospace,monospace';g.fillText(`${Math.round(L.rpm)} rpm  ${Math.round(L.kw)} kW  ${Math.round(L.speed*3.6)} km/h${L.boost>.05?'  '+(L.boost*(this.dyno.e.fiBoost||1)).toFixed(2)+' bar':''}`,pad+10,pad+8);}
  }
}

/* ---------------- results ---------------- */
export class Results extends Screen{
  constructor(root,G){super(root);this.kind='results';this.G=G;this.sel=0;this.data=null;
    root.addEventListener('click',e=>{if(!this.open||this.root.className.indexOf('results')<0)return;const a=e.target.closest('[data-b]');if(a){this.sel=+a.dataset.b;this.key('enter');}});}
  set(data){this.data=data;this.sel=0;}
  key(k){const B=this.data.buttons;if(k==='left'||k==='up')this.sel=(this.sel-1+B.length)%B.length;else if(k==='right'||k==='down')this.sel=(this.sel+1)%B.length;
    else if(k==='enter'){B[this.sel].act();return true;}else if(k==='back'){B[B.length-1].act();return true;}else return false;this.render();return true;}
  render(){const D=this.data;if(!D)return;
    const medal=D.rank?`<div class="medal m${D.rank}">${esc(D.medal)}</div>`:`<div class="medal m0">${esc(D.medal||'No medal')}</div>`;
    this.root.innerHTML=`<div class="panel"><div class="kind">${esc(D.title)}</div><h2>${esc(D.name)}</h2>${medal}<div class="sum">${esc(D.summary||'')}</div>
      <div class="rows">${D.rows.map(r=>`<div class="${r.you?'you':''}">${esc(r.text||r)}</div>`).join('')}</div>
      ${D.reward?`<div class="reward">${D.reward.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}
      <div class="btns">${D.buttons.map((b,i)=>`<button data-b="${i}" class="${i===this.sel?'sel':''}">${esc(b.label)}</button>`).join('')}</div></div>`;}
}
