#!/usr/bin/env node
// Real-app click-through check: drives the desktop app the way a person would and checks the indicator flows that broke before.
//
//   npm run ui:check                     # production build, then the click-through on example data
//   npm run ui:check -- --reuse-build    # use the current dist/ without rebuilding
//   npm run ui:check -- --live           # run on live Coinbase data instead of the example data
//
// How it runs: a production Vite build goes to dist/ (as npm run build does), then the desktop app starts under Electron with a
// new, empty throwaway profile (--lv-profile=<temp folder>, deleted afterwards), so no saved workspace, key or cache on this
// machine is read or written. By default Coinbase is mocked unreachable in the main process (scripts/smoke-first-run/offline-net.cjs)
// so the chart shows the same example data every run; --live skips the mock.
// Each step is a named check with PASS or FAIL and a screenshot. A failed step does not stop the later ones. The last check fails
// on any console error or page error seen during the whole run. The candlestick guide button is only looked for, never clicked
// (it opens the browser). Screenshots and summary.json go to reports/ui-check/ (gitignored). Exit code 1 on any failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {_electron as electron} from 'playwright';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const args=process.argv.slice(2),flag=name=>args.includes('--'+name);
const REUSE=flag('reuse-build'),LIVE=flag('live');
const OUT=path.join(project,'reports','ui-check');
const OFFLINE_MOCK=path.join(project,'scripts','smoke-first-run','offline-net.cjs');
const SEARCH='input[aria-label="Search indicators"]';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const results=[],consoleProblems=[];
const started=Date.now();
let page=null,shotNumber=0;

// Runs one named check. Throwing (or a false return) fails it; a string return is shown as the detail.
async function check(name,run){
 const t0=Date.now(),row={name,ok:false,detail:'',seconds:0,screenshot:null};
 try{
  const detail=await run();
  row.ok=detail!==false;row.detail=typeof detail==='string'?detail:'';
 }catch(error){row.detail=String(error?.message??error).split('\n')[0].slice(0,300);}
 row.screenshot='step-'+String(++shotNumber).padStart(2,'0')+'-'+(row.ok?'pass':'fail')+'.png';
 try{await page.screenshot({path:path.join(OUT,row.screenshot)});}catch{row.screenshot=null;}
 row.seconds=Math.round((Date.now()-t0)/100)/10;
 results.push(row);
 console.log((row.ok?'  PASS ':'  FAIL ')+name+(row.detail?' ('+row.detail+')':''));
 return row.ok;
}
function expect(condition,message){if(!condition)throw new Error(message);}

const row=id=>page.locator('#lv-ind-row-'+id);
const pill=id=>page.locator('button[data-count-remove='+id+']');
const dialogOpen=async()=>(await page.locator(SEARCH).count())>0;
const openDialog=async()=>{if(await dialogOpen())return;await page.locator('[aria-label="Indicators"]').first().click();await page.locator(SEARCH).waitFor({timeout:10000});await sleep(500);};
const closeDialog=async()=>{if(!await dialogOpen())return;await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator(SEARCH).waitFor({state:'detached',timeout:10000});await sleep(300);};
const search=async query=>{await page.locator(SEARCH).fill(query);await sleep(400);};
const rowIds=()=>page.locator('[id^=lv-ind-row-]').evaluateAll(els=>els.map(el=>({id:el.id.slice('lv-ind-row-'.length),text:el.innerText.split('\n').map(s=>s.trim()).filter(Boolean)})));
// The "On this chart" list: one accessible label per instance, e.g. "Edit RSI 14 close #3".
const onChart=()=>page.locator('.instance-row .lv-instance-edit').evaluateAll(els=>els.map(el=>el.getAttribute('aria-label')));
const legendText=()=>page.locator('.indicator-legend').first().evaluate(el=>el.innerText).catch(()=>'');
const addFirstResult=async query=>{
 await openDialog();await search(query);
 const first=(await rowIds())[0];expect(first,'No search result for "'+query+'".');
 await row(first.id).hover();await row(first.id).locator('.lv-picker-add').click();await sleep(700);
 return first;
};
const bannerShown=()=>page.evaluate(()=>/Click a bar to anchor/.test(document.body.innerText));
const badText=()=>page.evaluate(()=>document.body.innerText.match(/NaN|undefined|Infinity/g));
async function readBars(){
 return page.evaluate(()=>{
  const heading=document.querySelector('.chart-workspace .chart-heading');
  const ohlc=heading?.querySelector('.ohlc')?.textContent?.trim()??'';
  const badge=heading?.querySelector('.synthetic-badge')?.textContent?.trim()??'';
  return {ohlc,badge,hasBars:/\d/.test(ohlc)&&badge!=='NO DATA'};
 });
}
// The price scale is drawn on the canvas, so its labels are not in the page text. Instead the strip along the right edge of the
// chart is screenshotted and the top and bottom bands must hold text pixels (a label that failed to draw leaves a blank band).
async function axisBands(file){
 const box=await page.locator('canvas').first().boundingBox();expect(box,'No chart canvas.');
 const clip={x:Math.max(0,box.x+box.width-72),y:box.y+4,width:68,height:Math.max(40,box.height-40)};
 const png=await page.screenshot({path:path.join(OUT,file),clip});
 return page.evaluate(async base64=>{
  const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  const counts=new Map();for(let i=0;i<data.length;i+=4){const key=data[i]+','+data[i+1]+','+data[i+2];counts.set(key,(counts.get(key)??0)+1);}
  let background='',best=0;for(const [key,count] of counts)if(count>best){best=count;background=key;}
  const ink=(from,to)=>{let n=0;for(let y=Math.floor(canvas.height*from);y<Math.floor(canvas.height*to);y++)for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4;if(data[i]+','+data[i+1]+','+data[i+2]!==background)n++;}return n;};
  return {top:ink(0,0.15),bottom:ink(0.85,1)};
 },png.toString('base64'));
}

async function main(){
 if(!REUSE){
  console.log('Building the app (production)...');
  await build({root:project,logLevel:'warn'});
 }
 if(!fs.existsSync(path.join(project,'dist','index.html')))throw new Error('dist/index.html is missing. Run without --reuse-build.');
 fs.rmSync(OUT,{recursive:true,force:true});fs.mkdirSync(OUT,{recursive:true});

 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'opencandle-uicheck-'));
 const env={...process.env};delete env.LV_ALPACA_STUB;delete env.ELECTRON_RUN_AS_NODE;
 let app=null;
 try{
  console.log('UI check on '+(LIVE?'live Coinbase':'example')+' data...');
  app=await electron.launch({executablePath:require('electron'),args:[project,'--lv-profile='+profile],env,timeout:60000});
  app.process().stderr?.on('data',()=>{});
  if(!LIVE){
   const ok=await app.evaluate((_electron,source)=>{(0,eval)(source);return globalThis.__opencandleSmokeOffline===true;},fs.readFileSync(OFFLINE_MOCK,'utf8'));
   if(!ok)throw new Error('The offline network mock did not load.');
  }
  // A fixed window size keeps the layout, and so the clicks, the same on every machine.
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setFullScreen(false);w.unmaximize();w.setContentSize(1440,920);});
  page=await app.firstWindow({timeout:60000});
  page.on('pageerror',error=>consoleProblems.push('page error: '+String(error?.message??error).slice(0,300)));
  page.on('console',message=>{if(message.type()==='error')consoleProblems.push('console error: '+message.text().slice(0,300));});
  await page.waitForLoadState('domcontentloaded');

  await check('1 App shows bars',async()=>{
   let bars=null;
   for(let i=0;i<120;i++){bars=await readBars().catch(()=>null);if(bars?.hasBars)break;await sleep(250);}
   expect(bars?.hasBars,'No bars within 30 s (badge "'+(bars?.badge??'')+'").');
   await sleep(1500);
   return LIVE?'badge "'+bars.badge+'"':'badge '+bars.badge;
  });

  let rsiId='rsi';
  await check('2 RSI added 3 times: "3 on chart" pill and 3 legends',async()=>{
   await openDialog();await search('rsi');
   const rows=await rowIds();expect(rows[0]?.id,'No RSI search result.');rsiId=rows[0].id;
   for(let i=0;i<3;i++){await row(rsiId).hover();await row(rsiId).locator('.lv-picker-add').click();await sleep(600);}
   await sleep(600);
   const pillBox=await pill(rsiId).boundingBox(),rowBox=await row(rsiId).boundingBox();
   expect(pillBox&&pillBox.width>4&&pillBox.height>4,'The count pill has no visible box.');
   expect(rowBox&&pillBox.x>=rowBox.x&&pillBox.y>=rowBox.y&&pillBox.x+pillBox.width<=rowBox.x+rowBox.width&&pillBox.y+pillBox.height<=rowBox.y+rowBox.height,'The count pill is not inside the RSI row.');
   const text=(await pill(rsiId).innerText()).trim();expect(/3\s+on chart/i.test(text),'Pill says "'+text+'", not "3 on chart".');
   const labels=await onChart();expect(labels.length===3,'The On this chart list has '+labels.length+' rows, not 3.');
   // The legends sit behind the dialog but are in the page.
   const legends=(await legendText()).split('\n').filter(line=>line.trim()==='RSI').length;
   expect(legends===3,legends+' RSI legends, not 3.');
   return '"'+text+'", '+legends+' legends';
  });

  await check('3 Hovering the pill shows the red remove state',async()=>{
   await pill(rsiId).hover();await sleep(400);
   const style=await pill(rsiId).evaluate(el=>{const c=getComputedStyle(el);return [c.color,c.backgroundColor,c.borderColor];});
   const red=css=>{const m=css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);return !!m&&Number(m[1])>=150&&Number(m[1])-Math.max(Number(m[2]),Number(m[3]))>=60;};
   expect(style.some(red),'No red text, fill or border on hover: '+style.join(' | '));
   return (await pill(rsiId).innerText()).trim();
  });

  await check('4 Clicking the pill removes the newest, adds none',async()=>{
   const before=await onChart();
   await pill(rsiId).click();await sleep(700);
   const after=await onChart();
   expect(before.length===3&&after.length===2,'Rows went from '+before.length+' to '+after.length+'.');
   expect(JSON.stringify(after)===JSON.stringify(before.slice(0,2)),'Not the newest one removed: '+after.join(', '));
   return after.length+' left';
  });

  await check('5 Close the dialog, Ctrl+Z brings back 3',async()=>{
   await closeDialog();
   await page.keyboard.press('Control+z');await sleep(800);
   await openDialog();
   const labels=await onChart();
   expect(labels.length===3,labels.length+' RSI rows after Ctrl+Z, not 3.');
   return labels.length+' on chart';
  });

  await check('6 Keyboard: Enter removes one; the last one hides the pill and focuses search',async()=>{
   await openDialog();await search('rsi');
   await pill(rsiId).focus();await page.keyboard.press('Enter');await sleep(600);
   const afterOne=(await onChart()).length;expect(afterOne===2,afterOne+' rows after the first Enter, not 2.');
   await pill(rsiId).focus();await page.keyboard.press('Enter');await sleep(600);
   expect((await onChart()).length===1,'Not 1 row after the second Enter.');
   await pill(rsiId).focus();await page.keyboard.press('Enter');await sleep(600);
   expect((await onChart()).length===0,'RSI rows are left after the third Enter.');
   expect(await pill(rsiId).count()===0,'The pill is still shown with nothing on the chart.');
   const focused=await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')??document.activeElement?.tagName);
   expect(focused==='Search indicators','Focus is on "'+focused+'", not the search box.');
   return 'focus on search';
  });

  await check('7 Search: the standard indicator comes first (rsi, macd, atr)',async()=>{
   const want={rsi:/^Relative Strength Index/i,macd:/^MACD$/i,atr:/^Average True Range/i},got=[];
   for(const [query,pattern] of Object.entries(want)){
    await search(query);const first=(await rowIds())[0];
    expect(first&&pattern.test(first.text[0]),'"'+query+'" lists "'+(first?.text[0]??'nothing')+'" first.');
    got.push(query+' -> '+first.text[0]);
   }
   return got.join('; ');
  });

  await check('8 Patterns tab shows the Candlestick guide button',async()=>{
   await search('');
   await page.locator('[role=tablist] [role=tab]',{hasText:/^Patterns$/}).first().click();await sleep(600);
   const button=page.locator('button.lv-picker-guide',{hasText:'Candlestick guide'}).first();
   await button.waitFor({timeout:5000});
   expect(await button.isVisible(),'The Candlestick guide button is not visible.');
   // Deliberately not clicked: it opens the browser.
  });

  await check('9 Anchored VWAP: placement banner, click a bar, anchor date in legend',async()=>{
   await page.locator('[role=tablist] [role=tab]',{hasText:/^Indicators$/}).first().click().catch(()=>{});
   await addFirstResult('anchored vwap');
   await closeDialog();await sleep(500);
   expect(await bannerShown(),'No placement banner after adding Anchored VWAP.');
   const box=await page.locator('canvas').first().boundingBox();
   await page.mouse.click(box.x+box.width*0.5,box.y+box.height*0.45);await sleep(1000);
   expect(!await bannerShown(),'The placement banner is still shown after clicking a bar.');
   const legend=await legendText(),date=legend.match(/\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?/);
   expect(date,'The legend shows no anchor date.');
   return 'anchored '+date[0];
  });

  await check('10 More indicators, history, interval 1D > 1h > 1D: no NaN, legends and price labels sane',async()=>{
   // Start from a clean chart.
   await openDialog();await search('anchored vwap');
   if(await pill('avwap').count())await pill('avwap').click();
   await sleep(400);
   await addFirstResult('relative volume');await addFirstResult('support and resistance zones');
   await closeDialog();await sleep(1500);
   const phases=[];
   const verify=async label=>{
    const bad=await badText();expect(!bad,label+': page text contains '+[...new Set(bad)].join(', ')+'.');
    const legend=(await legendText()).trim();expect(legend.length>0,label+': the legend is empty.');
    const bands=await axisBands('axis-'+label.replace(/\W+/g,'-')+'.png');
    expect(bands.top>20&&bands.bottom>20,label+': a price-scale label is missing (ink top '+bands.top+', bottom '+bands.bottom+').');
    phases.push(label);
   };
   await verify('start');
   // Scroll far back: zoom out, then drag the chart to the right repeatedly so older history loads.
   const box=await page.locator('canvas').first().boundingBox();
   const mid={x:box.x+box.width*0.5,y:box.y+box.height*0.4};
   await page.mouse.move(mid.x,mid.y);
   for(let i=0;i<30;i++){await page.mouse.wheel(0,600);await sleep(50);}
   await sleep(1200);
   for(let i=0;i<15;i++){await page.mouse.move(box.x+box.width*0.2,mid.y);await page.mouse.down();await page.mouse.move(box.x+box.width*0.8,mid.y,{steps:10});await page.mouse.up();await sleep(250);}
   await sleep(2500);
   await verify('scrolled back');
   const pickInterval=async text=>{
    await page.locator('#lv-interval-badge').click();await sleep(500);
    await page.locator('[role=menuitemradio]').filter({hasText:new RegExp('^'+text+'$')}).first().click();
    await sleep(4000);
   };
   await pickInterval('1 hour');await verify('1h');
   await pickInterval('1 day');await verify('back to 1D');
   return phases.join(', ');
  });
 }finally{
  if(app)await app.close().catch(()=>{});
  // Electron may hold the profile for a moment after closing.
  for(let tries=0;tries<20;tries++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(250);}}
 }
}

let harnessError=null;
try{await main();}catch(error){harnessError=String(error?.message??error).split('\n')[0];console.log('  Harness error: '+harnessError);}

if(page||results.length){
 results.push({name:'11 No console or page errors',ok:consoleProblems.length===0&&!harnessError,detail:harnessError?'run stopped early: '+harnessError:consoleProblems.length?consoleProblems.length+' problem(s): '+consoleProblems.slice(0,3).join(' | '):'none',seconds:0,screenshot:null});
 const last=results[results.length-1];console.log((last.ok?'  PASS ':'  FAIL ')+last.name+(last.detail?' ('+last.detail+')':''));
}else{
 results.push({name:'Harness',ok:false,detail:harnessError??'did not start',seconds:0,screenshot:null});
}

const seconds=Math.round((Date.now()-started)/1000);
console.log('\nUI check summary ('+(LIVE?'live':'example')+' data, '+seconds+' s)');
for(const r of results)console.log('  '+(r.ok?'PASS':'FAIL')+'  '+r.name.padEnd(86)+String(r.seconds).padStart(5)+' s');
fs.mkdirSync(OUT,{recursive:true});
fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify({at:new Date().toISOString(),data:LIVE?'live':'example',seconds,consoleProblems,results},null,2));
console.log('Screenshots and summary: '+OUT);
process.exitCode=results.every(r=>r.ok)?0:1;
