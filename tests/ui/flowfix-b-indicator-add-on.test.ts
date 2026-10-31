import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {IndicatorDialog} from '../../src/ui/IndicatorDialog';
import {createIndicatorLibrary} from '../../src/ui/indicator-library';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {encodeIndicatorSource,INDICATOR_SOURCE_KINDS} from '../../src/domain/indicator-source';
import {nativeCoreHarness} from '../chart/native-core-harness';

// Legend More > "Add indicator/strategy on RSI..." must add the picked indicator
// onto RSI: RSI's first plot as Source and RSI's pane. Actual IndicatorDialog handlers with deterministic hook cells,
// driven against the REAL indicator port on the pinned native core harness (as tests/review/review-c10.test.ts).
// SYNTHETIC bars. Not a DOM mount and not packaged GUI evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
function findAll(tree:any,predicate:(node:any)=>boolean):any[]{const out:any[]=[];const visit=(node:any)=>{if(Array.isArray(node))return node.forEach(visit);if(!node?.props)return;if(predicate(node))out.push(node);visit(node.props.children);};visit(tree);return out;}
const scopes=new Map<string,any[]>();
function renderIn<T>(scope:string,fn:()=>T):T{if(!scopes.has(scope))scopes.set(scope,[]);hooks.cells=scopes.get(scope)!;hooks.cursor=0;return fn();}
beforeEach(()=>{scopes.clear();});afterEach(()=>vi.unstubAllGlobals());
const bars=Array.from({length:60},(_,i)=>({time:1700000000000+i*60000,open:10+Math.sin(i),high:12+Math.sin(i),low:9+Math.sin(i),close:11+Math.sin(i/2)*3,volume:i+1}));

async function realDialog(){
 const t=await nativeCoreHarness();const port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim,()=>({resolution:'1m'}));t.core.bars=bars;
 const chart:any={indicators:port,chart:t.chart,getCalculationBars:()=>structuredClone(t.core.bars)};const library=createIndicatorLibrary();
 const props:any={chart,ownerToken:{},onLibraryChange:()=>true,onClose:vi.fn(),onChange:vi.fn(()=>true)};
 const render=(extra:Record<string,unknown>={},scope='dialog')=>renderIn(scope,()=>IndicatorDialog({...props,...extra,instances:port.list(),library}));
 const addLabels=(tree:any)=>findAll(tree,node=>typeof node.props?.['aria-label']==='string'&&node.props['aria-label'].startsWith('Add ')).map(node=>node.props['aria-label'] as string);
 const click=(tree:any,label:string)=>{const node=findAll(tree,item=>item.props?.['aria-label']===label)[0];if(!node)throw Error('Missing '+label);node.props.onClick();};
 return {t,port,render,addLabels,click,dispose(){port.dispose();t.dispose();}};
}

it('Add indicator on RSI: SMA takes RSI as its source, lands in the RSI pane and calculates from RSI values',async()=>{
 const d=await realDialog();try{
  d.click(d.render(),'Add Relative Strength Index');const rsi=d.port.list()[0];expect(rsi.kind).toBe('rsi');expect(rsi.paneId).not.toBe('price');
  const onRsi=d.render({addOn:rsi.id},'add-on');
  expect(findAll(onRsi,node=>typeof node.props?.title==='string'&&node.props.title.startsWith('Add indicator on ')).length).toBe(1);
  const offered=d.addLabels(onRsi);expect(offered).toContain('Add Simple Moving Average');
  // Only kinds whose Source accepts another indicator's plot are offered on RSI.
  const all=d.addLabels(d.render({},'plain'));expect(offered.length).toBeLessThan(all.length);
  d.click(onRsi,'Add Simple Moving Average');
  const rows=d.port.list(),sma=rows.find(row=>row.kind==='sma')!;
  expect(sma.inputs.source).toBe(encodeIndicatorSource(rsi.id,'rsi'));
  expect(sma.paneId).toBe(rows.find(row=>row.id===rsi.id)!.paneId);expect(sma.paneId).not.toBe('price');
  const saved=d.port.serialize();expect(saved.find(row=>row.id===sma.id)!.paneId).toBe(saved.find(row=>row.id===rsi.id)!.paneId);
  const values=(Array.from(d.port.values(sma.id).series[0].values) as number[]).filter(Number.isFinite);expect(sma.diagnostics).toEqual([]);expect(values.length).toBeGreaterThan(0);
  // RSI is bounded 0..100, so an SMA of RSI is too and differs from an SMA of the 8..14 SYNTHETIC closes.
  expect(values.every(value=>value>=0&&value<=100)).toBe(true);expect(values.some(value=>value>20)).toBe(true);
 }finally{d.dispose();}
});

it('without addOn the plain picker is unchanged: SMA goes to the price pane on close',async()=>{
 const d=await realDialog();try{
  d.click(d.render(),'Add Relative Strength Index');d.click(d.render(),'Add Simple Moving Average');
  const sma=d.port.list().find(row=>row.kind==='sma')!;expect(sma.paneId).toBe('price');expect(sma.inputs.source??'close').toBe('close');
  expect(INDICATOR_SOURCE_KINDS).toContain('sma');
 }finally{d.dispose();}
});

// The compact settings window (legend gear) keeps its footer reachable and shows no
// internal development notes. The footer is pinned by the shipped stylesheet rule; this checks the rule and the markup it targets.
it('compact RSI settings: no internal notes or plain calculation status, footer carries the pinned class',async()=>{
 const {readFileSync}=await import('node:fs');
 const d=await realDialog();try{
  d.click(d.render(),'Add Relative Strength Index');const rsi=d.port.list()[0];
  const tree=d.render({initialSelected:rsi.id,compact:true},'compact');
  const settings=findAll(tree,node=>typeof node.type==='function'&&node.type.name==='IndicatorSettings')[0];expect(settings).toBeTruthy();
  const inner=renderIn('compact-settings',()=>(settings.type as any)(settings.props));
  const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
  const seen:string[]=[];
  for(const tab of ['Inputs','Style','Visibility']){
   const button=findAll(inner,node=>node.type==='button'&&text(node)===tab)[0];if(button)button.props.onClick?.();
   const shown=text(renderIn('compact-settings',()=>(settings.type as any)(settings.props)));
   seen.push(shown);for(const note of ['unverified','LV starts with','Calculated from','pending reference comparison','these are local defaults'])expect(shown,tab+': '+note).not.toContain(note);
  }
  expect(seen.join(' ')).toContain('Extra smoothing uses the original indicator values.');// the user-facing half of the note stays
  expect(findAll(inner,node=>String(node.props?.className??'').includes('lv-settings-footer')).length).toBe(1);
  const css=readFileSync('src/ui/indicator-picker.css','utf8');
  expect(css).toMatch(/\.lv-indicator-compact \.lv-settings-footer\{position:sticky;bottom:-4px;[^}]*background:var\(--lv-bg-raised\)/);
  expect(css).toMatch(/\.lv-indicator-compact\{[^}]*max-height:min\(70vh,640px\);overflow:auto/);
 }finally{d.dispose();}
});
