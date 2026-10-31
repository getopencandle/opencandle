// Compare Same % scale retry and legend rows, Compare keyboard entry,
// symbol search exact-ticker ranking, recents that keep the symbol you left, and plain filter / empty wording.
// SYNTHETIC fixture bars only; no account, key or endpoint is used.
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {ComparisonDialog,COMPARISON_PLACEMENT_HELP} from '../../src/ui/ComparisonDialog';
import {ComparisonLegendRows,comparisonLegendRows} from '../../src/ui/ComparisonLegendRows';
import {applySameScalePercent,type ComparisonSettings} from '../../src/chart/compare-port';
import {comparisonLegendButtons} from '../../src/chart/legend-model';
import {SymbolSearchDialog} from '../../src/ui/SymbolSearchDialog';
import {RECENT_SYMBOLS_KEY,SOURCE_FILTER_LABELS,buildSymbolSearchCandidates,generatedLeads,noSymbolsMatch,readRecentSymbols,rememberDepartedSymbol,rememberRecentSymbol,type SymbolSwitchRequest} from '../../src/ui/symbol-search';
import {fixtureDataset} from '../../src/domain/fixtures';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{hooks.cursor++;hooks.effects.push(effect);}};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function findAll(node:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))for(const child of node)findAll(child,predicate,out);else if(node?.props){if(predicate(node))out.push(node);findAll(node.props.children,predicate,out);}return out;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):typeof node==='number'?String(node):node?.props?text(node.props.children):'';}
const keyEvent=(key:string)=>({key,preventDefault:vi.fn(),stopPropagation:vi.fn(),nativeEvent:{isComposing:false}});
function memory(seed?:string[]){const map=new Map<string,string>();if(seed)map.set(RECENT_SYMBOLS_KEY,JSON.stringify(seed));return{map,getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value);}};}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});

describe('#2 Same % scale switches the main scale to Percent',()=>{
 it('retries while the save holds the chart, then switches once',()=>{
  const mode={value:'regular'},queue:Array<()=>void>=[],report=vi.fn();let busy=3;
  const execute=vi.fn(()=>{if(busy-->0)return{ok:false,message:'This chart cannot save a scale change right now. Try again when it finishes updating.'};mode.value='percent';return{ok:true};});
  applySameScalePercent({state:()=>({mode:mode.value}),execute},{report,schedule:run=>{queue.push(run);}});
  while(queue.length)queue.shift()!();
  expect(execute).toHaveBeenCalledTimes(4);expect(mode.value).toBe('percent');expect(report).not.toHaveBeenCalled();
 });
 it('stops on a final refusal, on an already relative scale, after the attempts, and when cancelled',()=>{
  const report=vi.fn(),queue:Array<()=>void>=[];
  applySameScalePercent({state:()=>({mode:'regular'}),execute:()=>({ok:false,message:'This chart is closed.'})},{report,schedule:run=>{queue.push(run);}});
  expect(queue).toHaveLength(0);expect(report).toHaveBeenCalledWith('This chart is closed.');
  const execute=vi.fn(()=>({ok:true}));applySameScalePercent({state:()=>({mode:'indexed'}),execute});expect(execute).not.toHaveBeenCalled();
  const busy=vi.fn(()=>({ok:false,message:'busy right now'})),late=vi.fn();
  applySameScalePercent({state:()=>({mode:'regular'}),execute:busy},{report:late,attempts:3,schedule:run=>{queue.push(run);}});while(queue.length)queue.shift()!();
  expect(busy).toHaveBeenCalledTimes(3);expect(late).toHaveBeenCalledWith('busy right now');
  const again=vi.fn(()=>({ok:false,message:'busy right now'})),cancel=applySameScalePercent({state:()=>({mode:'regular'}),execute:again},{schedule:run=>{queue.push(run);}});cancel();while(queue.length)queue.shift()!();
  expect(again).toHaveBeenCalledTimes(1);
 });
 it('a compared symbol gets a legend row with Hide, Settings and Remove that edit through the host',()=>{
  expect(comparisonLegendButtons(false).map(row=>[row.id,row.tooltip])).toEqual([['hide','Hide'],['settings','Settings'],['remove','Remove']]);
  expect(comparisonLegendButtons(true)[0].tooltip).toBe('Show');
  const spy=fixtureDataset('SPY',5),list:Array<ComparisonSettings&{rendererId:string}>=[{id:'cmp-1',dataset:spy,mode:'percent',color:'#00aa88',width:2,visible:true,baseline:'first-visible-match',placement:'same-scale',rendererId:'r1'}];
  expect(comparisonLegendRows(list)).toEqual([{id:'cmp-1',symbol:'SPY',color:'#00aa88',visible:true,last:spy.bars.at(-1)!.close.toFixed(2),label:'SPY comparison'}]);
  const port={list:vi.fn(()=>list),subscribe:vi.fn(()=>()=>{}),update:vi.fn(),remove:vi.fn()},edits:Array<()=>void>=[],settings=vi.fn();
  const tree=ComparisonLegendRows({port,onEdit:run=>{edits.push(run);},onSettings:settings}) as any;
  const row=find(tree,node=>node.props?.['data-legend-kind']==='comparison');expect(text(row)).toContain('SPY');
  const button=(label:string)=>find(row,node=>node.type==='button'&&node.props['aria-label']===label);
  button('Hide SPY comparison').props.onClick();button('Remove SPY comparison').props.onClick();button('Settings SPY comparison').props.onClick();
  expect(port.update).not.toHaveBeenCalled();edits.forEach(run=>run());
  expect(port.update).toHaveBeenCalledWith('cmp-1',{visible:false});expect(port.remove).toHaveBeenCalledWith('cmp-1');expect(settings).toHaveBeenCalledTimes(1);
  hooks.cells=[];hooks.cursor=0;expect(ComparisonLegendRows({port:{...port,list:()=>[]},onEdit:()=>{}})).toBeNull();
 });
});

function compare(datasets=[fixtureDataset('GME',5),fixtureDataset('SPY',5)]){
 const native={comparisons:{list:vi.fn(():any[]=>[]),subscribe:vi.fn(()=>()=>{}),add:vi.fn(),update:vi.fn(()=>true),remove:vi.fn()},priceScale:{state:vi.fn(()=>({paneId:'price',kind:'price',mode:'percent',auto:true,invert:false})),execute:vi.fn(()=>({ok:true}))}};
 const props:any={chart:native,datasets,candidates:buildSymbolSearchCandidates(datasets,[]),onClose:vi.fn(),onChange:vi.fn(()=>true),resolution:'1D',recentStorage:memory()};
 const render=()=>{hooks.cursor=0;hooks.effects=[];return ComparisonDialog(props);};
 const input=(tree=render())=>find(tree,node=>node.props?.['aria-label']==='Search comparison symbols');
 const key=(value:string)=>{const event=keyEvent(value);input().props.onKeyDown(event);return event;};
 const added=()=>native.comparisons.add.mock.calls.map((call:any[])=>call[0].instrument.symbol);
 return{native,props,render,input,key,added};
}
describe('#3 #11 Compare dialog keyboard entry and short help',()=>{
 it('the search field takes focus, Enter adds the top match and arrows move the highlight',()=>{
  const ui=compare();expect(ui.input().props.autoFocus).toBe(true);
  ui.input().props.onChange({target:{value:'SPY'}});const enter=ui.key('Enter');expect(enter.preventDefault).toHaveBeenCalled();expect(enter.stopPropagation).toHaveBeenCalled();expect(ui.added()).toEqual(['SPY']);
  hooks.cells=[];const nav=compare(),tree=nav.render(),active=()=>findAll(nav.render(),node=>node.type==='button'&&node.props['data-active']==='true').map(node=>text(find(node,(child:any)=>child.type==='strong')));
  expect(active()).toEqual(['GME']);expect(nav.input(tree).props['aria-activedescendant']).toBeTruthy();
  nav.key('ArrowDown');expect(active()).toEqual(['SPY']);nav.key('ArrowDown');expect(active()).toEqual(['SPY']);nav.key('ArrowUp');expect(active()).toEqual(['GME']);nav.key('ArrowDown');nav.key('Enter');expect(nav.added()).toEqual(['SPY']);
 });
 it('Enter with no match adds nothing and says so in plain words',()=>{
  const ui=compare();ui.input().props.onChange({target:{value:'ZZZZ'}});ui.key('Enter');expect(ui.added()).toEqual([]);
  const tree=ui.render();expect(text(find(tree,node=>node.props?.role==='alert'))).toBe('No symbols match "ZZZZ".');expect(text(find(tree,node=>node.props?.className==='lv-compare-none'))).toBe('No symbols match "ZZZZ".');
 });
 it('placement and comparison help is one short line each',()=>{
  for(const help of Object.values(COMPARISON_PLACEMENT_HELP))expect(help.length).toBeLessThanOrEqual(45);
  const ui=compare();const tip=findAll(ui.render(),node=>node.props?.label==='About comparisons')[0];expect(text(tip.props.children).length).toBeLessThanOrEqual(60);
 });
});

function search(options:{recent?:ReturnType<typeof memory>;current?:string}={}){
 const universe=['GME','SPY','MSFT','TSLA'].map(symbol=>fixtureDataset(symbol,500)),selected:SymbolSwitchRequest[]=[];
 const candidates=buildSymbolSearchCandidates(universe,[]);
 const props:any={candidates,origin:'toolbar',currentDatasetId:options.current?candidates.find(row=>row.symbol===options.current)!.datasetId:null,recentStorage:options.recent??memory(),onSelect:(request:SymbolSwitchRequest)=>{selected.push(request);rememberRecentSymbol(props.recentStorage,request.symbol);return true;},onClose:vi.fn()};
 const render=()=>{hooks.cursor=0;return SymbolSearchDialog(props);};
 const input=(tree=render())=>find(tree,node=>node.type==='input'&&node.props['aria-label']==='Search symbols');
 const type=(value:string)=>{input().props.onChange({target:{value}});return render();};
 const rows=(tree=render())=>findAll(tree,node=>node.props?.role==='option');
 return{props,render,input,type,rows,selected,key:(value:string)=>input().props.onKeyDown(keyEvent(value))};
}
describe('#7 #8 #9 symbol search',()=>{
 it('the exact ticker MS ranks above MSFT, reads DEMO (not New demo symbol) and opens on Enter',()=>{
  const h=search(),tree=h.type('MS'),rows=h.rows(tree);
  expect(text(rows[0])).toMatch(/^MS[^F].*DEMO/);expect(text(rows[0])).not.toMatch(/New demo symbol/);expect(rows[0].props['aria-selected']).toBe(true);expect(text(rows[1])).toMatch(/^MSFT/);
  h.key('Enter');expect(h.selected[0]).toMatchObject({symbol:'MS',generated:true,synthetic:true});
  expect(generatedLeads('M',{symbol:'M'})).toBe(false);expect(generatedLeads('ms',{symbol:'MS'})).toBe(true);expect(generatedLeads('MS',null)).toBe(false);
 });
 it('an existing exact ticker still leads by itself and gets no DEMO generation row',()=>{
  const h=search(),rows=h.rows(h.type('MSFT'));expect(rows).toHaveLength(1);expect(rows[0].props.className).not.toContain('generated');
 });
 it('after GME then TSLA, recents read TSLA, GME',()=>{
  const recent=memory(),h=search({recent,current:'GME'});h.type('TSLA');h.key('Enter');
  expect(h.selected[0].symbol).toBe('TSLA');expect(readRecentSymbols(recent)).toEqual(['TSLA','GME']);
  expect(rememberDepartedSymbol(recent,'TSLA','TSLA')).toEqual(['TSLA','GME']);expect(rememberDepartedSymbol(recent,null,'SPY')).toEqual(['TSLA','GME']);
  expect(rememberDepartedSymbol(recent,'GME','SPY')).toEqual(['GME','TSLA']);
 });
 it('source filter and empty-result wording are plain',()=>{
  expect(Object.values(SOURCE_FILTER_LABELS)).toEqual(['All sources','Imported','Example','Live']);
  const h=search(),select=find(h.render(),node=>node.type==='select'&&node.props['aria-label']==='Source filter');expect(findAll(select,node=>node.type==='option').map(text)).toEqual(['All sources','Imported','Example','Live']);
  expect(noSymbolsMatch(' ms ')).toBe('No symbols match "ms".');expect(noSymbolsMatch('')).toBe('No symbols match these filters.');
  const funds=search();funds.type('MS');find(funds.render(),node=>node.type==='select'&&node.props['aria-label']==='Source filter').props.onChange({target:{value:'imported'}});
  expect(text(find(funds.render(),node=>node.props?.role==='status'))).toBe('No symbols match "MS".');
 });
});
