/* Drive the built page in headless Chromium: start the engine, rev it, drive through the gears,
   switch engines and listeners, and fail on any page error. Screenshots go to the folder given. */
import {chromium} from '/opt/npm-tools/node_modules/playwright/index.mjs';
import {mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..'),out=process.argv[2]||join(root,'test/out');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1500,height:1000},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push('pageerror: '+e.message));page.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|fonts\.g/.test(m.text()))errors.push('console: '+m.text());});
await page.goto(process.env.LAB_URL||'file://'+join(root,'dist/engine-lab.html'));await page.waitForTimeout(600);
await page.screenshot({path:join(out,'0-cover.png')});
const lab=(f)=>page.evaluate(f);
const level=()=>lab(()=>{const a=window.__lab.audio;if(!a)return -999;const t=new Float32Array(a.an.fftSize);a.an.getFloatTimeDomainData(t);let s=0;for(const v of t)s+=v*v;return +(10*Math.log10(s/t.length+1e-12)).toFixed(1);});
const snap=()=>lab(()=>{const s=window.__lab.sim;return {st:s.st,rpm:Math.round(s.rpm),gear:s.gear,kmh:Math.round(s.v*3.6),clutch:s.clutch,boost:+s.boost.toFixed(2)};});
await page.click('#startBig');await page.waitForTimeout(2600);
const kind=await lab(()=>window.__lab.audio&&window.__lab.audio.kind);
console.log('audio path:',kind,'| idle',await snap(),'level',await level(),'dB');
await page.keyboard.down('Space');await page.waitForTimeout(900);const rev=await snap();const revLvl=await level();
await page.screenshot({path:join(out,'1-revving.png')});await page.keyboard.up('Space');
console.log('revving',rev,'level',revLvl,'dB');
await page.waitForTimeout(1200);
await page.click('#segMode button[data-v="drive"]');await page.keyboard.down('Space');await page.waitForTimeout(4500);
const drv=await snap();await page.screenshot({path:join(out,'2-driving.png')});await page.keyboard.up('Space');
console.log('driving',drv,'level',await level(),'dB');
await page.click('#segListen button[data-v="2"]');await page.keyboard.down('Space');await page.waitForTimeout(2500);await page.keyboard.up('Space');
console.log('trackside level',await level(),'dB');
for(const id of ['gp','rotary3','boxer','v12','eight']){await page.click(`.preset[data-id="${id}"]`);await page.waitForTimeout(400);await page.keyboard.down('Space');await page.waitForTimeout(1200);
  const s=await snap(),lv=await level();await page.keyboard.up('Space');console.log(id,JSON.stringify(s),'level on throttle',lv,'dB');}
/* edit a build: V12 with twin turbos and open headers */
await page.selectOption('#set-layout','V12');await page.selectOption('#set-fi','twin');await page.selectOption('#set-ex','4');await page.waitForTimeout(300);
await page.keyboard.down('Space');await page.waitForTimeout(1500);console.log('custom V12 twin-turbo',JSON.stringify(await snap()),'level',await level(),'dB');await page.keyboard.up('Space');
await page.waitForTimeout(600);await page.screenshot({path:join(out,'3-custom.png'),fullPage:true});
const perf=await lab(()=>new Promise(r=>{let n=0,t0=performance.now();const f=()=>{if(++n<120)requestAnimationFrame(f);else r(+((performance.now()-t0)/n).toFixed(1));};requestAnimationFrame(f);}));
console.log('frame time',perf,'ms');
await page.setViewportSize({width:420,height:900});await page.waitForTimeout(500);
const overflow=await lab(()=>document.documentElement.scrollWidth-window.innerWidth);
await page.screenshot({path:join(out,'4-phone.png'),fullPage:true});
console.log('phone horizontal overflow px:',overflow);
console.log(errors.length?'ERRORS:\n'+errors.join('\n'):'no page errors');
await browser.close();
process.exit(errors.length?1:0);
