/* How much main-thread time a frame of game logic takes (physics, traffic, rivals, audio
   bookkeeping, no rendering), per scene and quality tier. Phones run JavaScript roughly
   3-5x slower than a desktop core, so this is the budget check for the mobile tier.
   node test/cpu.mjs */
import {chromium} from '/opt/npm-tools/node_modules/playwright/index.mjs';
import {resolve} from 'node:path';
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const url='file://'+resolve('dist/shiftlight.html');
for(const q of (process.env.Q||'mobile,high').split(',')){
  const page=await b.newPage({viewport:{width:640,height:360}});
  await page.goto(url+'?manual&quality='+q);
  await page.waitForFunction(()=>window.__game&&window.__game.ready,null,{timeout:300000});
  for(const scene of ['city','loop-race']){
    const r=await page.evaluate(scene=>{const g=window.__game;g.startFree(scene);g.sim(4);
      const t0=performance.now();g.sim(5);const ms=(performance.now()-t0)/(5*60);
      return {ms:ms.toFixed(2),traffic:g.traffic?g.traffic.cars.length:0,full:g.traffic?g.traffic.cars.filter(c=>c.veh).length:0,mode:g.mode&&g.mode.kind};},scene);
    console.log(q.padEnd(7),scene.padEnd(10),'logic',r.ms,'ms/frame','traffic',r.traffic,'(full physics '+r.full+')',r.mode||'');
  }
  await page.close();
}
await b.close();
