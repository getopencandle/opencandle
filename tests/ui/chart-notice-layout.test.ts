import {afterAll,afterEach,expect,it} from 'vitest';
import {chromium,type Browser} from 'playwright';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {actualMarkup,cellFixture,type NoticeMode} from './status-overlay-fixture';
const home=resolve('.tmp/codex-status-overlays');
function sourceFiles(mode:unknown='main'){
 if(mode!=='main'&&mode!=='stage'&&mode!=='baseline')throw Error('Choose an explicit known chart-notice test source mode.');
 return{components:mode==='main'?resolve('src/ui/components.css'):resolve(home,mode==='stage'?'lane':'base','src/ui/components.css'),report:resolve(home,mode==='main'?'main-test-layout.json':'portability-'+mode+'-layout.json')};
}
// Main suites exercise main CSS. Author sparse/baseline runs opt in explicitly and never replace frozen receipts.
const mode=process.env.LV_STATUS_OVERLAY_SOURCE_MODE??(process.env.LV_STATUS_OVERLAY_BASELINE==='1'?'baseline':'main'),files=sourceFiles(mode),css=['indicator-legend.css','styles.css','components.css','analysis.css','news.css'].map(name=>readFileSync(name==='components.css'?files.components:resolve('src/ui',name),'utf8')).join('\n');
const receipts:unknown[]=[],fixtures:ReturnType<typeof cellFixture>[]=[];let browser:Browser|undefined;
afterEach(()=>{for(const fixture of fixtures.splice(0))fixture.dispose();});afterAll(async()=>{try{await browser?.close();}finally{mkdirSync(home,{recursive:true});writeFileSync(files.report,JSON.stringify({scope:'Actual controlled component output plus offline static headless CSS; no app/native chart/feed/desktop input/capture.',mode,componentsCss:files.components,receipts},null,2)+'\n');}});
async function measure(mode:NoticeMode,height=640,dock=0){
 const fixture=cellFixture();fixtures.push(fixture);const output=actualMarkup(fixture,mode);browser??=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check']});
 const context=await browser.newContext({viewport:{width:1100,height:1000},offline:true});
 try{const page=await context.newPage();let requests=0;await page.route('**/*',route=>{requests++;return route.abort();});
  await page.setContent('<!doctype html><html><head><style>'+css+'</style></head><body><div class="chart-workspace" style="width:1000px;height:'+height+'px;display:flex">'+output.html+(dock?'<div style="height:'+dock+'px;flex:0 0 auto" aria-label="SYNTHETIC reserved dock"></div>':'')+'</div></body></html>');
  const result=await page.evaluate(()=>{const canvas=document.querySelector('.chart-canvas')!,stack=document.querySelector('.lv-chart-notices'),retry=[...document.querySelectorAll('button')].find(node=>node.textContent==='Retry chart scripts');const c=canvas.getBoundingClientRect();return{canvas:{top:c.top,bottom:c.bottom,width:c.width,height:c.height},stack:stack?{position:getComputedStyle(stack).position,pointer:getComputedStyle(stack).pointerEvents,bottom:stack.getBoundingClientRect().bottom}:null,status:[...document.querySelectorAll('.script-binding-status,.script-binding-errors,.lv-history-edge')].map(node=>({text:node.textContent,role:node.getAttribute('role'),pointer:getComputedStyle(node).pointerEvents})),retry:retry?{pointer:getComputedStyle(retry).pointerEvents,hit:document.elementFromPoint(retry.getBoundingClientRect().left+retry.getBoundingClientRect().width/2,retry.getBoundingClientRect().top+retry.getBoundingClientRect().height/2)===retry}:null};});
  if(mode==='error'||mode==='both'||mode==='all'){await page.getByRole('button',{name:'Retry chart scripts',exact:true}).focus();expect(await page.evaluate(()=>document.activeElement?.textContent)).toBe('Retry chart scripts');expect(output.retry).toHaveLength(1);output.retry[0]();}
  expect(result.canvas.height).toBeGreaterThan(200);expect(result.canvas.width).toBeGreaterThan(200);expect(requests).toBe(0);receipts.push({mode,height,dock,...result,requests,browserVersion:browser.version()});return result;
 }finally{output.dispose();await context.close();}
}
for(const mode of ['waiting','error'] as const)it(`${mode} status geometry never removes chart height`,async()=>{const before=await measure('none'),shown=await measure(mode),after=await measure('none');expect(shown.status.some(row=>row.role===(mode==='error'?'alert':'status'))).toBe(true);expect(shown.canvas).toEqual(before.canvas);expect(after.canvas).toEqual(before.canvas);});
it('default main source and explicit sparse modes keep current-main CSS and author receipts separate',()=>{
 expect(sourceFiles().components).toBe(resolve('src/ui/components.css'));expect(sourceFiles().report).toBe(resolve(home,'main-test-layout.json'));
 expect(sourceFiles('stage').components).toBe(resolve(home,'lane/src/ui/components.css'));expect(sourceFiles('baseline').components).toBe(resolve(home,'base/src/ui/components.css'));
 for(const selected of ['main','stage','baseline']){expect(sourceFiles(selected).report).not.toBe(resolve(home,'fixed-layout.json'));expect(sourceFiles(selected).report).not.toBe(resolve(home,'baseline-layout.json'));}
 expect(()=>sourceFiles('unknown')).toThrow();
});
it('waiting error and active-cell history notices stack without consuming height and Retry alone receives input',async()=>{const before=await measure('none'),shown=await measure('all');expect(shown.canvas).toEqual(before.canvas);expect(shown.status).toHaveLength(3);expect(shown.status.every(row=>row.pointer==='none')).toBe(true);expect(shown.retry).toEqual({pointer:'auto',hit:true});expect(shown.stack?.position).toBe('absolute');});
it('history stays within the resized chart cell above a reserved dock without changing its dimensions',async()=>{for(const height of [640,900]){const before=await measure('none',height,220),shown=await measure('history',height,220);expect(shown.canvas).toEqual(before.canvas);expect(shown.status.map(row=>row.text)).toContain('SYNTHETIC older history is temporarily unavailable.');expect(shown.stack!.bottom).toBeLessThan(shown.canvas.bottom);}});
