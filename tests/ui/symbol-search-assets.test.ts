import {beforeEach,describe,expect,it,vi} from 'vitest';
import {SymbolSearchDialog,type SymbolSearchDialogProps} from '../../src/ui/SymbolSearchDialog';
import {alpacaAssetCandidates,buildSymbolSearchCandidates,liveTypedCandidates,mergeAssetCandidates,searchSymbols,type SymbolSearchCandidate,type SymbolSwitchRequest} from '../../src/ui/symbol-search';
import {ALPACA_IEX_PROVIDER_ID,ALPACA_SYMBOL,alpacaDatasetId,alpacaSearchDatasets,type AlpacaAsset} from '../../src/domain/alpaca-live';
import {fixtureDataset} from '../../src/domain/fixtures';

// Alpaca asset rows in symbol search. Synthetic asset rows; the lookup is a mocked promise.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:(effect:()=>unknown)=>{hooks.cursor++;hooks.effects.push(effect);}};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function findAll(node:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>findAll(child,predicate,out));else if(node?.props){if(predicate(node))out.push(node);findAll(node.props.children,predicate,out);}return out;}
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
const asset=(symbol:string,extra:Partial<AlpacaAsset>={}):AlpacaAsset=>({symbol,name:symbol+' synthetic listing',exchange:'NYSE',tradable:true,status:'active',chartable:ALPACA_SYMBOL.test(symbol),warrant:false,...extra});
const GME=asset('GME',{name:'GameStop Corp. Class A'}),WARRANT=asset('GME.WS',{name:'GameStop Corp. Warrants',tradable:false,warrant:true});

describe('Alpaca asset rows',()=>{
 it('carry the real Alpaca symbol and name, open as live Alpaca charts, and explain problems in plain words',()=>{
  const rows=alpacaAssetCandidates([GME,WARRANT,asset('AB/C',{chartable:false})],'1m');
  expect(rows.map(row=>row.symbol)).toEqual(['GME','GME.WS','AB/C']);
  expect(rows[1]).toMatchObject({name:'GameStop Corp. Warrants',exchange:'NYSE',providerId:ALPACA_IEX_PROVIDER_ID,datasetId:alpacaDatasetId('GME.WS','1m'),sourceKind:'live',openable:true});
  expect(rows[1].notice).toMatch(/not tradable/);expect(rows[0].notice).toBeNull();
  expect(rows[2]).toMatchObject({openable:false});expect(rows[2].unavailableReason).toMatch(/cannot chart/);
  expect(alpacaAssetCandidates([GME],'1m')).toEqual(alpacaAssetCandidates([GME],'1m'));
 });
 it('replace the plain typed or saved row for the same feed instead of duplicating it',()=>{
  const base=buildSymbolSearchCandidates([fixtureDataset('GME',50),...alpacaSearchDatasets(true,['GME'],'1m')],[]);
  const merged=mergeAssetCandidates(base,alpacaAssetCandidates([GME,WARRANT],'1m'));
  expect(merged.filter(row=>row.providerId===ALPACA_IEX_PROVIDER_ID).map(row=>row.symbol)).toEqual(['GME','GME.WS']);
  expect(merged.find(row=>row.symbol==='GME'&&row.sourceKind==='live')!.name).toBe('GameStop Corp. Class A');
  const typed=liveTypedCandidates('GME',base,true,'1m');expect(mergeAssetCandidates([...base,...typed],alpacaAssetCandidates([GME],'1m')).filter(row=>row.sourceKind==='live')).toHaveLength(1);
 });
 it('typing GME lists GME and then its warrant',()=>{
  const merged=mergeAssetCandidates(buildSymbolSearchCandidates([fixtureDataset('SPY',50)],[]),alpacaAssetCandidates([asset('GMED'),WARRANT,GME],'1m'));
  expect(searchSymbols(merged,'GME').rows.map(row=>row.symbol)).toEqual(['GME','GME.WS','GMED']);
  expect(searchSymbols(merged,'GameStop').rows.map(row=>row.symbol)).toEqual(['GME','GME.WS']);
 });
});

describe('the dialog asks Alpaca as the owner types',()=>{
 function harness(searchAssets:SymbolSearchDialogProps['searchAssets']){
  const selected:SymbolSwitchRequest[]=[];
  const props:SymbolSearchDialogProps={candidates:buildSymbolSearchCandidates([fixtureDataset('SPY',50)],[]),origin:'toolbar',searchAssets,onSelect(request){selected.push(request);return true;},onClose(){}};
  const render=()=>{hooks.cursor=0;hooks.effects=[];return SymbolSearchDialog(props);};
  const input=(root:any)=>find(root,node=>node.type==='input'&&node.props['aria-label']==='Search symbols');
  const type=(value:string)=>{input(render()).props.onChange({target:{value}});const root=render();for(const effect of hooks.effects.slice(1))effect();return root;};
  const rows=(root=render())=>findAll(root,node=>node.props?.role==='option');
  const status=(root=render())=>text(find(root,node=>node.props?.role==='status'));
  return{render,type,rows,status,selected,input};
 }
 it('shows GME and GME.WS with their real symbols and the not-tradable notice; picking the warrant opens it live',async()=>{
  const search=vi.fn(async(query:string)=>alpacaAssetCandidates(query==='GME'?[GME,WARRANT]:[],'1m'));
  const h=harness(search);h.type('GME');
  expect(h.status()).toMatch(/Searching Alpaca/);
  await flush();
  expect(search).toHaveBeenCalledWith('GME');
  const rows=h.rows();expect(rows.map(row=>find(row,(n:any)=>n.type==='strong')).map(text)).toEqual(['GME','GME.WS']);
  expect(text(rows[1])).toContain('GameStop Corp. Warrants');expect(text(rows[1])).toMatch(/not tradable/);
  rows[1].props.onClick();
  expect(h.selected).toEqual([expect.objectContaining({symbol:'GME.WS',providerId:ALPACA_IEX_PROVIDER_ID,datasetId:alpacaDatasetId('GME.WS','1m')})]);
 });
 it('ignores answers for an older query and reports lookup failures plainly',async()=>{
  let release:(rows:SymbolSearchCandidate[])=>void=()=>{};
  const search=vi.fn((query:string)=>query==='G'?new Promise<SymbolSearchCandidate[]>(resolve=>{release=resolve;}):Promise.reject(new Error('Alpaca rejected the key.')));
  const h=harness(search);h.type('G');h.type('GX');await flush();
  release(alpacaAssetCandidates([GME],'1m'));await flush();
  expect(h.rows().map(text).join()).not.toContain('GameStop');
  expect(h.status()).toContain('Alpaca search failed: Alpaca rejected the key.');
 });
 it('does nothing without a lookup or for an empty query',()=>{
  const h=harness(undefined);h.type('GME');expect(h.status()).not.toMatch(/Alpaca/);
  const search=vi.fn(async()=>[]);const g=harness(search);g.type('  ');expect(search).not.toHaveBeenCalled();
 });
});
