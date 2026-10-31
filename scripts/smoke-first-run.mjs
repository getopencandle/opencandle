#!/usr/bin/env node
// First-run smoke check: a brand-new user must land on a chart with bars, live or example, within a few seconds.
//
//   npm run smoke:first-run                     # production build, then both cases
//   npm run smoke:first-run -- --reuse-build    # use the current dist/ without rebuilding
//   npm run smoke:first-run -- --case offline   # live | offline | all (default)
//   npm run smoke:first-run -- --timeout 30     # seconds each case may take to show bars (default 25)
//
// How it runs: a production Vite build goes to dist/ (as npm run build does), then the desktop app starts under Electron
// with a new, empty throwaway profile (--lv-profile=<temp folder>, deleted afterwards), so no saved workspace, key or cache on
// this machine is read or written. Each case gets its own fresh profile.
// - live: the real network. Passes when the chart shows bars: live BTC-USD from Coinbase, or the example-data fallback if
//   Coinbase is unreachable from this machine (both are a working first run; the result says which one it was).
// - offline: Coinbase is mocked unreachable in the main process (scripts/smoke-first-run/offline-net.cjs). Passes only when
//   the chart falls back to example data with the one-line message and the Try live again button.
// Both cases also fail if the window shows the needs-live-data card or any mention of Alpaca (no stock-key prompt on first run).
// Screenshots and a JSON summary go to reports/smoke-first-run/ (gitignored). Exit code 1 on any failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {_electron as electron} from 'playwright';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const args=process.argv.slice(2),flag=name=>args.includes('--'+name),opt=(name,fallback)=>{const i=args.indexOf('--'+name);return i>=0&&args[i+1]!==undefined?args[i+1]:fallback;};
const CASE=opt('case','all'),TIMEOUT_MS=Math.max(5,Number(opt('timeout',25)))*1000,REUSE=flag('reuse-build');
const OUT=path.join(project,'reports','smoke-first-run');
const OFFLINE_MOCK=path.join(project,'scripts','smoke-first-run','offline-net.cjs');
if(!['live','offline','all'].includes(CASE))throw new Error('--case must be live, offline or all.');

async function readScreen(page){
 return page.evaluate(()=>{
  const heading=document.querySelector('.chart-workspace .chart-heading');
  const badge=heading?.querySelector('.synthetic-badge')?.textContent?.trim()??'';
  const ohlc=heading?.querySelector('.ohlc')?.textContent?.trim()??'';
  const banner=document.querySelector('[data-lv-example-banner]');
  const status=document.querySelector('.statusbar output')?.textContent?.trim()??'';
  return {badge,ohlc,hasBars:/\d/.test(ohlc)&&badge!=='NO DATA',
   banner:banner?.textContent?.trim()??null,retry:!!banner&&[...banner.querySelectorAll('button')].some(b=>b.textContent?.trim()==='Try live again'),
   needsLiveCard:!!document.querySelector('[data-lv-needs-live]'),alpacaText:/alpaca/i.test(document.body.innerText),
   status,title:document.title};
 });
}

async function runCase(name){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'opencandle-smoke-'));
 const env={...process.env};delete env.LV_ALPACA_STUB;delete env.ELECTRON_RUN_AS_NODE;
 const started=Date.now(),result={case:name,ok:false,outcome:'none',seconds:null,problems:[],screen:null,mainLog:[]};
 let app=null;
 try{
  app=await electron.launch({executablePath:require('electron'),args:[project,'--lv-profile='+profile],env,timeout:60000});
  app.process().stderr?.on('data',chunk=>{const text=String(chunk).trim();if(text&&result.mainLog.length<40)result.mainLog.push(text.slice(0,300));});
  // Offline: Coinbase is made unreachable in the main process right after launch, before the window has loaded (the first
  // Coinbase request waits for the window, the saved-workspace read and the key check).
  if(name==='offline')result.offlineMock=await app.evaluate((_electron,source)=>{(0,eval)(source);return globalThis.__opencandleSmokeOffline===true;},fs.readFileSync(OFFLINE_MOCK,'utf8'));
  const page=await app.firstWindow({timeout:60000});
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(String(error?.message??error).slice(0,300)));
  await page.waitForLoadState('domcontentloaded');
  let screen=null,seenCard=false,seenAlpaca=false,barsAt=null;
  while(Date.now()-started<TIMEOUT_MS){
   screen=await readScreen(page).catch(()=>null);
   if(screen){seenCard||=screen.needsLiveCard;seenAlpaca||=screen.alpacaText;}
   const done=screen?.hasBars&&(name==='offline'?!!screen.banner:true);
   if(done){barsAt=Date.now();break;}
   await page.waitForTimeout(250);
  }
  // Let a moment pass so a late card or prompt would show up too.
  await page.waitForTimeout(1500);
  const settled=await readScreen(page).catch(()=>screen);
  if(settled){seenCard||=settled.needsLiveCard;seenAlpaca||=settled.alpacaText;}
  result.screen=settled;result.seconds=barsAt?Math.round((barsAt-started)/100)/10:null;
  fs.mkdirSync(OUT,{recursive:true});await page.screenshot({path:path.join(OUT,name+'.png')}).catch(()=>{});
  if(!barsAt||!settled?.hasBars)result.problems.push('No bars on the chart within '+TIMEOUT_MS/1000+' s of launch (badge "'+(settled?.badge??'')+'").');
  if(name==='offline'&&result.offlineMock!==true)result.problems.push('The offline network mock did not load.');
  result.outcome=settled?.banner?'example fallback':settled?.hasBars?'live':'none';
  if(name==='offline'){
   if(!settled?.banner?.includes('Coinbase could not be reached'))result.problems.push('The example banner does not say Coinbase could not be reached.');
   if(!settled?.retry)result.problems.push('No "Try live again" button.');
   if(settled?.badge!=='EXAMPLE')result.problems.push('The chart badge is "'+(settled?.badge??'')+'", not EXAMPLE.');
   // Try live again while still offline: the chart must come back to example data with bars, never stay blank.
   if(settled?.retry){
    await page.locator('[data-lv-example-banner] button',{hasText:'Try live again'}).click();
    const retryStart=Date.now();let again=null;
    while(Date.now()-retryStart<TIMEOUT_MS){await page.waitForTimeout(250);again=await readScreen(page).catch(()=>null);if(again){seenCard||=again.needsLiveCard;seenAlpaca||=again.alpacaText;}if(again?.hasBars&&again.banner&&again.retry&&Date.now()-retryStart>1000)break;}
    result.retry=again;
    if(!(again?.hasBars&&again.banner&&again.retry))result.problems.push('After Try live again (still offline) the chart did not return to example data with bars.');
   }
  }else if(result.outcome==='live'&&/NO DATA|EXAMPLE|DEMO/.test(settled?.badge??''))result.problems.push('Unexpected badge "'+(settled?.badge??'')+'" on the live chart.');
  if(seenCard)result.problems.push('The needs-live-data card was shown.');
  if(seenAlpaca)result.problems.push('The window mentioned Alpaca on first run.');
  if(pageErrors.length)result.problems.push('Page errors: '+pageErrors.join(' | '));
  result.ok=result.problems.length===0;
 }catch(error){result.problems.push('Harness error: '+String(error?.message??error).split('\n')[0]);}
 finally{
  if(app)await app.close().catch(()=>{});
  // Electron may hold the profile for a moment after closing.
  for(let tries=0;tries<20;tries++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await new Promise(resolve=>setTimeout(resolve,250));}}
 }
 return result;
}

if(!REUSE){
 console.log('Building the app (production)...');
 await build({root:project,logLevel:'warn'});
}
if(!fs.existsSync(path.join(project,'dist','index.html')))throw new Error('dist/index.html is missing. Run without --reuse-build.');
const cases=CASE==='all'?['live','offline']:[CASE],results=[];
for(const name of cases){
 console.log('First-run smoke: '+name+'...');
 const result=await runCase(name);results.push(result);
 console.log((result.ok?'  PASS ':'  FAIL ')+name+': '+result.outcome+(result.seconds!==null?', bars '+result.seconds+' s after launch':'')+(result.screen?' (badge '+result.screen.badge+', status "'+result.screen.status+'")':''));
 for(const problem of result.problems)console.log('    - '+problem);
}
fs.mkdirSync(OUT,{recursive:true});
fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify({at:new Date().toISOString(),timeoutSeconds:TIMEOUT_MS/1000,results},null,2));
console.log('Screenshots and summary: '+OUT);
process.exitCode=results.every(row=>row.ok)?0:1;
