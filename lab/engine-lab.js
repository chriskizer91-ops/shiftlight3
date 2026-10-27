import {makeDSP} from '../src/audio/engine-dsp.js';
import {SIM} from '../src/engine/engine-sim.js';
/* =====================================================================================
   ENGINE LAB — presets, the setup sheet, hands and feet, the audio graph and the instruments.
   ===================================================================================== */
(()=>{
'use strict';
const S=SIM,TAU=Math.PI*2,clamp=S.clamp,$=id=>document.getElementById(id);
const fmt=n=>Math.round(n).toLocaleString('en-US');
const COL={};{const cs=getComputedStyle(document.documentElement);for(const k of ['bg','surface','raised','well','line','line-2','ink','ink-2','ink-3','accent','amber','bank-a','bank-b','go','blue'])COL[k]=cs.getPropertyValue('--'+k).trim();}
const FNUM='"Saira Condensed","Arial Narrow",sans-serif',FDISP='"Chakra Petch","Arial Narrow",sans-serif';
const rgba=(hex,a)=>{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`;};

/* ---------- state ---------- */
const st={preset:S.PRESETS.find(p=>p.id==='muscle'),over:{},mode:'free',listener:0,room:'open',vol:.8,
  keys:new Set(),digits:new Set(),pad:0,padOn:false,brk:false,nos:false,blipT:0,popT:-1e9,crankPh:0,glow:[],curvePts:null};
const sim=new S.EngineSim();let spec=null,audio=null,audioBusy=false;
const cur=()=>Object.assign({},S.DEFAULTS,st.preset,st.over);
function applySpec(){
  spec=S.makeSpec(cur());sim.setSpec(spec);st.curvePts=S.curve(spec,160);st.glow=new Array(spec.cyl).fill(0);
  if(audio)audio.port.post({t:'cfg',cfg:S.dspCfg(spec)});
  syncSetup();syncInfo();
}

/* ---------- the engine catalogue ---------- */
function buildPresets(){
  const box=$('presets');box.textContent='';
  for(const p of S.PRESETS){
    const s=S.makeSpec(p),b=document.createElement('button');b.type='button';b.className='preset';b.dataset.id=p.id;
    b.innerHTML=`<b></b><small></small><span class="hp">${fmt(s.peak.hp)}<em>HP</em></span>`;
    b.querySelector('b').textContent=p.name;b.querySelector('small').textContent=S.LAYOUTS[p.layout].name+(p.fi&&p.fi!=='none'?' · '+S.INDUCTION[p.fi].toLowerCase():'');
    b.addEventListener('click',()=>{st.preset=p;st.over={};applySpec();markPreset();});
    box.appendChild(b);
  }
  markPreset();
}
function markPreset(){for(const b of $('presets').children)b.setAttribute('aria-pressed',String(b.dataset.id===st.preset.id));}

/* ---------- the setup sheet ---------- */
const turbo=o=>o.fi==='turbo'||o.fi==='twin';
const SETUP=[
  {h:'Engine',rows:[
    {k:'layout',l:'Layout',t:'select',opts:()=>S.LAYOUT_IDS.map(id=>[id,S.LAYOUTS[id].name])},
    {k:'disp',l:'Displacement',t:'range',min:.6,max:9,step:.1,live:0,fmt:v=>v.toFixed(1)+' L'},
    {k:'redline',l:'Redline',t:'range',min:4000,max:20000,step:100,live:0,fmt:v=>fmt(v)+' rpm'},
    {k:'cam',l:'Camshaft',t:'seg',opts:()=>S.CAMS.map((n,i)=>[i,n])}]},
  {h:'Induction',rows:[
    {k:'fi',l:'Type',t:'select',opts:()=>Object.entries(S.INDUCTION)},
    {k:'boost',l:'Boost',t:'range',min:.2,max:2.5,step:.05,live:1,fmt:v=>v.toFixed(2)+' bar',show:o=>o.fi!=='none'},
    {k:'tsize',l:'Turbo size',t:'seg',opts:()=>S.TURBO_SIZE.map((s,i)=>[i,s.n]),show:turbo},
    {k:'bov',l:'Blow-off',t:'seg',opts:()=>[['valve','Valve'],['flutter','Flutter'],['none','None']],show:turbo},
    {k:'antilag',l:'Anti-lag',t:'toggle',show:turbo},
    {k:'intake',l:'Intake',t:'select',opts:()=>S.INTAKES.map((n,i)=>[i,n])}]},
  {h:'Exhaust',rows:[
    {k:'ex',l:'System',t:'select',opts:()=>S.EXHAUSTS.map((n,i)=>[i,n])},
    {k:'crackle',l:'Pops and crackle',t:'range',min:0,max:1,step:.05,live:1,fmt:v=>Math.round(v*100)+'%'}]},
  {h:'Gearbox and launch',rows:[
    {k:'seq',l:'Gearbox',t:'seg',opts:()=>[[0,'H-pattern'],[1,'Sequential']]},
    {k:'auto',l:'Automatic shifts',t:'toggle',sim:1},
    {k:'tc',l:'Traction control',t:'toggle',sim:1},
    {k:'gearWhine',l:'Straight-cut gears',t:'toggle'},
    {k:'launch',l:'Launch control',t:'toggle'},
    {k:'launchRpm',l:'Launch rpm',t:'range',min:2500,max:14000,step:100,live:1,fmt:v=>fmt(v)+' rpm',show:o=>o.launch},
    {k:'limiter',l:'Rev limiter',t:'seg',opts:()=>[['soft','Soft cut'],['hard','Hard cut']]}]},
  {h:'Nitrous',rows:[
    {k:'nos',l:'Shot',t:'seg',opts:()=>S.NOS_SHOTS.map((n,i)=>[i,n?String(n):'None'])}]}
];
const ROWS={};
function setVal(r,v){
  if(r.sim){sim[r.k]=!!v;return;}
  const o={};o[r.k]=v;
  /* bigger engines make more torque: keep the preset's torque per litre */
  if(r.k==='disp')o.tq=st.preset.tq/st.preset.disp*v;
  if(r.k==='redline'){const lr=cur().launchRpm;if(lr>v*.9)o.launchRpm=Math.round(v*.65/100)*100;}
  Object.assign(st.over,o);applySpec();
}
function buildSetup(){
  const box=$('setup');box.textContent='';
  for(const sec of SETUP){
    const s=document.createElement('section');s.className='sheet';const h=document.createElement('h3');h.textContent=sec.h;s.appendChild(h);
    for(const r of sec.rows){
      const row=document.createElement('div');row.className='row'+(r.t==='toggle'?' tog':'');const id='set-'+r.k;
      const head=document.createElement('div');head.className='head';const lab=document.createElement('label');lab.textContent=r.l;lab.htmlFor=id;head.appendChild(lab);row.appendChild(head);
      let el;
      if(r.t==='select'){el=document.createElement('select');el.id=id;for(const [v,n] of r.opts()){const op=document.createElement('option');op.value=String(v);op.textContent=n;el.appendChild(op);}
        el.addEventListener('change',()=>{const raw=el.value;setVal(r,/^\d+$/.test(raw)?+raw:raw);});row.appendChild(el);}
      else if(r.t==='seg'){el=document.createElement('div');el.className='seg';el.id=id;el.setAttribute('role','group');el.setAttribute('aria-label',r.l);
        for(const [v,n] of r.opts()){const b=document.createElement('button');b.type='button';b.dataset.v=String(v);b.textContent=n;b.addEventListener('click',()=>setVal(r,typeof v==='number'?v:v));el.appendChild(b);}
        row.appendChild(el);}
      else if(r.t==='range'){el=document.createElement('input');el.type='range';el.id=id;el.min=r.min;el.max=r.max;el.step=r.step;const out=document.createElement('output');out.htmlFor=id;head.appendChild(out);r.out=out;
        el.addEventListener('input',()=>{out.textContent=r.fmt(+el.value);if(r.live)setVal(r,+el.value);});
        el.addEventListener('change',()=>{if(!r.live)setVal(r,+el.value);});row.appendChild(el);}
      else{el=document.createElement('button');el.type='button';el.className='switch';el.id=id;el.setAttribute('role','switch');el.setAttribute('aria-label',r.l);
        el.addEventListener('click',()=>setVal(r,el.getAttribute('aria-checked')!=='true'?1:0));row.appendChild(el);}
      r.el=el;r.row=row;ROWS[r.k]=r;s.appendChild(row);
    }
    box.appendChild(s);
  }
  const act=document.createElement('section');act.className='sheet';
  act.innerHTML=`<h3 id="buildName">This build</h3><div class="actions"><button type="button" id="bReset">Reset to preset</button><button type="button" id="bCopy">Copy engine spec</button></div>
    <textarea id="specOut" readonly hidden rows="6" style="width:100%;margin-top:8px;background:var(--well);color:var(--ink-2);border:1px solid var(--line-2);border-radius:7px;font:12px/1.4 ui-monospace,monospace"></textarea>
    <p class="status" id="status" style="margin-top:8px">Audio starts when you start the engine.</p>`;
  box.appendChild(act);
  $('bReset').addEventListener('click',()=>{st.over={};applySpec();});
  $('bCopy').addEventListener('click',()=>{
    const o=cur(),keep=['layout','disp','redline','idle','tq','cP','cW','cA','Ie','fi','boost','tsize','antilag','bov','ex','intake','cam','crackle','seq','gearWhine','nos','launch','launchRpm','limiter','mass','drv'];
    const out={name:st.preset.name+(Object.keys(st.over).length?' (edited)':'')};for(const k of keep)if(o[k]!==undefined)out[k]=typeof o[k]==='number'?+o[k].toFixed(3):o[k];
    const txt=JSON.stringify(out,null,1),ta=$('specOut');
    const shown=()=>{ta.hidden=false;ta.value=txt;ta.select();};
    try{navigator.clipboard.writeText(txt).then(()=>{$('bCopy').textContent='Copied';setTimeout(()=>$('bCopy').textContent='Copy engine spec',1400);},shown);}catch(e){shown();}
  });
}
function syncSetup(){
  const o=cur();
  for(const k in ROWS){const r=ROWS[k],v=r.sim?sim[k]:o[k];
    if(r.row)r.row.hidden=!!(r.show&&!r.show(o));
    if(r.t==='select')r.el.value=String(v);
    else if(r.t==='seg')for(const b of r.el.children)b.setAttribute('aria-pressed',String(b.dataset.v===String(v)));
    else if(r.t==='range'){if(document.activeElement!==r.el)r.el.value=v;r.out.textContent=r.fmt(+r.el.value);}
    else r.el.setAttribute('aria-checked',String(!!v));}
}
function syncInfo(){
  const L=S.LAYOUTS[spec.layout],iv=S.bankIntervals(L),pk=spec.peak;
  $('crankName').textContent=L.name+(L.rotary?' · rotor firings':' · '+L.fire.length+' cylinders');
  const ivs=a=>a.length&&a.every(v=>v===a[0])?'every '+a[0]+'°':a.map(v=>v+'°').join(', ');
  const bankTxt=(L.dual||L.bank.some(b=>b))?` <b>Bank A</b> fires ${ivs(iv[0])}. <b>Bank B</b> fires ${ivs(iv[1])}.`:'';
  $('crankNote').innerHTML=L.note.replace(/&/g,'&amp;').replace(/</g,'&lt;')+bankTxt;
  $('curvePeak').textContent=`${fmt(pk.hp)} hp at ${fmt(pk.rpm)} · ${fmt(pk.tq)} N·m at ${fmt(pk.tqRpm)}`;
  $('curveNote').textContent=spec.fi==='none'?'Naturally aspirated. Power keeps climbing until the cams run out of breath near the redline.'
    :spec.turbo?`Boost builds from about ${fmt(spec.s0)} rpm and is all there by ${fmt(spec.s1)}. Below that you are waiting on the turbo.`
    :'A crank-driven blower makes boost from just off idle, so the torque arrives at once.';
  $('buildName').textContent=st.preset.name+(Object.keys(st.over).length?' · edited':'');
  $('mBoost').hidden=!spec.fiBoost;$('mNos').hidden=!spec.nosKw;
  $('nosTxt').textContent=spec.nosKw?S.NOS_SHOTS[spec.nos|0]+' shot':'None';
}

/* ---------- audio ---------- */
function roomIR(ctx,kind){
  const sr=ctx.sampleRate,n=Math.round(sr*{open:.5,garage:1.2,tunnel:2.4}[kind]),b=ctx.createBuffer(2,n,sr);let seed=1234567;
  const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647*2-1;};
  for(let ch=0;ch<2;ch++){const X=b.getChannelData(ch);let lp=0;
    if(kind==='tunnel'){
      /* flutter echoes bouncing between the walls, each a little duller, then a long diffuse tail */
      for(let k=1;k<44;k++){const i=Math.round((k*.036+(k&1?ch*.011:0)+rnd()*.0015)*sr);if(i>=n)break;const a=Math.pow(.8,k)*(((k+ch)&1)?.55:1);
        for(let q=0;q<90&&i+q<n;q++)X[i+q]+=a*Math.exp(-q/(5+k*1.4))*(q?rnd()*.6:1);}
      for(let i=0;i<n;i++){const t=i/sr;lp+=.3*(rnd()-lp);X[i]+=lp*.55*Math.exp(-t*2.5)*Math.min(1,t/.03);}
    }else if(kind==='garage'){
      for(const [t,a] of [[.007,.7],[.013,.5],[.019,.45],[.026,.35],[.034,.3],[.041,.28]])X[Math.round((t+ch*.0013)*sr)]+=a*(rnd()>0?1:-1);
      for(let i=0;i<n;i++){const t=i/sr;lp+=.45*(rnd()-lp);X[i]+=lp*.5*Math.exp(-t*5.8)*Math.min(1,t/.012);}
    }else{
      /* open air: a ground bounce and the slap off a distant wall */
      X[Math.round((.0045+ch*.0006)*sr)]+=.5;
      for(const [t,a,d] of [[.085,.22,12],[.16,.12,18]]){const s=Math.round((t+ch*.005)*sr);for(let q=0;q<80;q++)X[s+q]+=a*Math.exp(-q/d)*rnd();}
      for(let i=0;i<n;i++){const t=i/sr;lp+=.25*(rnd()-lp);X[i]+=lp*.12*Math.exp(-t*9)*Math.min(1,t/.02);}
    }}
  return b;
}
const ROOM_SEND={open:.28,garage:.5,tunnel:.8};
function setRoom(){if(!audio)return;const a=audio;a.conv.buffer=roomIR(a.ctx,st.room);a.send.gain.setTargetAtTime(ROOM_SEND[st.room]*(st.listener===1?.35:1),a.ctx.currentTime,.05);}
async function initAudio(){
  if(audio)return audio;
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw new Error('This browser has no Web Audio.');
  const ctx=new AC({latencyHint:'interactive'});
  const master=ctx.createGain();master.gain.value=st.vol;
  const comp=ctx.createDynamicsCompressor();comp.threshold.value=-8;comp.knee.value=6;comp.ratio.value=4;comp.attack.value=.003;comp.release.value=.15;
  master.connect(comp);comp.connect(ctx.destination);
  const an=ctx.createAnalyser();an.fftSize=4096;an.smoothingTimeConstant=.55;comp.connect(an);
  const send=ctx.createGain();send.gain.value=0;const conv=ctx.createConvolver();send.connect(conv);conv.connect(master);
  let node,port,kind;
  try{
    if(!ctx.audioWorklet)throw new Error('no worklet');
    const src=`const EngineDSP=(${makeDSP.toString()})();
class ShiftlightEngine extends AudioWorkletProcessor{
  constructor(){super();this.d=new EngineDSP(sampleRate);this.k=0;
    this.port.onmessage=e=>{const m=e.data;if(m.t==='cfg')this.d.configure(m.cfg);else if(m.t==='p')this.d.set(m.p);else if(m.t==='ev')this.d.event(m.ev);};}
  process(i,o){const out=o[0];this.d.process(out[0],out[1]||out[0],out[0].length);if(++this.k>=8){this.k=0;const s=this.d.takeStats();if(s)this.port.postMessage(s);}return true;}
}
registerProcessor('shiftlight-engine',ShiftlightEngine);`;
    /* a blob URL where the page has a real origin; a data URL where it does not (a file opened from disk) */
    try{await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([src],{type:'application/javascript'})));}
    catch(e1){await ctx.audioWorklet.addModule('data:application/javascript;charset=utf-8,'+encodeURIComponent(src));}
    node=new AudioWorkletNode(ctx,'shiftlight-engine',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
    node.port.onmessage=e=>onStats(e.data);port={post:m=>node.port.postMessage(m)};kind='audio worklet';
  }catch(err){
    /* fallback: the same synth on the main thread */
    const D=makeDSP(),d=new D(ctx.sampleRate);node=ctx.createScriptProcessor(1024,1,2);
    const silent=ctx.createConstantSource?ctx.createConstantSource():null;if(silent){silent.offset.value=0;silent.connect(node);silent.start();}
    node.onaudioprocess=ev=>{const b=ev.outputBuffer;d.process(b.getChannelData(0),b.getChannelData(1),b.length);const s=d.takeStats();if(s)onStats(s);};
    port={post:m=>{if(m.t==='cfg')d.configure(m.cfg);else if(m.t==='p')d.set(m.p);else if(m.t==='ev')d.event(m.ev);}};kind='main-thread fallback ('+(err&&err.message||err)+')';
  }
  node.connect(master);node.connect(send);
  audio={ctx,master,comp,an,send,conv,node,port,kind,td:new Float32Array(an.fftSize),fd:new Float32Array(an.frequencyBinCount)};
  setRoom();port.post({t:'cfg',cfg:S.dspCfg(spec)});
  $('status').textContent=`Synth running live in an ${kind} at ${(ctx.sampleRate/1000).toFixed(1)} kHz.`;
  return audio;
}
function onStats(s){if(s.pops)st.popT=performance.now();}
async function startEngine(){
  if(audioBusy)return;audioBusy=true;
  try{await initAudio();if(audio.ctx.state!=='running')await audio.ctx.resume();sim.start();$('cover').hidden=true;}
  catch(e){$('status').textContent='Sound could not start: '+e.message;}
  audioBusy=false;syncPower();
}
function toggleEngine(){if(!audio||sim.st==='off'||sim.st==='stopping')startEngine();else{sim.stop();syncPower();}}
function syncPower(){const on=sim.st!=='off'&&sim.st!=='stopping';$('power').setAttribute('aria-pressed',String(on));$('powerLbl').textContent=on?'Engine on':'Start engine';}

/* ---------- top bar ---------- */
function seg(id,cb){const el=$(id);el.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;for(const x of el.children)x.setAttribute('aria-pressed',String(x===b));cb(b.dataset.v);});}
function setMode(m){
  st.mode=m;sim.mode=m;sim.gear=0;sim.clutch='open';sim.shiftT=0;sim.held=false;
  if(m==='free'){sim.v=0;sim.ww=0;sim.pos=0;}else sim.pos=-120;
  for(const x of $('segMode').children)x.setAttribute('aria-pressed',String(x.dataset.v===m));
  for(const id of ['bBrake','bUp','bDown'])$(id).disabled=m!=='drive';
}
function setListener(v){st.listener=+v;for(const x of $('segListen').children)x.setAttribute('aria-pressed',String(+x.dataset.v===st.listener));setRoom();}

/* ---------- hands and feet ---------- */
const typing=t=>t&&(t.tagName==='SELECT'||t.tagName==='TEXTAREA'||(t.tagName==='INPUT'&&t.type!=='range'));
addEventListener('keydown',e=>{
  if(typing(e.target)||e.metaKey||e.ctrlKey||e.altKey)return;
  const c=e.code,onRange=e.target&&e.target.type==='range';
  if((c==='Space'||c==='KeyW'||(c==='ArrowUp'&&!onRange))){e.preventDefault();st.keys.add('thr');return;}
  if(c==='KeyS'||(c==='ArrowDown'&&!onRange)){e.preventDefault();st.keys.add('brk');return;}
  if(/^Digit\d$/.test(c)){st.digits.add(+c.slice(5)||10);return;}
  if(e.repeat)return;
  if(c==='KeyE')sim.shift(1);else if(c==='KeyQ')sim.shift(-1);
  else if(c==='KeyN')st.keys.add('nos');
  else if(c==='KeyP')purge();
  else if(c==='KeyB')st.blipT=.22;
  else if(c==='KeyI')toggleEngine();
  else if(c==='KeyV')setListener((st.listener+1)%3);
});
addEventListener('keyup',e=>{const c=e.code;
  if(c==='Space'||c==='KeyW'||c==='ArrowUp'){st.keys.delete('thr');if(c==='Space'&&!typing(e.target))e.preventDefault();}
  if(c==='KeyS'||c==='ArrowDown')st.keys.delete('brk');if(c==='KeyN')st.keys.delete('nos');
  if(/^Digit\d$/.test(c))st.digits.delete(+c.slice(5)||10);});
addEventListener('blur',()=>{st.keys.clear();st.digits.clear();st.padOn=false;st.brk=false;st.nos=false;});
function purge(){if(audio)audio.port.post({t:'ev',ev:{type:'purge'}});}
function hold(id,on){const el=$(id);const set=v=>{if(el.disabled)return;on(v);el.classList.toggle('on',v);};
  el.addEventListener('pointerdown',e=>{e.preventDefault();try{el.setPointerCapture(e.pointerId);}catch(_){}set(true);});
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(ev,()=>set(false));}
function bindControls(){
  const pad=$('pad'),setPad=e=>{const r=pad.getBoundingClientRect();st.pad=clamp(1-(e.clientY-r.top)/r.height*1.1+.05,0,1);};
  pad.addEventListener('pointerdown',e=>{e.preventDefault();try{pad.setPointerCapture(e.pointerId);}catch(_){}st.padOn=true;setPad(e);});
  pad.addEventListener('pointermove',e=>{if(st.padOn)setPad(e);});
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(ev,()=>{st.padOn=false;});
  hold('bBrake',v=>st.brk=v);hold('bNos',v=>st.nos=v);
  $('bUp').addEventListener('click',()=>sim.shift(1));$('bDown').addEventListener('click',()=>sim.shift(-1));
  $('bPurge').addEventListener('click',purge);$('bBlip').addEventListener('click',()=>st.blipT=.22);
  $('power').addEventListener('click',toggleEngine);$('startBig').addEventListener('click',startEngine);
  seg('segMode',setMode);seg('segListen',setListener);
  seg('segRoom',v=>{st.room=v;setRoom();});
  $('vol').addEventListener('input',e=>{st.vol=+e.target.value;if(audio)audio.master.gain.setTargetAtTime(st.vol,audio.ctx.currentTime,.03);});
}
function readInput(dt){
  let thr=st.keys.has('thr')?1:0;
  for(const d of st.digits)thr=Math.max(thr,d/10);
  if(st.padOn)thr=Math.max(thr,st.pad);
  if(st.blipT>0){st.blipT-=dt;thr=1;}
  return {thr,brk:st.keys.has('brk')||st.brk?1:0,nos:st.keys.has('nos')||st.nos};
}

/* ---------- canvases ---------- */
const CV={};
function fit(){for(const id of ['tach','crank','curve','scope','spec']){const c=$(id),r=c.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1),w=Math.max(16,Math.round(r.width*d)),h=Math.max(16,Math.round(r.height*d));
  if(c.width!==w||c.height!==h){c.width=w;c.height=h;}CV[id]={c,x:c.getContext('2d'),w,h,u:d};}}
function glowOn(x,col,b){x.shadowColor=col;x.shadowBlur=b;}
function glowOff(x){x.shadowBlur=0;}

function drawTach(o){
  const x=o.x,w=o.w,h=o.h,u=o.u,e=spec,rpm=sim.st==='off'?0:Math.max(0,sim.rpmOut);x.clearRect(0,0,w,h);
  /* shift lights: fill toward the shift point, flash blue at it */
  const n=15,sAt=e.shiftRpm,lo=sAt-Math.min(3500,sAt*.42),f=clamp((rpm-lo)/(sAt-lo),0,1),lit=Math.floor(f*n+.001),at=rpm>=sAt-40&&sim.running,blink=(performance.now()/65|0)%2===0;
  const sp=Math.min(w*.84/n,30*u),x0=w/2-sp*(n-1)/2,ly=14*u,lr=Math.min(sp*.33,8*u);
  for(let i=0;i<n;i++){const col=at?COL.blue:i<5?COL.go:i<10?COL.amber:COL.accent,on=at?blink:i<lit;
    x.beginPath();x.arc(x0+i*sp,ly,lr,0,TAU);if(on){glowOn(x,col,12*u);x.fillStyle=col;}else x.fillStyle=rgba(col,.12);x.fill();glowOff(x);}
  /* the dial */
  const step=e.limiterRpm>12500?2000:1000,M=Math.ceil((e.limiterRpm+step*.3)/step)*step,a0=Math.PI*.75,a1=Math.PI*2.25,ang=r=>a0+(a1-a0)*clamp(r/M,0,1.015);
  const top=ly+lr+10*u,cx=w/2,R=Math.min(w*.47,(h-top)*.56),cy=top+R*1.02;
  x.lineCap='butt';
  x.lineWidth=1*u;x.strokeStyle=COL['line-2'];x.beginPath();x.arc(cx,cy,R,a0,a1);x.stroke();
  x.lineWidth=8*u;x.strokeStyle=rgba(COL.accent,.85);x.beginPath();x.arc(cx,cy,R*.93,ang(e.redline),a1);x.stroke();
  x.lineWidth=3*u;glowOn(x,COL.amber,10*u);x.strokeStyle=COL.amber;x.beginPath();x.arc(cx,cy,R*1.0,a0,ang(rpm));x.stroke();glowOff(x);
  const minor=step/(step===2000?4:5);
  for(let r=0;r<=M+.1;r+=minor){const a=ang(r),maj=Math.abs(r/step-Math.round(r/step))<1e-6,r0=R*(maj?.83:.89),r1=R*.97,c=Math.cos(a),s=Math.sin(a);
    x.lineWidth=(maj?2.2:1)*u;x.strokeStyle=r>=e.redline?COL.accent:maj?COL.ink:COL['ink-3'];x.beginPath();x.moveTo(cx+c*r0,cy+s*r0);x.lineTo(cx+c*r1,cy+s*r1);x.stroke();
    if(maj){x.fillStyle=r>=e.redline?COL.accent:COL['ink-2'];x.font=`600 ${Math.round(R*.12)}px ${FNUM}`;x.textAlign='center';x.textBaseline='middle';x.fillText(String(r/1000),cx+c*R*.7,cy+s*R*.7);}}
  /* the needle */
  const a=ang(rpm),c=Math.cos(a),s=Math.sin(a);
  x.lineCap='round';glowOn(x,COL.amber,14*u);x.strokeStyle=COL.amber;x.lineWidth=4*u;x.beginPath();x.moveTo(cx-c*R*.12,cy-s*R*.12);x.lineTo(cx+c*R*.9,cy+s*R*.9);x.stroke();glowOff(x);
  x.fillStyle=COL.raised;x.beginPath();x.arc(cx,cy,R*.085,0,TAU);x.fill();x.strokeStyle=COL['line-2'];x.lineWidth=1*u;x.stroke();
  x.textAlign='center';x.textBaseline='alphabetic';
  x.fillStyle=COL.ink;x.font=`700 ${Math.round(R*.24)}px ${FNUM}`;x.fillText(fmt(rpm),cx,cy+R*.6);
  x.fillStyle=COL['ink-3'];x.font=`600 ${Math.round(R*.065)}px ${FDISP}`;x.fillText('RPM',cx,cy+R*.74);
  x.fillText('×1000',cx,cy-R*.3);
}

function drawCrank(o,dt){
  const x=o.x,w=o.w,h=o.h,u=o.u,L=S.LAYOUTS[spec.layout],n=L.fire.length,rpm=sim.st==='off'?0:sim.rpmOut;x.clearRect(0,0,w,h);
  /* a slowed-down crank so you can follow the firing order by eye */
  const dps=rpm>50?150+420*clamp(rpm/spec.redline,0,1):0,prev=st.crankPh;st.crankPh=(st.crankPh+dps*dt)%720;
  for(let i=0;i<n;i++){const a=L.fire[i];const crossed=prev<=st.crankPh?(a>prev&&a<=st.crankPh):(a>prev||a<=st.crankPh);if(crossed)st.glow[i]=1;st.glow[i]=(st.glow[i]||0)*Math.exp(-dt*5);}
  const r=Math.min(h*.36,w*.2),cx=r+18*u,cy=h/2,th=d=>d/720*TAU-Math.PI/2;
  x.lineWidth=1*u;x.strokeStyle=COL['line-2'];x.beginPath();x.arc(cx,cy,r,0,TAU);x.stroke();
  for(let i=0;i<n;i++){const t=th(L.fire[i]),col=L.bank[i]?COL['bank-b']:COL['bank-a'],g=st.glow[i];
    const px=cx+Math.cos(t)*r,py=cy+Math.sin(t)*r;x.beginPath();x.arc(px,py,(3.2+3.5*g)*u,0,TAU);x.fillStyle=g>.05?col:rgba(col,.45);if(g>.05)glowOn(x,col,14*u*g);x.fill();glowOff(x);
    x.fillStyle=g>.3?COL.ink:COL['ink-3'];x.font=`600 ${Math.round(10*u)}px ${FNUM}`;x.textAlign='center';x.textBaseline='middle';x.fillText(String(L.order[i]),cx+Math.cos(t)*(r+12*u),cy+Math.sin(t)*(r+12*u));}
  const tn=th(st.crankPh);x.strokeStyle=COL.amber;x.lineWidth=2*u;x.beginPath();x.moveTo(cx,cy);x.lineTo(cx+Math.cos(tn)*r*.86,cy+Math.sin(tn)*r*.86);x.stroke();
  x.fillStyle=COL['ink-3'];x.font=`600 ${Math.round(9*u)}px ${FDISP}`;x.fillText('720°',cx,cy+r*.35);
  /* the same cycle unrolled, one track per bank of pipe */
  const tx0=cx+r+34*u,tx1=w-8*u,tw=tx1-tx0,rows=[[0,'BANK A',COL['bank-a']],[1,'BANK B',COL['bank-b']]],rh=h*.26;
  rows.forEach(([b,lbl,col],k)=>{const y=h*.3+k*rh*1.25;x.fillStyle=COL['ink-3'];x.font=`600 ${Math.round(9*u)}px ${FDISP}`;x.textAlign='left';x.textBaseline='bottom';x.fillText(lbl,tx0,y-rh*.55);
    x.strokeStyle=COL.line;x.lineWidth=1*u;x.beginPath();x.moveTo(tx0,y);x.lineTo(tx1,y);x.stroke();
    for(let i=0;i<n;i++){if(L.bank[i]!==b)continue;const px=tx0+L.fire[i]/720*tw,g=st.glow[i];x.fillStyle=g>.05?col:rgba(col,.4);if(g>.05)glowOn(x,col,10*u*g);
      x.beginPath();x.moveTo(px,y);x.lineTo(px+3*u,y-rh*(.45+.5*g));x.lineTo(px+9*u,y);x.closePath();x.fill();glowOff(x);}});
  const ph=tx0+st.crankPh/720*tw;x.strokeStyle=rgba(COL.amber,.8);x.lineWidth=1.5*u;x.beginPath();x.moveTo(ph,h*.12);x.lineTo(ph,h*.92);x.stroke();
  if(rpm>50)$('crankName').textContent=`${L.name} · shown ${Math.max(1,Math.round(rpm*6/dps))}× slower`;
}

function drawCurve(o){
  const x=o.x,w=o.w,h=o.h,u=o.u,pts=st.curvePts,e=spec;x.clearRect(0,0,w,h);if(!pts)return;
  const l=34*u,rr=w-34*u,t=10*u,b=h-20*u,mt=Math.max(...pts.map(p=>p.tq))*1.12,mp=Math.max(...pts.map(p=>p.hp))*1.12,M=e.limiterRpm;
  const X=r=>l+(rr-l)*r/M,Yt=v=>b-(b-t)*v/mt,Yp=v=>b-(b-t)*v/mp;
  x.strokeStyle=COL.line;x.lineWidth=1*u;for(let k=1;k<=4;k++){const y=b-(b-t)*k/4;x.beginPath();x.moveTo(l,y);x.lineTo(rr,y);x.stroke();}
  const step=M>12500?4000:M>8000?2000:1000;x.fillStyle=COL['ink-3'];x.font=`500 ${Math.round(10*u)}px ${FNUM}`;x.textAlign='center';x.textBaseline='top';
  for(let r=0;r<=M;r+=step)x.fillText(String(r/1000),X(r),b+5*u);
  x.textAlign='right';x.textBaseline='middle';x.fillStyle=COL.amber;x.fillText(fmt(mt/1.12),l-5*u,Yt(mt/1.12));x.fillText('N·m',l-5*u,t+4*u);
  x.textAlign='left';x.fillStyle=COL.accent;x.fillText(fmt(mp/1.12),rr+5*u,Yp(mp/1.12));x.fillText('hp',rr+5*u,t+4*u);
  x.fillStyle=rgba(COL.accent,.08);x.fillRect(X(e.redline),t,rr-X(e.redline),b-t);
  const line=(f,col)=>{x.strokeStyle=col;x.lineWidth=2.2*u;x.beginPath();pts.forEach((p,i)=>i?x.lineTo(X(p.rpm),f(p)):x.moveTo(X(p.rpm),f(p)));x.stroke();};
  line(p=>Yt(p.tq),COL.amber);line(p=>Yp(p.hp),COL.accent);
  const rpm=sim.st==='off'?0:sim.rpm;if(rpm>0){const q=pts.reduce((a,p)=>Math.abs(p.rpm-rpm)<Math.abs(a.rpm-rpm)?p:a,pts[0]);
    x.strokeStyle=rgba(COL.ink,.5);x.lineWidth=1*u;x.beginPath();x.moveTo(X(rpm),t);x.lineTo(X(rpm),b);x.stroke();
    for(const [y,col] of [[Yt(q.tq),COL.amber],[Yp(q.hp),COL.accent]]){x.fillStyle=col;x.beginPath();x.arc(X(rpm),y,3.5*u,0,TAU);x.fill();}}
}

function drawScope(o){
  const x=o.x,w=o.w,h=o.h,u=o.u;x.clearRect(0,0,w,h);
  x.strokeStyle=COL.line;x.lineWidth=1*u;x.beginPath();x.moveTo(0,h/2);x.lineTo(w,h/2);x.stroke();
  if(!audio||sim.st==='off')return;
  const td=audio.td;audio.an.getFloatTimeDomainData(td);const sr=audio.ctx.sampleRate,N=td.length;
  /* show exactly one engine cycle (two crank turns, every cylinder once), triggered on its biggest pulse */
  const rpm=Math.max(300,sim.rpmOut),cyc=Math.round(clamp(120/rpm*sr,256,N/2));
  let pk=0,pi=0;for(let i=1;i<N-cyc;i++){const v=td[i];if(v>pk){pk=v;pi=i;}}
  let st0=pi;while(st0>1&&!(td[st0-1]<0&&td[st0]>=0))st0--;
  let amp=1e-4;for(let i=0;i<cyc;i++)amp=Math.max(amp,Math.abs(td[st0+i]));st.scopeAmp=Math.max(amp,(st.scopeAmp||amp)*.94);
  x.strokeStyle=COL.go;x.lineWidth=1.6*u;glowOn(x,COL.go,6*u);x.beginPath();
  for(let i=0;i<cyc;i++){const px=i/(cyc-1)*w,py=h/2-td[st0+i]/st.scopeAmp*h*.42;i?x.lineTo(px,py):x.moveTo(px,py);}x.stroke();glowOff(x);
  $('scopeNote').textContent=`one engine cycle · ${(cyc/sr*1000).toFixed(1)} ms`;
}

function drawSpec(o){
  const x=o.x,w=o.w,h=o.h,u=o.u;x.clearRect(0,0,w,h);
  const f0=25,f1=12000,X=f=>Math.log(f/f0)/Math.log(f1/f0)*w,Y=db=>h-14*u-(h-18*u)*clamp((db+110)/85,0,1);
  x.fillStyle=COL['ink-3'];x.font=`500 ${Math.round(10*u)}px ${FNUM}`;x.textAlign='center';x.textBaseline='bottom';
  for(const f of [50,100,200,500,1000,2000,5000,10000]){x.strokeStyle=COL.line;x.lineWidth=1*u;x.beginPath();x.moveTo(X(f),0);x.lineTo(X(f),h-14*u);x.stroke();x.fillText(f>=1000?f/1000+'k':String(f),X(f),h);}
  if(!audio||sim.st==='off')return;
  const fd=audio.fd;audio.an.getFloatFrequencyData(fd);const sr=audio.ctx.sampleRate,bin=sr/audio.an.fftSize;
  const g=x.createLinearGradient(0,0,0,h);g.addColorStop(0,rgba(COL.accent,.75));g.addColorStop(1,rgba(COL.amber,.1));
  x.beginPath();x.moveTo(0,h-14*u);let last=-1;
  for(let px=0;px<=w;px+=2*u){const f=f0*Math.pow(f1/f0,px/w),i=Math.min(fd.length-1,Math.round(f/bin));if(i===last)continue;last=i;let v=fd[i];if(i>1)v=Math.max(v,fd[i-1],fd[i+1]);x.lineTo(px,Y(v));}
  x.lineTo(w,h-14*u);x.closePath();x.fillStyle=g;x.fill();x.strokeStyle=COL.amber;x.lineWidth=1.4*u;x.stroke();
  /* where the firing frequency and its harmonics sit right now */
  const L=S.LAYOUTS[spec.layout],ff=sim.rpmOut/60*L.fire.length/2;
  if(ff>f0){x.setLineDash([3*u,3*u]);for(let k=1;k<=6;k++){const f=ff*k;if(f>f1)break;x.strokeStyle=rgba(COL['bank-a'],k===1?.9:.35);x.lineWidth=1*u;x.beginPath();x.moveTo(X(f),0);x.lineTo(X(f),h-14*u);x.stroke();}x.setLineDash([]);}
  $('specNote').textContent=ff>1?`firing frequency ${fmt(ff)} Hz`:'';
}

/* ---------- readouts ---------- */
const RO={};
function setText(id,v){if(RO[id]!==v){RO[id]=v;$(id).textContent=v;}}
function readouts(){
  const e=spec,on=sim.st!=='off';
  setText('gear',st.mode!=='drive'?'N':sim.shiftT>0?'–':sim.gear?String(sim.gear):'N');
  setText('speed',fmt(sim.v*3.6));
  const p=on&&sim.running?Math.max(0,S.engTq(e,sim.rpm,sim.thr,sim.boost))*sim.rpm*TAU/60/745.7+(sim.nosOn?e.nosKw*1.341:0):0;setText('pwr',fmt(p));
  setText('thrTxt',Math.round(sim.thr*100)+'%');$('thrFill').style.width=(sim.thr*100).toFixed(1)+'%';$('padFill').style.height=(readInput(0).thr*100).toFixed(1)+'%';
  if(e.fiBoost){setText('boostTxt',sim.boost.toFixed(2)+' bar');$('boostFill').style.width=clamp(sim.boost/(e.fiBoost*1.05),0,1)*100+'%';}
  if(e.nosKw)$('nosFill').style.width=(sim.nos*100).toFixed(1)+'%';
  const chips={lim:sim.cutFrac>.5&&!sim.twostep&&!sim.tcOn&&sim.shiftT<=0,step:sim.twostep,tc:sim.tcOn,al:!!(e.antilag&&e.turbo&&sim.thr<.2&&sim.running&&sim.rpm>e.redline*.3),nos:sim.nosOn,bang:performance.now()-st.popT<140};
  for(const s of $('chips').children){const v=!!chips[s.dataset.c];if(s.classList.contains('on')!==v)s.classList.toggle('on',v);}
  $('pad').setAttribute('aria-valuenow',String(Math.round(readInput(0).thr*100)));
}

/* ---------- the loop ---------- */
let last=performance.now();
function frame(now){
  const dt=Math.min(.05,Math.max(.001,(now-last)/1000));last=now;
  const inp=readInput(dt);for(let k=0;k<4;k++)sim.step(dt/4,inp);
  const ev=sim.takeEvents();
  if(audio){for(const e of ev)audio.port.post({t:'ev',ev:e});audio.port.post({t:'p',p:sim.params(st.listener,1)});}
  if(sim.st==='off'&&$('power').getAttribute('aria-pressed')==='true')syncPower();
  try{drawTach(CV.tach);drawCrank(CV.crank,dt);drawCurve(CV.curve);drawScope(CV.scope);drawSpec(CV.spec);readouts();}catch(err){console.error(err);}
  requestAnimationFrame(frame);
}

/* ---------- boot ---------- */
buildPresets();buildSetup();bindControls();setMode('free');applySpec();fit();
if(window.ResizeObserver){const ro=new ResizeObserver(()=>fit());for(const id of ['tach','crank','curve','scope','spec'])ro.observe($(id));}else addEventListener('resize',fit);
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);
requestAnimationFrame(frame);
window.__lab={sim,st,get spec(){return spec;},get audio(){return audio;},applySpec};
})();
