/* Bundle each page and its modules into one self-contained HTML file.
   node tools/build.mjs                 -> dist/*.html (open straight from disk, or send to someone)
   node tools/build.mjs --fragment DIR  -> also writes body-only versions (for Claude artifacts) into DIR
   node tools/build.mjs --only game     -> build one page */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
let esbuild;
try{esbuild=await import('esbuild');}
catch(e){esbuild=await import(pathToFileURL('/opt/npm-tools/node_modules/esbuild/lib/main.js').href);}

const PAGES={
  lab:{template:'lab/engine-lab.html',entry:'lab/engine-lab.js',out:'engine-lab.html'},
  game:{template:'game/index.html',entry:'game/main.js',out:'shiftlight.html'}
};
const arg=k=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:null;};
const only=arg('--only'),frag=arg('--fragment'),minify=process.argv.includes('--minify');
mkdirSync(join(root,'dist'),{recursive:true});

for(const [name,p] of Object.entries(PAGES)){
  if(only&&only!==name)continue;
  let tpl;try{tpl=readFileSync(join(root,p.template),'utf8');}catch(e){continue;}
  const res=await esbuild.build({entryPoints:[join(root,p.entry)],bundle:true,format:'iife',target:'es2022',write:false,
    minifySyntax:true,minifyWhitespace:minify,minifyIdentifiers:minify,legalComments:'none',logLevel:'warning',charset:'utf8'});
  let js=res.outputFiles[0].text;
  if(/<\/script/i.test(js))js=js.replace(/<\/script/gi,'<\\/script');
  const page=tpl.replace('/*@BUNDLE@*/',()=>js);
  const split=page.indexOf('<!--@BODY@-->')>=0?page.indexOf('<!--@BODY@-->'):page.indexOf('<div class="app">');
  const head=page.slice(0,split).trim(),body=page.slice(split).replace('<!--@BODY@-->','').trim();
  const full=`<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="theme-color" content="#05040a">\n<meta name="screen-orientation" content="landscape">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
  writeFileSync(join(root,'dist',p.out),full);
  if(frag){mkdirSync(frag,{recursive:true});writeFileSync(join(frag,p.out),page);}
  console.log(`dist/${p.out}  ${(full.length/1024).toFixed(1)} KB`);
}
