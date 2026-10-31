import {beforeAll,afterAll,beforeEach,afterEach,expect,it} from 'vitest';
import {chromium,type Browser,type BrowserContext,type Page} from 'playwright';
import {createServer,type ViteDevServer} from 'vite';
import {mkdtempSync,existsSync,statSync,rmSync,lstatSync,realpathSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname,isAbsolute,join,basename} from 'node:path';
type StableScaleFixtureState=ReturnType<typeof import('./stable-scale-overlay-browser-fixture').readStableScaleFixture>;

// Genuine DOM/layout/input of actual menu+port in a fresh HEADLESS synthetic
// browser context. No Electron app, owner display/profile, feeds, screenshots,
// native chart paint or external network. A Root worker grant is still required.
const project=process.cwd().replaceAll('\\','/'),sourceRoot=(process.env.LV_SCALE_OVERLAY_SOURCE_ROOT??project).replaceAll('\\','/'),roots=[...new Set([sourceRoot,project])];
let server:ViteDevServer|undefined,browser:Browser|undefined,context:BrowserContext|undefined,page:Page,origin:string,fixtureUrl:string,temporary:string;
const errors:string[]=[];let external=0;
function mapped(value:string){value=value.replaceAll('\\','/');const root=roots.find(root=>value.startsWith(root+'/'));if(!root)return null;const relative=value.slice(root.length+1);if(!/^(src|tests)\//.test(relative))return null;for(const owner of roots)for(const suffix of ['','.ts','.tsx','.js','/index.ts']){const file=owner+'/'+relative+suffix;if(existsSync(file)&&statSync(file).isFile())return file;}return null;}

// Capture native filesystem operations before any browser/test callbacks.
const cleanupLstat=lstatSync,cleanupRealpath=realpathSync,cleanupReaddir=readdirSync;
/** Validate the exact owned TEMP target, every ancestor and the entire tree
 * BEFORE recursive deletion. A junction/link/redirect or unknown entry refuses
 * cleanup and preserves the directory for inspection. */
function verifyOwnedTemporaryTree(directory:string){
 const target=resolve(directory),parent=resolve(tmpdir());
 if(dirname(target)!==parent||!basename(target).startsWith('lv-synthetic-scale-overlay-'))throw Error('Synthetic TEMP cleanup escaped its exact new directory.');
 const ordinary=(value:string)=>{const absolute=resolve(value),stat=cleanupLstat(absolute);if(stat.isSymbolicLink()||cleanupRealpath(absolute).toLowerCase()!==absolute.toLowerCase())throw Error('Synthetic TEMP cleanup refuses a link or redirected path.');return stat;};
 for(let ancestor=target;;ancestor=dirname(ancestor)){ordinary(ancestor);if(dirname(ancestor)===ancestor)break;}
 const walk=(value:string)=>{const stat=ordinary(value);if(stat.isDirectory()){for(const name of cleanupReaddir(value))walk(join(value,name));}else if(!stat.isFile())throw Error('Synthetic TEMP cleanup refuses an unknown filesystem entry.');};
 walk(target);
}

let setupRetired=false,setupSettled=false,setupStarted=0,setupSequence=0,setupFlight:Promise<void>|null=null;
function setupNote(stage:string){if(setupSequence>=24)return;try{console.info('LV_SYNTHETIC_SCALE_SETUP',JSON.stringify({stage,sequence:++setupSequence,elapsedMs:Math.round(performance.now()-setupStarted)}));}catch{/* Diagnostics never affect setup or cleanup. */}}
beforeAll(async()=>{
 setupStarted=performance.now();
 setupFlight=(async()=>{try{
   temporary=mkdtempSync(join(tmpdir(),'lv-synthetic-scale-overlay-'));setupNote('temp-created');
   setupNote('create-server-start');
   const created=await createServer({configFile:resolve('vite.config.ts'),configLoader:'runner',root:project,envDir:temporary+'/env',publicDir:false,cacheDir:temporary+'/vite',optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react-dom','react/jsx-runtime','react/jsx-dev-runtime']},server:{host:'127.0.0.1',port:0,strictPort:true,watch:null,fs:{allow:[project]}},plugins:[{name:'synthetic-scale-overlay-sparse-source',enforce:'pre',configureServer(value){value.middlewares.use('/synthetic-scale-fixture',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body></body></html>');});},resolveId(source,importer){if(source.startsWith('.')&&importer)return mapped(resolve(dirname(importer.split('?')[0]),source));if(isAbsolute(source))return mapped(source);return null;}}]});
   setupNote('create-server-resolved');if(setupRetired){await created.close();throw Error('Synthetic setup retired before server adoption.');}server=created;
   setupNote('listen-start');await created.listen();setupNote('listen-resolved');if(setupRetired){await created.close();throw Error('Synthetic setup retired before browser launch.');}
   origin='http://127.0.0.1:'+((server.httpServer!.address()) as {port:number}).port;fixtureUrl=origin+'/@fs/'+sourceRoot+'/tests/ui/stable-scale-overlay-browser-fixture.tsx';
   setupNote('browser-launch-start');
   const launched=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,timeout:60000,args:['--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check']});
   setupNote('browser-launch-resolved');if(setupRetired){await launched.close();throw Error('Synthetic setup retired before browser adoption.');}browser=launched;
  }finally{setupSettled=true;setupNote('setup-settled');}
 })();await setupFlight;
},90000);
beforeEach(async()=>{errors.length=0;external=0;context=await browser!.newContext({viewport:{width:1000,height:720}});page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});await page.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external++;return route.abort();});await page.goto(origin+'/synthetic-scale-fixture');await page.evaluate('import('+JSON.stringify(fixtureUrl)+').then(f=>f.setupStableScaleFixture())');});
afterEach(async()=>{try{if(page&&!page.isClosed())await page.evaluate('import('+JSON.stringify(fixtureUrl)+').then(f=>f.closeStableScaleFixture())');}finally{await context?.close();context=undefined;}expect(external).toBe(0);expect(errors).toEqual([]);});
afterAll(async()=>{
 setupRetired=true;setupNote('cleanup-start');const failures:unknown[]=[];
 // Close every adopted resource even if another close throws. A handle that
 // arrives after retirement closes itself before adoption in the setup task.
 for(const close of [()=>browser?.close(),()=>server?.close()])try{await close();}catch(error){failures.push(error);}
 if(!setupSettled){setupNote('cleanup-preserved-pending');throw new AggregateError(failures,'Synthetic setup is still pending; owned TEMP preserved.');}
 if(failures.length){setupNote('cleanup-preserved-close-error');throw new AggregateError(failures,'Synthetic browser/server cleanup failed; owned TEMP preserved.');}
 if(temporary){verifyOwnedTemporaryTree(temporary);rmSync(temporary,{recursive:true,force:false});}
 setupNote('cleanup-complete');
});
async function read(){return page.evaluate<StableScaleFixtureState>('import('+JSON.stringify(fixtureUrl)+').then(f=>f.readStableScaleFixture())');}
async function open(){await page.getByRole('button',{name:'Open synthetic time-scale menu',exact:true}).click();await page.getByRole('menu',{name:'Time scale menu',exact:true}).waitFor();}

it('keeps the actual time-menu root anchored while a long timezone submenu opens hovers and closes',async()=>{
 await open();const initial=await read();await page.getByRole('menuitem',{name:'Timezone',exact:true}).hover();await page.getByRole('menu',{name:'Timezone',exact:true}).waitFor();const submenu=await read();await page.getByRole('menuitem',{name:'Reset time scale',exact:true}).hover();const closed=await read();expect(submenu.submenuScroll!.content).toBeGreaterThan(submenu.submenuScroll!.height);expect(submenu.root).toEqual(initial.root);expect(closed.root).toEqual(initial.root);expect(closed.submenu).toBeNull();
});
it('does not use global ancestor-scrolling focus when the pointer moves across actual scale-menu rows',async()=>{
 await open();const initial=await read();await page.getByRole('menuitem',{name:'Timezone',exact:true}).hover();await page.getByRole('menuitemcheckbox',{name:'Day of week on labels',exact:true}).hover();const after=await read();expect(after.globalScrollCalls).toBe(0);expect(after.parentScroll).toEqual(initial.parentScroll);expect(after.pageScroll).toEqual(initial.pageScroll);
});
it('keyboard End reveals the last real timezone row by scrolling only its own submenu',async()=>{
 await open();const initial=await read();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowRight');await page.keyboard.press('End');const after=await read();expect(after.submenuScroll!.top).toBeGreaterThan(0);expect(after.focusedBox!.top).toBeGreaterThanOrEqual(after.submenu!.top);expect(after.focusedBox!.bottom).toBeLessThanOrEqual(after.submenu!.bottom+1);expect(after.parentScroll).toEqual(initial.parentScroll);expect(after.pageScroll).toEqual(initial.pageScroll);expect(after.globalScrollCalls).toBe(0);
});
it('native wheel scrolling stays inside the real timezone list and does not enter chart capture or bubble to its host',async()=>{
 await open();await page.getByRole('menuitem',{name:'Timezone',exact:true}).hover();const menu=page.getByRole('menu',{name:'Timezone',exact:true});await menu.hover();const before=await read();await page.mouse.wheel(0,400);await expect.poll(async()=>((await read()).submenuScroll?.top??0)).toBeGreaterThan(before.submenuScroll!.top);await page.mouse.wheel(0,10000);await expect.poll(async()=>{const state=(await read()).submenuScroll!;return state.top+state.height>=state.content-1;}).toBe(true);await page.mouse.wheel(0,400);const after=await read();expect(after.wheelBegins).toBe(0);expect(after.wheelBubbles).toBe(0);expect(after.parentScroll).toEqual(before.parentScroll);expect(after.pageScroll).toEqual(before.pageScroll);
});
it('outside chart wheel input still enters the unchanged gesture disposition and reaches its host',async()=>{
 await open();await page.keyboard.press('Escape');await page.getByRole('button',{name:'Synthetic chart input',exact:true}).hover();await page.mouse.wheel(0,100);await expect.poll(async()=>(await read()).wheelBegins).toBe(1);expect((await read()).wheelBubbles).toBe(1);
});
it('a real time-scale menu action stays outside chart pointer capture and invokes the unchanged host action once',async()=>{
 await open();await page.getByRole('menuitemcheckbox',{name:'Session breaks',exact:true}).click();const result=await read();expect(result.actions).toBe(1);expect(result.pointerBegins).toBe(0);expect(result.menuOpen).toBe(false);await page.getByRole('button',{name:'Synthetic chart input',exact:true}).click();expect((await read()).pointerBegins).toBe(1);
});
it('a genuinely long own-row menu still clamps and scrolls instead of losing its viewport fallback',async()=>{
 const result=await page.evaluate<StableScaleFixtureState>('import('+JSON.stringify(fixtureUrl)+').then(f=>f.openLongOwnScaleMenu())');expect(result.root!.top).toBeGreaterThanOrEqual(4);expect(result.root!.bottom).toBeLessThanOrEqual(716);expect(result.rootScroll!.content).toBeGreaterThan(result.rootScroll!.height);expect(result.rootScroll!.height).toBeGreaterThan(600);
});
