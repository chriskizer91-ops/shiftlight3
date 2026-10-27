/* Bundle a page and its sources into one self-contained HTML file.
   node tools/build.mjs                       -> dist/engine-lab.html (open it straight in a browser)
   node tools/build.mjs --fragment out.html   -> also writes the body-only version used for Claude artifacts */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const PARTS={DSP:'src/audio/engine-dsp.js',SIM:'src/engine/engine-sim.js',UI:'lab/engine-lab.js'};

let page=read('lab/engine-lab.html');
let js='';
for(const [k,p] of Object.entries(PARTS)){
  const src=read(p);
  if(/<\/script/i.test(src))throw new Error(`${p} contains a closing script tag`);
  page=page.replace(`/*@${k}@*/`,()=>`/* ---- ${p} ---- */\n${src}`);
  js+=src+'\n';
}
/* syntax check the bundled script before shipping it */
const tmp=join(tmpdir(),'shiftlight-bundle-check.js');writeFileSync(tmp,js);
execFileSync(process.execPath,['--check',tmp],{stdio:'inherit'});

const split=page.indexOf('<div class="app">');
const head=page.slice(0,split).trim(),body=page.slice(split).trim();
const full=`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${head}
</head>
<body>
${body}
</body>
</html>
`;
mkdirSync(join(root,'dist'),{recursive:true});
writeFileSync(join(root,'dist/engine-lab.html'),full);
const i=process.argv.indexOf('--fragment');
if(i>0)writeFileSync(process.argv[i+1],page);
console.log(`dist/engine-lab.html  ${(full.length/1024).toFixed(1)} KB`);
