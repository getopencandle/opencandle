// Visual gallery: contact sheet (index.html) and review sprite sheets (sheets/*.png, 12 captures each).
import fs from 'node:fs';
import path from 'node:path';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function writeContactSheet(out,manifest){
 const cards=manifest.items.map(r=>{
  const flags=r.flags.map(f=>`<span class="flag">${esc(f)}</span>`).join('');
  const details=[r.legend?.length?'Legend: '+r.legend.join(' | '):'',r.status?'Status: '+r.status:'',...(r.notes??[]),...(r.pageErrors??[]).map(e=>'Exception: '+e),...(r.consoleErrors??[]).slice(0,4).map(e=>'Console: '+e)].filter(Boolean).map(t=>`<li>${esc(t)}</li>`).join('');
  return `<figure class="card${r.flags.length?' flagged':''}" data-kind="${r.kind}" data-theme="${r.theme}" data-flagged="${r.flags.length?1:0}" data-search="${esc((r.index+' '+r.label+' '+r.id+' '+(r.type??'')+' '+r.category).toLowerCase())}">
<a href="${esc(r.file??'')}" data-full="${esc(r.file??'')}"><img loading="lazy" src="${esc(r.file??'')}" alt="${esc(r.label)}"></a>
<figcaption><b>${esc(r.index)}</b> ${esc(r.label)} <small>${esc(r.category)} · ${esc(r.setup?.symbol)} ${esc(r.setup?.interval)}${r.theme==='light'?' · light':''}</small><div>${flags}</div>${details?`<details><summary>details</summary><ul>${details}</ul></details>`:''}</figcaption></figure>`;}).join('\n');
 const s=manifest.summary;
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenCandle visual gallery</title>
<style>
:root{--bg:#16181d;--fg:#e6e9f0;--muted:#9aa3b2;--card:#1f232b;--flag:#e8605a;--line:#2c313b}
@media (prefers-color-scheme: light){:root{--bg:#f4f5f7;--fg:#1b2230;--muted:#5a6577;--card:#fff;--line:#d9dee7}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.4 system-ui,sans-serif}
header{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
header h1{font-size:15px;margin:0 12px 0 0}header input{padding:5px 8px;min-width:200px;background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:6px}
header button{background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:5px 10px;cursor:pointer}header button[aria-pressed=true]{border-color:#4c8dff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;padding:16px}
.card{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden}.card.flagged{border-color:var(--flag)}
.card img{display:block;width:100%;aspect-ratio:1032/720;object-fit:cover;object-position:left top;background:#000}
figcaption{padding:6px 8px}figcaption small{color:var(--muted);display:block}.flag{display:inline-block;background:var(--flag);color:#fff;border-radius:4px;padding:0 5px;margin:2px 3px 0 0;font-size:11px}
details ul{margin:4px 0 0;padding-left:16px;color:var(--muted);word-break:break-word}
#zoom{position:fixed;inset:0;background:rgba(0,0,0,.88);display:none;align-items:center;justify-content:center;z-index:5;cursor:zoom-out}#zoom img{max-width:96vw;max-height:92vh}#zoom p{position:absolute;top:8px;left:16px;color:#fff;margin:0}
</style></head><body>
<header><h1>OpenCandle visual gallery</h1><span>${esc(manifest.createdAt)} · ${s.items} items · ${s.flagged} flagged</span>
<input type="search" id="q" placeholder="Filter by name, id or number" aria-label="Filter">
<button data-f="all" aria-pressed="true">All</button><button data-f="indicator">Indicators</button><button data-f="drawing">Drawings</button><button data-f="light">Light</button><button data-f="flagged">Flagged</button></header>
<main class="grid" id="grid">${cards}</main>
<div id="zoom" role="dialog" aria-label="Enlarged capture"><p id="zcap"></p><img alt=""></div>
<script>
const q=document.getElementById('q'),cards=[...document.querySelectorAll('.card')];let mode='all';
function apply(){const t=q.value.trim().toLowerCase();for(const c of cards){const ok=(mode==='all'||(mode==='flagged'?c.dataset.flagged==='1':mode==='light'?c.dataset.theme==='light':c.dataset.kind===mode))&&(!t||c.dataset.search.includes(t));c.style.display=ok?'':'none';}}
q.addEventListener('input',apply);for(const b of document.querySelectorAll('header button'))b.addEventListener('click',()=>{mode=b.dataset.f;for(const o of document.querySelectorAll('header button'))o.setAttribute('aria-pressed',String(o===b));apply();});
const zoom=document.getElementById('zoom');document.getElementById('grid').addEventListener('click',e=>{const a=e.target.closest('a[data-full]');if(!a)return;e.preventDefault();zoom.querySelector('img').src=a.dataset.full;document.getElementById('zcap').textContent=a.closest('figure').querySelector('figcaption').firstChild.textContent+' '+a.querySelector('img').alt;zoom.style.display='flex';});
zoom.addEventListener('click',()=>{zoom.style.display='none';});document.addEventListener('keydown',e=>{if(e.key==='Escape')zoom.style.display='none';});
</script></body></html>`;
 fs.writeFileSync(path.join(out,'index.html'),html);
}

/** 4 x 3 sheets of captures with their index and name, for a quick human (or model) review pass. */
export async function writeSpriteSheets(browser,out,records,perSheet=12){
 const dir=path.join(out,'sheets');fs.mkdirSync(dir,{recursive:true});
 const context=await browser.newContext({viewport:{width:1800,height:1000},deviceScaleFactor:1});const page=await context.newPage();
 try{
  for(let s=0;s*perSheet<records.length;s++){
   const chunk=records.slice(s*perSheet,(s+1)*perSheet);
   const cells=chunk.map(r=>{const data=fs.readFileSync(path.join(out,r.file)).toString('base64');return `<div class="c"><img src="data:image/png;base64,${data}"><p>${esc(r.index)} ${esc(r.label)}${r.flags.length?' <i>['+esc(r.flags.join(', '))+']</i>':''}</p></div>`;}).join('');
   await page.setContent(`<!doctype html><html><body style="margin:0;background:#111;color:#eee;font:15px system-ui"><div style="display:grid;grid-template-columns:repeat(4,450px);gap:0">${cells}</div><style>.c img{width:450px;height:314px;object-fit:fill;display:block}.c p{margin:0;padding:2px 4px;height:20px;overflow:hidden;white-space:nowrap}i{color:#f77}</style></body></html>`,{waitUntil:'load'});
   await page.screenshot({path:path.join(dir,'sheet-'+String(s+1).padStart(2,'0')+'.png'),fullPage:true});
  }
 }finally{await context.close();}
}
