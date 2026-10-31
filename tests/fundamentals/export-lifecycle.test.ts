import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {FundamentalsDialog,type FundamentalsDialogProps} from '../../src/ui/FundamentalsDialog';
import {normalizeCompanyFacts,type FactsDocument} from '../../src/fundamentals/company-facts';

// Actual component handlers; no native Save dialog, DOM, filesystem export or GUI claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,writes:0,cleanups:[] as (()=>void)[]}));
vi.mock('react',async()=>{const actual=await vi.importActual<typeof import('react')>('react');return {...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.writes++;hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useMemo:(fn:()=>unknown)=>{hooks.cursor++;return fn();},
 useEffect:(fn:()=>void|(()=>void))=>{const i=hooks.cursor++;if(!(i in hooks.cells)){hooks.cells[i]=true;const cleanup=fn();if(cleanup)hooks.cleanups.push(cleanup);}},
};});
const content=(x:any):string=>typeof x==='string'||typeof x==='number'?String(x):Array.isArray(x)?x.map(content).join(''):x?.props?content(x.props.children):'';
function find(x:any,match:(x:any)=>boolean):any{if(Array.isArray(x)){for(const c of x){const r=find(c,match);if(r)return r;}}else if(x?.props)return match(x)?x:find(x.props.children,match);return null;}
const raw=JSON.parse(readFileSync('examples/companyfacts-LVDEMO-synthetic.json','utf8'));
const document=():FactsDocument=>({id:'synthetic:export',facts:normalizeCompanyFacts(raw),source:{kind:'synthetic',label:'SYNTHETIC export test',sourceUrl:null,sha256:null,retrievedAt:'2026-10-15T00:00:00Z'}});
function deferred(){let resolve!:(x:any)=>void,reject!:(x:any)=>void;const promise=new Promise<any>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
const flush=()=>new Promise<void>(done=>setTimeout(done,0));
function unmount(){for(const fn of hooks.cleanups.splice(0))fn();}
const failure=(message='Save failed')=>({ok:false,error:{code:'WRITE_FAILED',message}});
const cancelled=()=>({ok:false,error:{code:'CANCELLED',message:'Export cancelled.'}});
function mount(kind:'statement'|'facts'){
 const props:FundamentalsDialogProps={symbol:'LVDEMO',documents:[document()],onChange:vi.fn(()=>true),onClose:vi.fn(),now:()=>new Date('2026-10-15T12:00:00Z')};
 const bridge={exportData:vi.fn((_x:any):Promise<any>=>Promise.resolve({ok:true,value:null})),importData:vi.fn(()=>new Promise<any>(()=>{})),cancelSecRequest:vi.fn(()=>Promise.resolve({ok:true}))};vi.stubGlobal('window',{lv:bridge});
 const render=()=>{hooks.cursor=0;return FundamentalsDialog(props);};
 const node=(name:string)=>{const n=find(render(),x=>x.props['aria-label']===name||x.type==='button'&&content(x)===name);if(!n)throw Error('Missing '+name);return n;};
 const click=(name:string)=>node(name).props.onClick();
 if(kind==='facts')click('Reported facts');else render();
 const exportName=kind==='facts'?'Export selected facts CSV':'Export statement CSV';
 return{props,bridge,render,node,click,exportName,export:()=>click(exportName),change:(name:string,value:string)=>node(name).props.onChange({target:{value}}),error:()=>content(find(render(),x=>x.props.role==='alert')),headerClose:()=>render().props.onClose()};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.writes=0;hooks.cleanups=[];});
afterEach(()=>{unmount();vi.unstubAllGlobals();});
describe.each(['statement','facts'] as const)('%s CSV export lifecycle',kind=>{
 it.each(['structured','throw','reject'] as const)('shows the current %s error without losing data',async mode=>{
  const ui=mount(kind),before=JSON.stringify(ui.props.documents);
  if(mode==='structured')ui.bridge.exportData.mockResolvedValue(failure('Current failure'));
  else if(mode==='throw')ui.bridge.exportData.mockImplementation(()=>{throw Error('Current failure');});
  else ui.bridge.exportData.mockRejectedValue(Error('Current failure'));
  expect(()=>ui.export()).not.toThrow();await flush();expect(ui.error()).toContain('Current failure');expect(JSON.stringify(ui.props.documents)).toBe(before);
 });
 it.each(['footer','header','unmount'] as const)('retires pending and retained handlers on %s close',async action=>{
  const ui=mount(kind),pending=deferred();ui.bridge.exportData.mockReturnValue(pending.promise);const old=ui.node(ui.exportName).props.onClick;old();
  if(action==='footer')ui.click('Close');else if(action==='header')ui.headerClose();else unmount();
  const writes=hooks.writes;old();pending.reject(Error('Late failure'));await flush();expect(ui.bridge.exportData).toHaveBeenCalledTimes(1);expect(hooks.writes).toBe(writes);
 });
 it.each(['same-id','removed'] as const)('rejects completion and retained dispatch after document %s',async replacement=>{
  const ui=mount(kind),pending=deferred();ui.bridge.exportData.mockReturnValue(pending.promise);const old=ui.node(ui.exportName).props.onClick;old();
  ui.props.documents=replacement==='same-id'?[document()]:[];ui.render();const writes=hooks.writes;old();pending.resolve(failure('Old data failure'));await flush();expect(ui.bridge.exportData).toHaveBeenCalledTimes(1);expect(hooks.writes).toBe(writes);
 });
 it('retires before rerender when an export filter changes',async()=>{
  const ui=mount(kind),pending=deferred();ui.bridge.exportData.mockReturnValue(pending.promise);const old=ui.node(ui.exportName).props.onClick;
  const filter=ui.node(kind==='statement'?'Statement scale':'Search fundamental fields').props.onChange;old();filter({target:{value:kind==='statement'?'units':'Revenue'}});
  const writes=hooks.writes;old();pending.resolve(failure('Old filter failure'));await flush();expect(ui.bridge.exportData).toHaveBeenCalledTimes(1);expect(hooks.writes).toBe(writes);
 });
 it('retires an export when native import begins',async()=>{
  const ui=mount(kind),pending=deferred();ui.bridge.exportData.mockReturnValue(pending.promise);const old=ui.node(ui.exportName).props.onClick;old();ui.click('Import JSON file');const writes=hooks.writes;
  old();pending.resolve(failure('Old export failure'));await flush();expect(ui.bridge.exportData).toHaveBeenCalledTimes(1);expect(hooks.writes).toBe(writes);
 });
 it('allows only the latest export response to report an error',async()=>{
  const ui=mount(kind),first=deferred(),second=deferred();ui.bridge.exportData.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);ui.export();ui.export();
  second.resolve(failure('Second error'));await flush();expect(ui.error()).toContain('Second error');first.resolve(failure('First late error'));await flush();expect(ui.error()).toContain('Second error');expect(ui.error()).not.toContain('First late error');
 });
 it('treats native cancellation and success as neutral, preserving the current error',async()=>{
  const ui=mount(kind);ui.bridge.exportData.mockResolvedValueOnce(failure('Keep this error')).mockResolvedValueOnce(cancelled()).mockResolvedValueOnce({ok:true,value:null});
  ui.export();await flush();expect(ui.error()).toContain('Keep this error');const writes=hooks.writes;ui.export();await flush();ui.export();await flush();expect(hooks.writes).toBe(writes);expect(ui.error()).toContain('Keep this error');
 });
 it('reports unavailable native export rather than throwing',async()=>{
  const ui=mount(kind);vi.stubGlobal('window',{});ui.export();await flush();expect(ui.error()).toContain('desktop app');
 });
 it('keeps deterministic CSV bytes and source data unchanged across successful exports',async()=>{
  const ui=mount(kind),before=JSON.stringify(ui.props.documents);if(kind==='facts')ui.change('Reported fundamental field','us-gaap:Revenues');ui.export();await flush();ui.export();await flush();const [a,b]=ui.bridge.exportData.mock.calls.map(c=>c[0]);
  expect(a).toEqual(b);expect(a.format).toBe('csv');expect(a.suggestedName).toMatch(/^OpenCandle-SYNTHETIC-/);expect(a.text).toMatch(/^"source_kind","source_url","retrieved_at","cik","entity",/);expect(a.text).toContain('"synthetic","","2026-10-15T00:00:00Z","0000424242","LV SYNTHETIC DEMO COMPANY"');expect(a.text).not.toContain('\n\n');expect(JSON.stringify(ui.props.documents)).toBe(before);
  if(kind==='facts')expect(a.text).toBe('"source_kind","source_url","retrieved_at","cik","entity","concept","unit","start","end","value","filed","form","accession","ambiguous"\r\n'+
   '"synthetic","","2026-10-15T00:00:00Z","0000424242","LV SYNTHETIC DEMO COMPANY","us-gaap:Revenues","USD","2023-01-01","2023-12-31","1000","2024-02-20","10-K","0000424242-24-000001","no"');
 });
});
