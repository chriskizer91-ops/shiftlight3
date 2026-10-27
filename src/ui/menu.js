/* =====================================================================================
   MENU — the title card and the pause menu. Rows of settings you can change with the arrow
   keys, a gamepad, or the mouse. Settings persist in this browser.
   ===================================================================================== */
const KEY='shiftlight.settings.v1';
export function loadSettings(defaults){
  let s={};try{s=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){}
  return Object.assign({},defaults,s);
}
export function saveSettings(s){try{localStorage.setItem(KEY,JSON.stringify(s));}catch(e){}}

export class Menu{
  constructor(root){this.root=root;this.open=false;this.rows=[];this.sel=0;this.onClose=null;
    root.addEventListener('click',e=>{const r=e.target.closest('[data-row]');if(!r)return;const i=+r.dataset.row;this.sel=i;
      const opt=e.target.closest('[data-opt]');const row=this.rows[i];
      if(row.type==='action')row.act();
      else if(opt&&row.type==='choice'){row.set(row.options[+opt.dataset.opt].id);}
      else if(e.target.closest('[data-step]'))this.step(+e.target.closest('[data-step]').dataset.step);
      this.render();});
    root.addEventListener('input',e=>{const r=e.target.closest('[data-row]');if(!r)return;const row=this.rows[+r.dataset.row];if(row.type==='slider')row.set(+e.target.value);});
  }
  show(rows,title){this.rows=rows;this.title=title;this.open=true;this.root.hidden=false;this.sel=Math.min(this.sel,rows.length-1);this.render();}
  hide(){this.open=false;this.root.hidden=true;}
  step(d){const row=this.rows[this.sel];if(!row)return;
    if(row.type==='choice'){const i=row.options.findIndex(o=>o.id===row.get());const n=row.options.length;row.set(row.options[((i<0?0:i)+d+n)%n].id);}
    else if(row.type==='slider'){row.set(Math.max(row.min,Math.min(row.max,row.get()+d*row.stepV)));}
    this.render();}
  key(k){
    if(!this.open)return false;
    if(k==='up'){do{this.sel=(this.sel-1+this.rows.length)%this.rows.length;}while(this.rows[this.sel].type==='head');this.render();}
    else if(k==='down'){do{this.sel=(this.sel+1)%this.rows.length;}while(this.rows[this.sel].type==='head');this.render();}
    else if(k==='left')this.step(-1);else if(k==='right')this.step(1);
    else if(k==='enter'){const r=this.rows[this.sel];if(r.type==='action')r.act();else this.step(1);this.render();}
    return true;
  }
  render(){
    const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    let h=`<div class="panel"><div class="ttl">${esc(this.title||'PAUSED')}</div><div class="rows">`;
    this.rows.forEach((r,i)=>{
      const on=i===this.sel?' sel':'';
      if(r.type==='head'){h+=`<div class="head">${esc(r.label)}</div>`;return;}
      if(r.type==='action'){h+=`<button class="row act${on}" data-row="${i}">${esc(r.label)}</button>`;return;}
      if(r.type==='slider'){h+=`<div class="row${on}" data-row="${i}"><span class="lab">${esc(r.label)}</span><input type="range" min="${r.min}" max="${r.max}" step="${r.stepV}" value="${r.get()}" aria-label="${esc(r.label)}"><span class="val">${esc(r.fmt?r.fmt(r.get()):r.get())}</span></div>`;return;}
      const cur=r.options.find(o=>o.id===r.get())||r.options[0];
      if(r.chips){h+=`<div class="row${on}" data-row="${i}"><span class="lab">${esc(r.label)}</span><span class="chips">`+
        r.options.map((o,k)=>`<button class="chip${o.id===cur.id?' on':''}" data-opt="${k}"${o.swatch?` style="--sw:${o.swatch}"`:''}>${o.swatch?'<i></i>':''}${esc(o.label)}</button>`).join('')+`</span>${cur.desc?`<span class="desc">${esc(cur.desc)}</span>`:''}</div>`;}
      else h+=`<div class="row${on}" data-row="${i}"><span class="lab">${esc(r.label)}</span><span class="cyc"><button class="arr" data-step="-1" aria-label="previous">◀</button><b>${esc(cur.label)}</b><button class="arr" data-step="1" aria-label="next">▶</button></span>${cur.desc?`<span class="desc">${esc(cur.desc)}</span>`:''}</div>`;
    });
    h+=`</div><div class="foot">↑ ↓ choose · ← → change · Enter · Esc to drive</div></div>`;
    this.root.innerHTML=h;
    const s=this.root.querySelector('.sel');if(s&&s.scrollIntoView)s.scrollIntoView({block:'nearest'});
  }
}
