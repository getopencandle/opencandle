import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ScreenerDialog,type ScreenerDialogProps} from '../../src/ui/ScreenerDialog';
import {createScreenerSettings,type ScreenerSettings} from '../../src/domain/screener-state';
import type {BarDataset} from '../../src/domain/types';
import {addWatchList,createWatchBook,type WatchBook,type WatchReference} from '../../src/watchlists/model';
import {addWatchMembers,setWatchFlags,watchListMembers} from '../../src/watchlists/membership';

// Independent handler-model checks using the real component and domain resolver.
// Hook scheduling is controlled. No DOM, focus, native dialog, App authority or
// packaged-window behavior is established. Every price below is an invented test
// literal; fixture:false exercises an isolated branch and is never market data.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,cleanups:new Set<()=>void>()}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 return {...actual,
  useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return [hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
  useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
  useMemo:(fn:()=>any)=>fn(),
  useEffect:(effect:()=>unknown,deps:readonly unknown[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(!old||old.deps.length!==deps.length||deps.some((value,index)=>!Object.is(value,old.deps[index]))){if(old?.cleanup){hooks.cleanups.delete(old.cleanup);old.cleanup();}const cleanup=effect();hooks.cells[i]={deps,cleanup};if(typeof cleanup==='function')hooks.cleanups.add(cleanup as ()=>void);}}
 };
});
function dispose(){const pending=[...hooks.cleanups];hooks.cleanups.clear();pending.forEach(cleanup=>cleanup());}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups.clear();});
afterEach(()=>{dispose();vi.restoreAllMocks();});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(node:any,predicate:(node:any)=>boolean):any{
 if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}
 else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}
 return null;
}
const FLAG_OPTION='Flagged markets: exchange and ticker across synthetic and supplied sources';
const CUSTOM_OPTION='Exchange and ticker, any loaded source of the same synthetic status';
const NOTE='Flags apply by exchange and ticker across synthetic and supplied sources. Each source keeps its own label. Competing sources for an instrument require an exact choice; unavailable saved choices are not replaced.';
const I_KEY='["NYSE:GME","NYSE","imp","imp:GME","1D","USD","raw","regular","UTC","stock",false,"2 review rows"]';
const MISSING_KEY='["NYSE:GME","NYSE","missing","missing:GME","1D","USD","raw","regular","UTC","stock",false,"2 review rows"]';
const S_REF:WatchReference={exchange:'NYSE',symbol:'GME',datasetId:'demo:GME',dailyDatasetId:null,synthetic:true};
const I_REF:WatchReference={exchange:'NYSE',symbol:'GME',datasetId:'imp:GME',dailyDatasetId:null,synthetic:false};
function dataset(fixture:boolean):BarDataset{
 const closes=fixture?[10,11]:[20,24],provider=fixture?'demo':'imp';
 return {instrument:{id:'NYSE:GME',exchange:'NYSE',symbol:'GME',name:'Invented handler test only',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'UTC'},resolution:'1D',
  bars:closes.map((close,index)=>({time:1700000000+index*86400,open:close,high:close+1,low:close-0.5,close,volume:1000})),
  provenance:{providerId:provider,providerName:'Invented isolated test literals, not market prices',datasetId:provider+':GME',fixture,coverage:'2 review rows',asOf:1700086400,delaySeconds:null,adjustment:'raw',session:'regular',timezone:'UTC',state:'ready',license:'Original local test literals',revision:'r1',notes:['Not real GME prices. Never ship as a supplied-market demo.']}};
}
function configuration(listId='flag:red',match:'source'|'market'='market',pin?:string):ScreenerSettings{
 const settings=createScreenerSettings();settings.columns=[{id:'symbol',metric:'symbol'},{id:'last',metric:'last'},{id:'flag',metric:'flag'}];settings.filters=[];settings.sort={columnId:'symbol',direction:'asc'};
 settings.universe={...settings.universe,watchlist:{listId,name:listId==='flag:red'?'Red flagged':'Custom',match},sourceChoices:pin?{'NYSE:GME':pin}:{}};
 return settings;
}
function setup(options:{listId?:string;match?:'source'|'market';pin?:string;both?:boolean}={}){
 let book=addWatchList(addWatchList(createWatchBook([]),'custom','Custom'),'target','Target');
 book=addWatchMembers(book,'custom',[S_REF],()=> 'source-row').book;book=setWatchFlags(book,[S_REF],'red');
 const synthetic=dataset(true),supplied=dataset(false);
 const props:ScreenerDialogProps={datasets:options.both?[synthetic,supplied]:[supplied],settings:configuration(options.listId,options.match,options.pin),watchBook:book,
  onClose:vi.fn(),onSelect:vi.fn(()=>({ok:false,error:'Controlled host refusal'})),
  onChange:vi.fn((next:ScreenerSettings)=>{props.settings=next;return true;}),
  onWatchBook:vi.fn((next:WatchBook,expected:WatchBook)=>{if(props.watchBook!==expected)return false;props.watchBook=next;return true;})};
 const render=()=>{hooks.cursor=0;return ScreenerDialog(props);};
 const required=(predicate:(node:any)=>boolean,name:string)=>{const node=find(render(),predicate);if(!node)throw Error('Missing handler-model element: '+name);return node;};
 const button=(name:string)=>required(node=>node.type==='button'&&(text(node)===name||node.props['aria-label']===name),name).props;
 const control=(name:string)=>required(node=>node.props['aria-label']===name,name).props;
 const row=()=>required(node=>node.type==='tr'&&node.key==='NYSE:GME','NYSE:GME row');
 const rowOrNull=()=>find(render(),node=>node.type==='tr'&&node.key==='NYSE:GME');
 const submit=()=>required(node=>node.type==='form','draft form').props.onSubmit({preventDefault:vi.fn()});
 // Provenance moved out of the row text into the symbol-cell tooltip and the selected-row details panel.
 const provenance=()=>String(find(row(),node=>node.type==='td'&&node.props.className==='screener-source').props.title);
 const details=()=>text(find(render(),node=>node.type==='details'&&node.props.className==='screener-details'));
 const selectRow=()=>row().props.onClick({ctrlKey:false,metaKey:false,shiftKey:false,target:null});
 const alert=()=>text(find(render(),node=>node.props.role==='alert'));
 const status=()=>text(find(render(),node=>node.type==='output'));
 return {props,synthetic,supplied,render,button,control,row,rowOrNull,provenance,details,submit,selectRow,alert,status};
}

describe('flagged screener scope: independent actual-handler model, not native UI',()=>{
 it.each([
  ['flag:red','source',FLAG_OPTION,0],
  ['flag:red','market',FLAG_OPTION,1],
  ['custom','source',CUSTOM_OPTION,0],
  ['custom','market',CUSTOM_OPTION,0]
 ] as const)('labels the market destination and notes correctly for %s selected %s',(listId,match,option,appliedNotes)=>{
  const ui=setup({listId,match}),before=JSON.stringify(ui.props.settings);
  expect(text(ui.render()).split(NOTE).length-1).toBe(appliedNotes);
  ui.button('Source universe').onClick();const selector=ui.control('Screener watchlist match');
  expect(selector.value).toBe(match);expect(text(find(selector.children,node=>node.type==='option'&&node.props.value==='market'))).toBe(option);
  expect(text(find(selector.children,node=>node.type==='option'&&node.props.value==='source'))).toBe('Exact bound source: exchange, ticker and dataset');
  expect(text(ui.render()).split(NOTE).length-1).toBe(appliedNotes*2);
  expect(JSON.stringify(ui.props.settings)).toBe(before);expect(ui.props.onChange).not.toHaveBeenCalled();
 });

 it('restores applied market disclosure and the selected supplied row without relabeling the saved synthetic flag',()=>{
  const ui=setup(),before=JSON.stringify(ui.props.watchBook),rendered=text(ui.render()),row=ui.provenance();
  expect(rendered).toContain('by market-wide flags (exchange and ticker)');expect(rendered.split(NOTE).length-1).toBe(1);
  for(const value of ['NYSE','Supplied','ready','Invented isolated test literals','2 review rows','1D','USD','raw','regular','UTC','Revision r1','Row time'])expect(row).toContain(value);
  expect(row).not.toContain('SYNTHETIC');expect(row).not.toContain('demo:GME');expect(text(ui.row())).not.toContain('DEMO');
  ui.selectRow();for(const value of ['Supplied','Invented isolated test literals','2 review rows','Revision r1','Row time'])expect(ui.details()).toContain(value);expect(ui.details()).not.toContain('imp:GME');/* No dataset id shown */
  const last=find(ui.row(),node=>node.type==='td'&&node.key==='last');expect(text(last)).toBe('24.00');
  expect(JSON.stringify(ui.props.watchBook)).toBe(before);expect(ui.props.watchBook!.flags[0].reference).toEqual(S_REF);expect(ui.props.onWatchBook).not.toHaveBeenCalled();
 });

 it('choosing a flagged universe sets market mode, explains it and retains the explicit pin',()=>{
  const ui=setup({listId:'custom',match:'source',pin:I_KEY,both:true});
  ui.control('Screener watchlist universe').onChange({target:{value:'flag:red'}});
  expect(ui.props.settings.universe.watchlist).toEqual({listId:'flag:red',name:'Red flagged',match:'market'});
  expect(ui.props.settings.universe.sourceChoices).toEqual({'NYSE:GME':I_KEY});
  expect(ui.status()).toBe('Flagged-list universe selected. Flags match exchange and ticker across synthetic and supplied sources. Source labels and saved choices remain unchanged.');
  expect(ui.provenance()).toContain('Invented isolated test literals');expect(ui.props.onWatchBook).not.toHaveBeenCalled();
 });

 it('Cancel preserves pins and saved state; Apply, Undo and Redo change only the intended matching mode',()=>{
  const ui=setup({match:'source',pin:I_KEY,both:true}),before=structuredClone(ui.props.settings);
  ui.button('Source universe').onClick();ui.control('Screener watchlist match').onChange({target:{value:'market'}});
  ui.button('Clear saved source choices in draft').onClick();ui.button('Cancel draft').onClick();
  expect(ui.props.settings).toEqual(before);expect(ui.props.onChange).not.toHaveBeenCalled();
  ui.button('Source universe').onClick();ui.control('Screener watchlist match').onChange({target:{value:'market'}});
  expect(ui.control('Exact source for NYSE:GME').value).toBe(I_KEY);ui.submit();
  const expected=structuredClone(before);expected.universe.watchlist!.match='market';
  expect(ui.props.settings).toEqual(expected);expect(ui.provenance()).toContain('Invented isolated test literals');
  ui.button('Undo screen edit').onClick();expect(ui.props.settings).toEqual(before);
  ui.button('Redo').onClick();expect(ui.props.settings).toEqual(expected);
  expect(ui.props.settings.screens).toEqual(before.screens);expect(ui.props.onWatchBook).not.toHaveBeenCalled();
 });

 it('ambiguous mixed-status candidates need an explicit full source choice and keep distinct labels',()=>{
  const ui=setup({both:true});expect(ui.rowOrNull()).toBeNull();expect(text(ui.render())).toContain('1 without;');
  ui.button('Source universe').onClick();const selector=ui.control('Exact source for NYSE:GME');
  expect(selector.value).toBe('');expect(text(selector.children)).toContain('Synthetic | demo | demo:GME');expect(text(selector.children)).toContain('Supplied | imp | imp:GME');
  selector.onChange({target:{value:I_KEY}});expect(ui.rowOrNull()).toBeNull();ui.submit();
  expect(ui.props.settings.universe.sourceChoices).toEqual({'NYSE:GME':I_KEY});expect(ui.provenance()).toContain('Invented isolated test literals');
  expect(text(find(ui.row(),node=>node.type==='td'&&node.key==='last'))).toBe('24.00');expect(ui.props.watchBook!.flags[0].reference).toEqual(S_REF);
 });

 it('Save and cancelled source clearing retain a missing exact pin instead of choosing an opposite-status candidate',()=>{
  const ui=setup({pin:MISSING_KEY});expect(ui.rowOrNull()).toBeNull();expect(text(ui.render())).toContain('1 without;');
  ui.button('Source universe').onClick();const selector=ui.control('Exact source for NYSE:GME');
  expect(selector.value).toBe(MISSING_KEY);expect(text(selector.children)).toContain('Saved exact source is unavailable');
  ui.button('Clear saved source choices in draft').onClick();ui.button('Cancel draft').onClick();
  expect(ui.props.settings.universe.sourceChoices).toEqual({'NYSE:GME':MISSING_KEY});expect(ui.rowOrNull()).toBeNull();
  ui.button('Save screen').onClick();expect(ui.props.settings.universe.sourceChoices).toEqual({'NYSE:GME':MISSING_KEY});
  expect(ui.props.settings.screens.find(screen=>screen.id===ui.props.settings.activeScreenId)!.configuration.universe.sourceChoices).toEqual({'NYSE:GME':MISSING_KEY});
  expect(ui.rowOrNull()).toBeNull();expect(ui.props.onWatchBook).not.toHaveBeenCalled();
 });

 it('Open and double-click deliver the exact current selected source and keep the dialog open on host refusal',()=>{
  const ui=setup();ui.button('Open GME').onClick();
  expect(ui.props.onSelect).toHaveBeenNthCalledWith(1,ui.supplied);expect(ui.props.onClose).not.toHaveBeenCalled();expect(ui.alert()).toBe('Controlled host refusal');
  vi.mocked(ui.props.onSelect).mockReturnValue({ok:true});
  ui.row().props.onDoubleClick({target:{closest:()=>null}});
  expect(ui.props.onSelect).toHaveBeenNthCalledWith(2,ui.supplied);expect(ui.props.onClose).not.toHaveBeenCalled();/* the screener stays open after a successful open (chooseDataset no longer closes it) */
  // The host here is a stub. Actual stale-source refusal by App remains a separate integration gate.
 });

 it('Add and Flag use the selected supplied reference, while evaluation alone keeps the old synthetic reference',()=>{
  const ui=setup();expect(ui.props.watchBook!.flags[0].reference).toEqual(S_REF);
  ui.selectRow();ui.button('Add selected to watchlist').onClick();ui.button('Add selected to Target').onClick();
  expect(watchListMembers(ui.props.watchBook!,'target')).toEqual([I_REF]);expect(ui.props.watchBook!.flags[0].reference).toEqual(S_REF);
  ui.button('Flag selected').onClick();ui.button('Flag Green').onClick();
  expect(ui.props.watchBook!.flags).toEqual([{reference:I_REF,color:'green'}]);expect(ui.props.onWatchBook).toHaveBeenCalledTimes(2);
 });

 it('a changed selected source key rejects the retained Add action without publishing a different source',()=>{
  const ui=setup();ui.selectRow();ui.button('Add selected to watchlist').onClick();const apply=ui.button('Add selected to Target').onClick,book=ui.props.watchBook;
  const changed=structuredClone(ui.supplied);changed.provenance.coverage='changed review coverage';ui.props.datasets=[changed];ui.render();apply();
  expect(ui.props.onWatchBook).not.toHaveBeenCalled();expect(ui.props.watchBook).toBe(book);expect(ui.alert()).toContain('no longer in the current results');
 });

 it('an unrelated immutable book update still permits current exact-key and target-revision validation',()=>{
  const ui=setup();ui.selectRow();ui.button('Add selected to watchlist').onClick();const apply=ui.button('Add selected to Target').onClick;
  const changed=addWatchList(ui.props.watchBook!,'unrelated','Unrelated');ui.props.watchBook=changed;ui.render();apply();
  expect(ui.props.onWatchBook).toHaveBeenCalledOnce();expect(vi.mocked(ui.props.onWatchBook!).mock.calls[0][1]).toBe(changed);
  expect(watchListMembers(ui.props.watchBook!,'target')).toEqual([I_REF]);expect(ui.props.watchBook!.lists.some(list=>list.id==='unrelated')).toBe(true);
 });

 it('Cancel retires an Add callback before a new Flag action even when its cross-status source still exists',()=>{
  const ui=setup();ui.selectRow();ui.button('Add selected to watchlist').onClick();const oldApply=ui.button('Add selected to Target').onClick;
  ui.button('Cancel').onClick();ui.button('Flag selected').onClick();oldApply();
  expect(ui.props.onWatchBook).not.toHaveBeenCalled();expect(ui.button('Flag Green')).toBeTruthy();
  ui.button('Flag Green').onClick();expect(ui.props.onWatchBook).toHaveBeenCalledOnce();expect(watchListMembers(ui.props.watchBook!,'target')).toEqual([]);
 });
});
