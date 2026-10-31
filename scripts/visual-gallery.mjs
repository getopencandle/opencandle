#!/usr/bin/env node
// Visual gallery: renders every built-in indicator and drawing tool on the built-in example data and writes one
// screenshot per item, a contact sheet (index.html), a JSON manifest and review sprite sheets.
//
//   npm run visual:gallery                       # everything
//   npm run visual:gallery -- --only "rsi|fib"    # ids/labels matching a regex
//   npm run visual:gallery -- --kind drawings     # indicators | drawings | all (default)
//   npm run visual:gallery -- --workers 4 --no-theme --keep 2
//   npm run visual:gallery -- --reuse-build          # capture the last build again without rebuilding
//
// How it runs: a production Vite build of the working tree goes to .tmp/visual-gallery/app and is served locally;
// a headless browser (Edge by default, VISUAL_GALLERY_BROWSER to override, or Playwright's own Chromium if installed) opens it in browser-preview mode with a throwaway profile,
// clicks "Load example data" and then acts only through the visible UI: the Indicators dialog to add an indicator,
// the drawing toolbar plus mouse clicks to place a drawing. No window is shown, no OpenCandle process is started or
// touched, and no workspace on disk is read or written. Output goes to reports/visual-gallery/<stamp>/ (gitignored).
//
// Automatic flags per item: exception (page error), console-error, status-error (the app's status line reported a
// failure), nan-text (NaN/Infinity/undefined in legend or chart text), no-visible-change (the capture equals the
// baseline), legend-only / nothing-placed (under 150 pixels changed outside the legend, price scale and time axis, so
// the plot is missing or off-screen), no-detections (a pattern indicator found nothing on this data), faint-plot (an
// indicator changed under 1,000 plot pixels: hidden behind candles, or a sliver), legend-unavailable (the legend says Unavailable), add-failed / place-failed (the UI step did not
// complete), theme-failed, harness-error. Flags are leads for the human review, not verdicts.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,build,preview} from 'vite';
import {chromium} from 'playwright';
import {anchorsFor,FREEHAND_PATH} from './visual-gallery/geometry.mjs';
import {setupFor,DEFAULT_SETUP,THEME_SAMPLE_INDICATORS,THEME_SAMPLE_DRAWINGS} from './visual-gallery/setups.mjs';
import {writeContactSheet,writeSpriteSheets} from './visual-gallery/report.mjs';

const self=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const slash=value=>value.split(String.fromCharCode(92)).join('/');
const args=process.argv.slice(2),flag=name=>args.includes('--'+name),opt=(name,fallback)=>{const i=args.indexOf('--'+name);return i>=0&&args[i+1]!==undefined?args[i+1]:fallback;};
const ONLY=opt('only',null)?new RegExp(opt('only'),'i'):null,KIND=opt('kind','all'),WORKERS=Math.max(1,Number(opt('workers',3))),KEEP=Math.max(1,Number(opt('keep',2)));
const REUSE_BUILD=flag('reuse-build'),THEMES=!flag('no-theme'),SPRITES=!flag('no-sprites'),VIEW={width:1440,height:900};
const project=self;
const ROOT=path.join(self,'reports','visual-gallery'),STAMP=new Date().toISOString().replace(/[-:]/g,'').replace(/\..+$/,'').replace('T','-');
const OUT=path.resolve(opt('out',path.join(ROOT,STAMP)));
const MARKER='opencandle-visual-gallery';

function browserExecutable(){
 const fromEnv=process.env.VISUAL_GALLERY_BROWSER;if(fromEnv)return fromEnv;
 try{const own=chromium.executablePath();if(own&&fs.existsSync(own))return undefined;}catch{}
 for(const candidate of ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'])if(fs.existsSync(candidate))return candidate;
 throw new Error('No browser found. Set VISUAL_GALLERY_BROWSER to a Chromium-based browser executable, or run "npx playwright install chromium".');
}

/** After a run, gallery stamps beyond the newest --keep (default 2, this run included) are deleted; only folders this tool
 * made (they hold our manifest marker) are touched. */
function pruneOldStamps(){
 if(!fs.existsSync(ROOT))return [];
 const ours=fs.readdirSync(ROOT).map(name=>path.join(ROOT,name)).filter(dir=>{try{return JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8')).tool===MARKER;}catch{return false;}}).sort();
 const remove=ours.slice(0,Math.max(0,ours.length-KEEP)).filter(dir=>path.resolve(dir)!==path.resolve(OUT));
 for(const dir of remove)fs.rmSync(dir,{recursive:true,force:true});
 return remove;
}

const SAMPLE_PNG='iVBORw0KGgoAAAANSUhEUgAAABgAAAAQCAIAAACDRijCAAAAJElEQVR42mPQTPoPR8iAVHGGYWwQJZqRxYezQaPpaDQdUcEgANIyZW4j7KZzAAAAAElFTkSuQmCC';
const NAN_TEXT=/(^|[^A-Za-z])(NaN|-?Infinity|undefined)([^A-Za-z]|$)/;
const STATUS_ERROR=/fail|error|unavailable|could not|cannot|invalid|rejected|not available/i;

async function settle(page,ms=350){await page.evaluate(ms=>new Promise(resolve=>{let n=0;const tick=()=>{if(++n>=3)setTimeout(resolve,ms);else requestAnimationFrame(tick);};requestAnimationFrame(tick);}),ms);}
/** Wait until two captures in a row are identical (heavy indicators finish in a worker), at most `limit` ms. */
async function stableShot(page,locator,limit=9000){
 const start=Date.now();let last=await locator.screenshot({animations:'disabled'});
 while(Date.now()-start<limit){await page.waitForTimeout(450);const next=await locator.screenshot({animations:'disabled'});if(next.equals(last))return next;last=next;}
 return last;
}

async function openApp(page,origin,setup){
 await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Load example data'}).click({timeout:60000});
 await page.locator('.chart-panel canvas').first().waitFor({timeout:30000});
 if(setup.symbol!==DEFAULT_SETUP.symbol){
  await page.locator('.watchlist-panel, [class*=watchlist]').getByText(setup.symbol,{exact:true}).first().click();
  await page.waitForFunction(s=>document.title.includes(s)||[...document.querySelectorAll('.chart-panel *')].some(n=>n.childElementCount===0&&n.textContent?.trim().startsWith(s)),setup.symbol,{timeout:15000}).catch(()=>{});
 }
 if(setup.interval!==DEFAULT_SETUP.interval){
  await page.locator('#lv-interval-badge').click();
  const label={'1m':'1 minute','5m':'5 minutes','15m':'15 minutes','1h':'1 hour','4h':'4 hours','1W':'1 week'}[setup.interval]??setup.interval;
  await page.getByRole('menuitemradio',{name:label,exact:true}).click();
 }
 await page.addStyleTag({content:'.lv-toast-text{visibility:hidden !important}'});
 await page.mouse.move(VIEW.width/2,12);
 await settle(page,600);
}

async function readChartText(page){
 return page.evaluate(()=>{const panel=document.querySelector('.chart-panel');/* Legend rows sit in an overlay next to the canvas, not inside .chart-panel. */const legend=[...document.querySelectorAll('.lv-legend-row')].map(n=>n.textContent?.trim()??'');
  const panes=document.querySelectorAll('.lv-legend-pane:not(.lv-legend-price-scroll)').length;
  const alerts=[...document.querySelectorAll('[role=alert]')].map(n=>n.textContent?.trim()).filter(Boolean);
  const status=document.querySelector('.statusbar output')?.textContent?.trim()??'';
  const allText=panel?.innerText??'';
  return {legend,panes,alerts,status,allText};});
}

async function mainPaneRect(page){
 return page.evaluate(()=>{const canvases=[...document.querySelectorAll('.chart-panel canvas')].map(c=>c.getBoundingClientRect()).filter(r=>r.width>200&&r.height>200).sort((a,b)=>b.width*b.height-a.width*a.height);const r=canvases[0];
  // The main pane's plot: the canvas minus the right price scale and the bottom time axis.
  return r?{x:r.left,y:r.top,w:r.width-72,h:r.height-30}:null;});
}

async function addIndicator(page,item){
 await page.getByRole('button',{name:'Indicators',exact:true}).click();
 const search=page.locator('.lv-picker-search input');await search.waitFor({timeout:10000});
 if(item.category==='profiles'||item.category==='patterns'){
  // Profiles and patterns live on their own tabs, where each row is a button named after the indicator.
  await page.getByRole('tab',{name:item.category==='profiles'?'Profiles':'Patterns',exact:true}).click();
  await search.fill(item.label);
  await page.locator('[data-lv-picker="true"]').getByRole('button',{name:item.label,exact:true}).first().click({timeout:8000});
 }else{
  const row=page.locator('#lv-ind-row-'+item.id+' .lv-picker-add');
  await search.fill(item.id);
  if(!await row.count())await search.fill(item.label);
  await row.click({timeout:8000});
 }
 await page.keyboard.press('Escape');
 await page.locator('[data-lv-picker="true"]').waitFor({state:'detached',timeout:5000}).catch(async()=>{await page.keyboard.press('Escape');});
}

async function placeDrawing(page,item,notes){
 const opener=page.getByRole('button',{name:'Open '+item.group,exact:true});
 if(await opener.count())await opener.first().click();
 else await page.getByRole('button',{name:item.group,exact:true}).first().click();
 const leaf=page.locator('[data-requirement="'+item.id+'"]');await leaf.first().waitFor({timeout:5000});
 if(await leaf.first().getAttribute('aria-disabled')==='true')throw new Error('Toolbar row is disabled: '+(await leaf.first().getAttribute('title')));
 // Image opens the file chooser: answer it with a small invented PNG (a blue and white checker), like a user picking a file.
 let chooser=null;page.once('filechooser',fc=>{chooser=fc;void fc.setFiles({name:'gallery-checker.png',mimeType:'image/png',buffer:Buffer.from(SAMPLE_PNG,'base64')}).catch(()=>{});});
 await leaf.first().click();
 await settle(page,200);
 const rect=await mainPaneRect(page);if(!rect)throw new Error('No chart canvas');
 const at=([fx,fy])=>[Math.round(rect.x+fx*rect.w),Math.round(rect.y+fy*rect.h)];
 if(item.type==='lvimage'){
  // Image is placed by the import itself (no chart click); a click while it imports cancels it.
  await page.waitForTimeout(1500);
 }else if(item.mode==='freehand'){
  const pts=FREEHAND_PATH.map(at);await page.mouse.move(...pts[0]);await page.mouse.down();
  for(const p of pts.slice(1))await page.mouse.move(p[0],p[1],{steps:3});
  await page.mouse.up();
 }else if(item.mode==='drag'){
  const [a,b]=anchorsFor(item).map(at);await page.mouse.move(...a);await page.mouse.down();await page.mouse.move(b[0],b[1],{steps:8});await page.mouse.up();
 }else{
  const points=anchorsFor(item).map(at),open=(item.schema?.max??points.length)>points.length;
  for(let i=0;i<points.length;i++){
   const [x,y]=points[i];await page.mouse.move(x-6,y-4);await page.mouse.move(x,y,{steps:4});
   if(open&&i===points.length-1)await page.mouse.dblclick(x,y);else await page.mouse.click(x,y);
   await page.waitForTimeout(120);
  }
  if(open){await page.keyboard.press('Enter').catch(()=>{});}
 }
 await settle(page,300);
 if(chooser){notes.push('file chooser answered with an invented 24 x 16 checker PNG');}
 // Text tools open an inline editor: type a sample and commit with a click elsewhere.
 const editing=await page.evaluate(()=>{const a=document.activeElement;return !!a&&(a.tagName==='TEXTAREA'||(a.tagName==='INPUT'&&a.type==='text')||a.isContentEditable)&&!a.closest('.lv-picker-search');});
 if(editing){await page.keyboard.type('Gallery sample text');notes.push('typed sample text into the inline editor');await page.keyboard.press('Control+Enter').catch(()=>{});await settle(page,150);
  const still=await page.evaluate(()=>{const a=document.activeElement;return !!a&&(a.tagName==='TEXTAREA'||a.tagName==='INPUT'||a.isContentEditable);});if(still)await page.keyboard.press('Escape');}
 // Leave the tool and deselect, so the capture shows the drawing as it rests on the chart.
 const box=await page.locator('.chart-panel').boundingBox();
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await page.mouse.click(Math.round(rect.x+rect.w*0.12),Math.round(rect.y+rect.h*0.92));
 await page.keyboard.press('Escape');
 await page.mouse.move(VIEW.width/2,12);
 // A dialog the tool opened (settings, table editor) is closed so it does not cover the capture.
 for(let i=0;i<2;i++){if(await page.locator('[aria-modal="true"]').count()){notes.push('a dialog opened after placement; closed with Escape');await page.keyboard.press('Escape');}}
 void box;
}

async function enableLightChart(page){
 // The light sample: Chart settings, Canvas, background white. Uses the visible dialog only.
 // OpenCandle ships dark themes only, so the light sample sets background, grid and scale text in Chart settings.
 await page.getByRole('button',{name:'Chart settings',exact:true}).click();
 const dialog=page.locator('[aria-modal="true"]').last();await dialog.waitFor({timeout:5000});
 await dialog.getByRole('tab',{name:'Canvas',exact:true}).click();
 // Colours are picked from the swatch palette of each colour control (the visible way to choose one).
 for(const [label,hex] of [['Background color','#ffffff'],['Vertical grid lines color','#b8c0cc'],['Horizontal grid lines color','#b8c0cc'],['Text color','#1c2433']]){
  await page.getByRole('button',{name:'Choose '+label+' color',exact:true}).click();
  await page.getByRole('button',{name:'Use '+hex,exact:true}).last().click();
  const close=page.getByRole('button',{name:'Close '+label+' color',exact:true});if(await close.count())await close.first().click();
 }
 await dialog.getByRole('button',{name:'OK',exact:true}).click();
 await settle(page,400);
}

/** Pixel diff of two PNG captures, computed in a scratch page. */
/** `skip` lists panel-relative rectangles (legend rows, price scale, time axis) left out of the `plot` count. */
async function diffImages(diffPage,a,b,skip=[]){
 return diffPage.evaluate(async([a,b,skip])=>{
  const load=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src='data:image/png;base64,'+src;});
  const [ia,ib]=await Promise.all([load(a),load(b)]);
  if(ia.width!==ib.width||ia.height!==ib.height)return {changed:-1,box:null,width:ib.width,height:ib.height};
  const c=document.createElement('canvas');c.width=ia.width;c.height=ia.height;const g=c.getContext('2d',{willReadFrequently:true});
  g.drawImage(ia,0,0);const da=g.getImageData(0,0,c.width,c.height).data;g.clearRect(0,0,c.width,c.height);g.drawImage(ib,0,0);const db=g.getImageData(0,0,c.width,c.height).data;
  let changed=0,plot=0,x0=1e9,y0=1e9,x1=-1,y1=-1;const skipped=(x,y)=>skip.some(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h);
  for(let i=0;i<da.length;i+=4){if(Math.abs(da[i]-db[i])+Math.abs(da[i+1]-db[i+1])+Math.abs(da[i+2]-db[i+2])>24){changed++;const p=i/4,x=p%c.width,y=(p-x)/c.width;if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y;if(!skipped(x,y))plot++;}}
  return {changed,plot,box:changed?{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1}:null,width:c.width,height:c.height};
 },[a.toString('base64'),b.toString('base64'),skip]);
}

async function runItem(ctx,item){
 const {browser,origin,diffPage}=ctx;
 const record={...item,file:null,flags:[],consoleErrors:[],pageErrors:[],notes:[],legend:[],status:'',alerts:[],panes:{before:0,after:0},diff:null,ms:0};
 const started=Date.now();
 const context=await browser.newContext({viewport:VIEW,deviceScaleFactor:1,colorScheme:'dark',serviceWorkers:'block'});
 const page=await context.newPage();
 await page.route('**/*',route=>{const url=route.request().url();return url.startsWith(origin)||url.startsWith('data:')||url.startsWith('blob:')?route.continue():route.abort();});
 page.on('console',m=>{if(m.type()==='error')record.consoleErrors.push(m.text().slice(0,400));});
 page.on('pageerror',e=>record.pageErrors.push(String(e.message).slice(0,400)));
 page.on('dialog',d=>{record.notes.push('browser dialog: '+d.message().slice(0,200));d.dismiss().catch(()=>{});});
 try{
  await openApp(page,origin,item.setup);
  if(item.theme==='light'){try{await enableLightChart(page);}catch(e){record.flags.push('theme-failed');record.notes.push('light background: '+String(e.message).split('\n')[0]);}}
  const panel=page.locator('.chart-panel').first();
  const before=await readChartText(page);record.panes.before=before.panes;
  const consoleBefore=record.consoleErrors.length,errorsBefore=record.pageErrors.length;
  const base=await panel.screenshot({animations:'disabled'});
  try{
   if(item.kind==='indicator')await addIndicator(page,item);else await placeDrawing(page,item,record.notes);
  }catch(e){record.flags.push(item.kind==='indicator'?'add-failed':'place-failed');record.notes.push(String(e.message).split('\n')[0].slice(0,300));}
  await page.mouse.move(VIEW.width/2,12);
  const shot=await stableShot(page,panel,item.kind==='indicator'?9000:3000);
  record.file='img/'+item.slug+'.png';fs.writeFileSync(path.join(OUT,record.file),shot);
  const after=await readChartText(page);
  Object.assign(record,{legend:after.legend,status:after.status,alerts:after.alerts});record.panes.after=after.panes;
  // Legend rows, the price scale and the time axis change for almost anything; the plot count leaves them out.
  const skip=await page.evaluate(()=>{const panel=document.querySelector('.chart-panel');if(!panel)return [];const p=panel.getBoundingClientRect();
   const rows=[...document.querySelectorAll('.lv-legend-row,.lv-legend-toggler')].map(n=>n.getBoundingClientRect()).filter(r=>r.width>0).map(r=>({x:r.left-p.left-4,y:r.top-p.top-4,w:r.width+8,h:r.height+8}));
   return [...rows,{x:p.width-75,y:0,w:75,h:p.height},{x:0,y:p.height-30,w:p.width,h:30}];});
  record.diff=await diffImages(diffPage,base,shot,skip);
  if(record.pageErrors.length>errorsBefore)record.flags.push('exception');
  if(record.consoleErrors.length>consoleBefore)record.flags.push('console-error');
  if(after.status&&after.status!==before.status&&STATUS_ERROR.test(after.status))record.flags.push('status-error');
  if(after.alerts.some(t=>STATUS_ERROR.test(t)))record.flags.push('alert-text');
  const text=after.legend.join(' | ')+'\n'+after.allText;if(NAN_TEXT.test(text))record.flags.push('nan-text');
  if(record.diff.changed===0)record.flags.push('no-visible-change');
  // A pattern indicator with nothing found on this data draws nothing: informational, not a failure.
  else if(record.diff.plot<150)record.flags.push(item.kind==='drawing'?'nothing-placed':item.category==='patterns'?'no-detections':'legend-only');
  // A thin whole-series line changes 1,500 or more plot pixels; under 1,000 the plot is mostly hidden or a sliver.
  else if(item.kind==='indicator'&&item.category!=='patterns'&&record.diff.plot<1000)record.flags.push('faint-plot');
  if(after.legend.some(l=>/Unavailable/.test(l)))record.flags.push('legend-unavailable');
 }catch(e){record.flags.push('harness-error');record.notes.push(String(e.stack||e.message).split('\n').slice(0,3).join(' / ').slice(0,500));
  try{const shot=await page.screenshot();record.file='img/'+item.slug+'.png';fs.writeFileSync(path.join(OUT,record.file),shot);}catch{}}
 finally{record.ms=Date.now()-started;await context.close().catch(()=>{});}
 record.flags=[...new Set(record.flags)];
 return record;
}

async function main(){
 const cacheDir=path.join(self,'.tmp','visual-gallery','vite-cache'),appDir=path.join(self,'.tmp','visual-gallery','app'),catalogFile=path.join(appDir,'gallery-catalog.json');
 let catalog;
 if(REUSE_BUILD){
  // --reuse-build: capture the last build again (for example while another change leaves the tree unbuildable).
  if(!fs.existsSync(catalogFile))throw new Error('No earlier build in '+slash(appDir)+'. Run without --reuse-build first.');
  catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8'));process.stdout.write('Reusing the build in '+slash(appDir)+' from '+catalog.builtAt+'\n');
 }else{
  // A production build, as users run it. (The dev server runs React StrictMode's double mount, under which drawing
  // clicks are not placed, so it cannot stand in for the app.) It runs before anything else touches Vite, because
  // creating a dev server sets NODE_ENV=development, and a later build would then bundle development React.
  process.stdout.write('Building the app into '+slash(appDir)+'\n');
  process.env.NODE_ENV='production';
  try{await build({mode:'production',configFile:path.join(self,'vite.config.ts'),root:project,logLevel:'error',build:{outDir:appDir,emptyOutDir:true}});}
  catch(error){throw new Error('The app does not build right now ('+String(error.message).split('\n')[0]+'). If another change is in progress, retry later or pass --reuse-build to capture the last build.');}
  // The catalog comes from the app's own modules (loaded once in Node through Vite's SSR loader).
  const loader=await createServer({configFile:path.join(self,'vite.config.ts'),root:project,cacheDir,clearScreen:false,logLevel:'warn',appType:'custom',server:{middlewareMode:true,watch:null,hmr:false}});
  try{catalog=(await loader.ssrLoadModule('/scripts/visual-gallery/page-catalog.ts')).galleryCatalog();}finally{await loader.close();}
  catalog.builtAt=new Date().toISOString();fs.writeFileSync(catalogFile,JSON.stringify(catalog));
 }
 fs.mkdirSync(path.join(OUT,'img'),{recursive:true});
 const server=await preview({configFile:false,root:project,base:'./',logLevel:'warn',build:{outDir:appDir},preview:{host:'127.0.0.1',port:0,strictPort:false,open:false}});
 const origin=server.resolvedUrls.local[0].replace(/\/$/,'');
 const executablePath=browserExecutable();
 const browser=await chromium.launch({headless:true,executablePath,args:['--no-first-run','--disable-background-networking','--disable-component-update','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
 const started=Date.now();
 try{
  const diffContext=await browser.newContext();const diffPage=await diffContext.newPage();
  const pad=n=>String(n).padStart(3,'0'),slugify=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  let items=[];
  catalog.indicators.forEach((row,i)=>items.push({kind:'indicator',index:'I'+pad(i+1),id:row.id,label:row.name,acronym:row.acronym,category:row.category,setup:setupFor(row.id),theme:'dark'}));
  catalog.drawings.forEach((row,i)=>items.push({kind:'drawing',index:'D'+pad(i+1),id:row.id,type:row.type,label:row.label,category:row.group,group:row.group,section:row.section,mode:row.mode,schema:row.schema,setup:DEFAULT_SETUP,theme:'dark'}));
  if(THEMES){
   for(const id of THEME_SAMPLE_INDICATORS){const base=items.find(r=>r.kind==='indicator'&&r.id===id);if(base)items.push({...base,index:base.index+'L',theme:'light'});}
   for(const type of THEME_SAMPLE_DRAWINGS){const base=items.find(r=>r.kind==='drawing'&&r.type===type);if(base)items.push({...base,index:base.index+'L',theme:'light'});}
  }
  items=items.filter(r=>(KIND==='all'||(KIND==='indicators'&&r.kind==='indicator')||(KIND==='drawings'&&r.kind==='drawing'))&&(!ONLY||ONLY.test(r.id)||ONLY.test(r.label)||(r.type&&ONLY.test(r.type))));
  for(const r of items)r.slug=r.index+'-'+slugify(r.type??r.id)+(r.theme==='light'?'-light':'');
  // Every item uses a fresh browser context, so items never see each other's state.
  const results=new Array(items.length);let next=0,done=0;
  const ctx={browser,origin,diffPage};
  await Promise.all(Array.from({length:Math.min(WORKERS,items.length)},async()=>{
   while(next<items.length){const i=next++;let r=await runItem(ctx,items[i]);
    if(r.flags.includes('harness-error')){const retry=await runItem(ctx,items[i]);retry.notes.unshift('retried after harness error');r=retry;}
    results[i]=r;done++;
    process.stdout.write(`[${done}/${items.length}] ${r.index} ${r.label}${r.flags.length?'  FLAGS: '+r.flags.join(','):''}\n`);}
  }));
  const manifest={tool:MARKER,version:1,createdAt:new Date().toISOString(),elapsedMs:Date.now()-started,origin:'vite production build served by vite preview, browser-preview mode, example data',browser:{executablePath:executablePath??'playwright chromium',version:browser.version()},viewport:VIEW,
   sourceRoot:slash(project),filters:{only:ONLY?.source??null,kind:KIND,themes:THEMES},catalog:{indicators:catalog.indicators.length,drawings:catalog.drawings.length},prunedStamps:[],builtAt:catalog.builtAt??null,
   summary:{items:results.length,flagged:results.filter(r=>r.flags.length).length,byFlag:results.reduce((m,r)=>{for(const f of r.flags)m[f]=(m[f]??0)+1;return m;},{})},items:results};
  fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify(manifest,null,1));
  manifest.prunedStamps=pruneOldStamps().map(p=>path.basename(p));fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify(manifest,null,1));
  writeContactSheet(OUT,manifest);
  if(SPRITES)await writeSpriteSheets(browser,OUT,results.filter(r=>r.file));
  process.stdout.write(`\nGallery: ${slash(path.join(OUT,'index.html'))}\n${manifest.summary.flagged} of ${results.length} items flagged ${JSON.stringify(manifest.summary.byFlag)}\n`);
 }finally{await browser.close().catch(()=>{});await new Promise(r=>server.httpServer.close(()=>r())).catch(()=>{});}
}

main().catch(error=>{console.error(error);process.exitCode=1;});
