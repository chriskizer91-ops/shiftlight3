/* Render the game page headless and save screenshots.
   node test/shot.mjs OUTDIR [w h] -- each shot: name|query|frames|js-before */
import {chromium} from '/opt/npm-tools/node_modules/playwright/index.mjs';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const out=process.argv[2]||'test/out';mkdirSync(out,{recursive:true});
const W=+(process.env.W||960),H=+(process.env.H||540);
const shots=JSON.parse(process.env.SHOTS||'[]');
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const page=await b.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
const errs=[];page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.type()+': '+m.text());});page.on('pageerror',e=>errs.push('pageerror: '+e.message));
const url='file://'+resolve('dist/shiftlight.html');
for(const s of shots){
  const t0=Date.now();
  await page.goto(url+'?manual&'+(s.q||''));
  await page.waitForFunction(()=>window.__game||document.querySelector('#boot b'),null,{timeout:120000});
  const ok=await page.evaluate(()=>!!window.__game);
  if(!ok){console.log('no game object');break;}
  if(s.js)await page.evaluate(s.js);
  const n=s.frames||8;
  for(let i=0;i<n;i++)await page.evaluate(()=>window.__game.frame(1/60));
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>r())));
  await page.screenshot({path:`${out}/${s.name}.png`,timeout:300000});
  const st=await page.evaluate(()=>JSON.stringify(window.__game.stats()));
  console.log(s.name,((Date.now()-t0)/1000).toFixed(1)+'s',st);
}
if(errs.length)console.log(errs.slice(0,20).join('\n'));
await b.close();
