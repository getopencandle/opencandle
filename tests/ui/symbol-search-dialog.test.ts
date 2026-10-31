import {beforeEach,expect,it,vi} from 'vitest';
import {SymbolSearchDialog,type SymbolSearchDialogProps} from '../../src/ui/SymbolSearchDialog';
import {buildSymbolSearchCandidates,type SymbolSwitchRequest} from '../../src/ui/symbol-search';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:(effect:()=>unknown)=>{hooks.cursor++;hooks.effects.push(effect);}};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function findAll(node:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>findAll(child,predicate,out));else if(node?.props){if(predicate(node))out.push(node);findAll(node.props.children,predicate,out);}return out;}
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
const start=1704153600;
function imported(symbol:string,exchange:string,datasetId:string,closes:number[],revision='1'):BarDataset{
 return{instrument:{id:exchange+':'+symbol,symbol,name:symbol+' test listing',exchange,currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'America/New_York'},bars:closes.map((close,index)=>({time:start+index*86400,open:close,high:close,low:close,close,volume:1})),resolution:'1D',
  provenance:{providerId:datasetId.split(':')[0],providerName:datasetId.split(':')[0]+' CSV import',datasetId,fixture:false,coverage:closes.length+' imported rows',asOf:start,delaySeconds:null,adjustment:'unknown',session:'unknown',timezone:'America/New_York',state:'ready',license:'User-supplied local file',revision,notes:[]}};
}
const gmeA=imported('GME','NYSE','alpha:GME',[10,11,12]),gmeB=imported('GME','XNYS-ALT','beta:GME',[20,21]);
const universe=(imports:BarDataset[])=>[...['GME','SPY','AAPL','IWM'].map(symbol=>fixtureDataset(symbol,500)),...imports];
function harness(overrides:Partial<SymbolSearchDialogProps>={},imports=[gmeA,gmeB]){
 const selected:SymbolSwitchRequest[]=[];let accept=true,closes=0;
 let props:SymbolSearchDialogProps={candidates:buildSymbolSearchCandidates(universe(imports),imports),origin:'toolbar',onSelect(request){selected.push(request);return accept;},onClose(){closes++;},...overrides};
 const render=()=>{hooks.cursor=0;return SymbolSearchDialog(props);};
 const input=(root=render())=>find(root,node=>node.type==='input'&&node.props['aria-label']==='Search symbols');
 const key=(value:string,root=render())=>{const event={key:value,preventDefault(){},stopPropagation:vi.fn(),nativeEvent:{isComposing:false}};input(root).props.onKeyDown(event);return event;};
 const type=(value:string)=>{input().props.onChange({target:{value}});return render();};
 const rows=(root=render())=>findAll(root,node=>node.props?.role==='option');
 const dialog=(root=render())=>find(root,node=>node.props?.role==='dialog');
 return{render,input,key,type,rows,dialog,selected,get closes(){return closes;},reject(){accept=false;},allow(){accept=true;},set(next:Partial<SymbolSearchDialogProps>){props={...props,...next};},get props(){return props;}};
}
const status=(root:any)=>text(find(root,node=>node.props?.role==='status'));
const alert=(root:any)=>text(find(root,node=>node.props?.role==='alert'));

it('typing on the chart seeds the query; Enter opens the first supplied row with its exact source and closes once',()=>{
 const h=harness({origin:'typed',initialQuery:'G'}),root=h.render();
 expect(h.input(root).props.value).toBe('G');expect(h.rows(root).map(row=>text(row))[0]).toContain('NYSE');
 h.key('Enter');expect(h.selected).toHaveLength(1);expect(h.selected[0]).toMatchObject({symbol:'GME',sourceId:'alpha:GME',datasetId:'alpha:GME',exchange:'NYSE',synthetic:false,generated:false,origin:'typed'});expect(h.closes).toBe(1);
 h.key('Enter');expect(h.selected).toHaveLength(1);expect(h.closes).toBe(1);
});
it('same ticker from two sources: rows show exchange, provider and type; arrows choose the second source',()=>{
 const h=harness(),root=h.type('GME'),rows=h.rows(root);
 expect(rows.map(row=>text(row).slice(0,40))).toHaveLength(3);
 // Rows read symbol, name, exchange, type and source; provider and bar details moved to the row title.
 expect(text(rows[0])).toMatch(/GME.*NYSE.*Stocks.*Imported/);expect(rows[0].props.title).toContain('alpha CSV import · 1D · 3 bars · last bar 2024-01-04');
 expect(text(rows[1])).toMatch(/XNYS-ALT.*Imported/);expect(rows[1].props.title).toContain('beta CSV import · 1D · 2 bars');
 // The demo exchange reads "Demo".
 expect(text(rows[2])).toMatch(/Demo.*DEMO/);expect(text(rows[2])).not.toContain('SYNTHETIC');expect(rows[0].props['aria-selected']).toBe(true);
 h.key('ArrowDown');expect(h.rows()[1].props['aria-selected']).toBe(true);expect(h.input().props['aria-activedescendant']).toBe(h.rows()[1].props.id);
 h.key('ArrowUp');h.key('ArrowUp');expect(h.rows()[0].props['aria-selected']).toBe(true);
 h.key('ArrowDown');h.key('Enter');expect(h.selected[0]).toMatchObject({sourceId:'beta:GME',exchange:'XNYS-ALT'});
});
it('GME, SPY and a third symbol each switch through a click on their row',()=>{
 for(const [query,datasetId,sourceId] of [['NYSE:GME','alpha:GME','alpha:GME'],['SPY','lv-synthetic-v1:SPY',null],['AAPL','lv-synthetic-v1:AAPL',null]] as const){
  hooks.cells=[];const h=harness(),root=h.type(query),row=h.rows(root).find(item=>item.key===JSON.stringify([datasetId,datasetId==='alpha:GME'?'GME':query,'1D']));
  row.props.onClick();expect(h.selected).toEqual([expect.objectContaining({datasetId,sourceId})]);expect(h.closes).toBe(1);
 }
});
it('UI audit 1028 #13: the result count names every listed row, including the DEMO row',()=>{
 const h=harness(),root=h.type('GM'),rows=h.rows(root);
 // The exact typed ticker (a DEMO row here) leads the list.
 expect(rows[0].props.className).toContain('generated');expect(text(rows[0])).toMatch(/^GM.*DEMO/);expect(rows.length).toBeGreaterThan(1);expect(status(root)).toBe(rows.length+' results');
});
it('no results: explicit status, Enter explains and switches nothing',()=>{
 const h=harness(),root=h.type('NO SUCH');expect(h.rows(root)).toHaveLength(0);expect(status(root)).toBe('No symbols match "NO SUCH".');
 h.key('Enter');expect(alert(h.render())).toMatch(/No symbols match/);expect(h.selected).toHaveLength(0);expect(h.closes).toBe(0);
});
it('unresolved symbol: generation row is labelled DEMO, leads as the exact ticker and opens the labelled demo path',()=>{
 const h=harness(),root=h.type('ZZZZ'),rows=h.rows(root);
 expect(rows).toHaveLength(1);expect(text(rows[0])).toMatch(/DEMO/);expect(text(rows[0])).not.toMatch(/New demo symbol/);expect(rows[0].props.title).toContain('bars generated on open');expect(rows[0].props['aria-selected']).toBe(true);
 expect(status(root)).toBe('No symbols match "ZZZZ". Open it as a demo symbol.');
 h.key('Enter');expect(h.selected[0]).toMatchObject({symbol:'ZZZZ',sourceId:null,synthetic:true,generated:true,exchange:'SYNTHETIC'});
 hooks.cells=[];const imported=harness(),only=imported.render();imported.input(only).props.onChange({target:{value:'ZZZZ'}});find(imported.render(),node=>node.type==='select').props.onChange({target:{value:'imported'}});expect(imported.rows()).toHaveLength(0);
});
it('cancel: Escape (stopping propagation), X and outside press close without switching; inside press does not',()=>{
 let h=harness(),root=h.render();const shade=root;shade.props.onMouseDown({target:{},currentTarget:shade});expect(h.closes).toBe(0);
 shade.props.onMouseDown({target:shade,currentTarget:shade});expect(h.closes).toBe(1);shade.props.onMouseDown({target:shade,currentTarget:shade});expect(h.closes).toBe(1);
 hooks.cells=[];h=harness();const event={key:'Escape',preventDefault(){},stopPropagation:vi.fn(),nativeEvent:{isComposing:false}};h.dialog().props.onKeyDown(event);expect(event.stopPropagation).toHaveBeenCalled();expect(h.closes).toBe(1);
 hooks.cells=[];h=harness();find(h.render(),node=>node.type==='button'&&node.props['aria-label']==='Close Symbol search').props.onClick();expect(h.closes).toBe(1);expect(h.selected).toHaveLength(0);
 hooks.cells=[];h=harness();h.dialog().props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){},nativeEvent:{isComposing:true}});expect(h.closes).toBe(0);
});
it('stale result selection: a row rendered for an earlier query cannot switch the chart',()=>{
 const h=harness(),old=h.rows(h.type('GME'))[0];h.type('SPY');old.props.onClick();
 expect(h.selected).toHaveLength(0);expect(alert(h.render())).toMatch(/earlier search/);expect(h.closes).toBe(0);
 h.rows()[0].props.onClick();expect(h.selected[0].symbol).toBe('SPY');
});
it('stale source: a revised or removed import rejects the retained row',()=>{
 const h=harness(),row=h.rows(h.type('NYSE:GME'))[0],revised=imported('GME','NYSE','alpha:GME',[10,11,12],'2');
 h.set({candidates:buildSymbolSearchCandidates(universe([revised,gmeB]),[revised,gmeB])});h.render();row.props.onClick();expect(alert(h.render())).toMatch(/out of date/);expect(h.selected).toHaveLength(0);
 h.set({candidates:buildSymbolSearchCandidates(universe([gmeB]),[gmeB])});h.render();row.props.onClick();expect(h.selected).toHaveLength(0);expect(h.rows()).toHaveLength(0);
});
it('a rejected chart switch keeps the dialog and query; retry succeeds once',()=>{
 const h=harness();h.type('SPY');h.reject();h.key('Enter');const root=h.render();
 expect(alert(root)).toMatch(/chart did not change/);expect(h.input(root).props.value).toBe('SPY');expect(h.closes).toBe(0);
 h.allow();h.key('Enter');expect(h.selected).toHaveLength(2);expect(h.closes).toBe(1);
});
it('retired owner cannot switch; unopenable rows explain why',()=>{
 let h=harness({assertOwner(){throw Error('This chart was replaced.');}});h.type('SPY');h.key('Enter');expect(h.selected).toHaveLength(0);expect(alert(h.render())).toBe('This chart was replaced.');
 hooks.cells=[];const twin={...gmeA,bars:gmeA.bars.slice(0,1)};h=harness({},[gmeA,twin]);const root=h.type('NYSE:GME');expect(text(h.rows(root)[0])).toMatch(/Unavailable: .*share this dataset identity/);h.key('Enter');expect(h.selected).toHaveLength(0);expect(alert(h.render())).toMatch(/share this dataset identity/);
});
it('type tabs and source filter narrow results; linked-chart notice and current marker render',()=>{
 const h=harness({linkedCharts:2,currentDatasetId:'beta:GME'});let root=h.render();
 const group=find(root,node=>node.props?.role==='group'),tabs=findAll(group,node=>node.type==='button');expect(tabs.map(text)).toEqual(['All','Stocks','Funds']);expect(tabs.map(node=>node.props['aria-pressed'])).toEqual([true,false,false]);
 expect(text(root)).toContain('Symbol sync is on: this choice changes 2 linked charts');
 find(root,node=>node.type==='button'&&node.props['aria-pressed']!==undefined&&text(node)==='Funds').props.onClick();root=h.render();expect(h.rows(root).map(row=>text(row).slice(0,3))).toEqual(['IWM','SPY']);
 hooks.cells=[];const g=harness({currentDatasetId:'beta:GME'});root=g.type('GME');expect(text(g.rows(root)[1])).toContain('Current chart');
 find(root,node=>node.type==='select').props.onChange({target:{value:'synthetic'}});expect(g.rows().every(row=>/DEMO/.test(text(row)))).toBe(true);
});
it('a highlighted source that disappears is never replaced by another source on Enter',()=>{
 const h=harness();h.type('GME');h.key('ArrowDown');expect(h.rows()[1].props['aria-selected']).toBe(true);
 h.set({candidates:buildSymbolSearchCandidates(universe([gmeA]),[gmeA])});const root=h.render();
 expect(h.rows(root).some(row=>row.props['aria-selected'])).toBe(false);expect(h.input(root).props['aria-activedescendant']).toBeUndefined();expect(status(root)).toMatch(/^The highlighted result changed\./);
 h.key('Enter');expect(h.selected).toHaveLength(0);expect(alert(h.render())).toMatch(/no longer available/);
 h.key('ArrowDown');h.key('Enter');expect(h.selected[0].datasetId).toBe('alpha:GME');
});
it('option ids follow the source, not the position; Home/End jump when the query is empty',()=>{
 const h=harness();let root=h.type('GME');const first=h.rows(root)[0].props.id;root=h.type('NYSE:GME');expect(h.rows(root)[0].props.id).toBe(first);
 root=h.type('XNYS-ALT:GME');expect(h.rows(root)[0].props.id).not.toBe(first);
 h.type('');h.key('End');const rows=h.rows();expect(rows.at(-1).props['aria-selected']).toBe(true);h.key('Home');expect(h.rows()[0].props['aria-selected']).toBe(true);
});
it('synthetic derived rows say SYNTHETIC DEMO and a missing exchange is not invented',()=>{
 const derived={...fixtureDataset('GME',3),resolution:'1W',derivation:{from:'lv-synthetic-v1:GME'}} as any;derived.provenance={...derived.provenance,datasetId:'derived:GME:1W'};
 const blank=imported('ABC','','gamma:ABC',[5]),h=harness({},[derived,blank]),root=h.type('GME'),row=h.rows(root).find(item=>text(item).includes('derived'));
 expect(text(row)).toContain('DEMO · derived');
 const abc=h.rows(h.type('ABC'))[0];expect(text(abc)).toContain('Exchange not supplied');
});
it('empty universe explains how to make search useful',()=>{const h=harness({candidates:[]});expect(status(h.render())).toBe('No instruments are available. Import data to make it searchable.');});
it('StrictMode cleanup/setup keeps the dialog live; final cleanup retires its actions',()=>{
 const h=harness();h.render();const setup=hooks.effects[0],cleanup=setup() as ()=>void;cleanup();setup();h.type('SPY');h.key('Enter');expect(h.selected).toHaveLength(1);
 hooks.cells=[];hooks.effects=[];const g=harness(),root=g.type('SPY'),again=hooks.effects[0],dispose=again() as ()=>void;dispose();g.key('Enter',root);expect(g.selected).toHaveLength(0);
});
it('second review F4: an automatically highlighted source that disappears is not replaced on Enter; the auto row is sticky',()=>{
 const h=harness();let root=h.type('GME');expect(h.rows(root)[0].props['aria-selected']).toBe(true);
 h.set({candidates:buildSymbolSearchCandidates(universe([gmeB]),[gmeB])});root=h.render();
 expect(h.rows(root).some(row=>row.props['aria-selected'])).toBe(false);expect(status(root)).toMatch(/^The highlighted result changed\./);
 h.key('Enter');expect(h.selected).toHaveLength(0);expect(alert(h.render())).toMatch(/no longer available/);
 hooks.cells=[];const g=harness({},[gmeB]);root=g.type('GME');expect(text(g.rows(root)[0])).toContain('XNYS-ALT');
 g.set({candidates:buildSymbolSearchCandidates(universe([gmeA,gmeB]),[gmeA,gmeB])});root=g.render();
 expect(text(g.rows(root)[0])).toContain('NYSE');expect(g.rows(root).find(row=>row.props['aria-selected'])&&text(g.rows(root).find(row=>row.props['aria-selected']))).toContain('XNYS-ALT');
 g.key('Enter');expect(g.selected[0].datasetId).toBe('beta:GME');
 hooks.cells=[];const fresh=harness({},[gmeB]);fresh.type('GME');fresh.set({candidates:buildSymbolSearchCandidates(universe([gmeA,gmeB]),[gmeA,gmeB])});fresh.type('GME ');fresh.type('GME');fresh.key('Enter');expect(fresh.selected[0].datasetId).toBe('alpha:GME');
});
