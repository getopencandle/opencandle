import {beforeEach,expect,it,vi} from 'vitest';
import {SymbolDetails,type SymbolDetailsProps} from '../../src/ui/SymbolDetails';
import {Modal} from '../../src/ui/Modal';
import {checkFundamentalsSummary,formatFundamentalsPeriod,type SymbolFundamentalsSummary} from '../../src/ui/symbol-details-fundamentals';
import {defaultDetailPreferences,type DetailSnapshot} from '../../src/watchlists/details';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:(effect:()=>unknown)=>{hooks.cursor++;hooks.effects.push(effect);}};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
const market={exchange:'NYSE',symbol:'GME',synthetic:false};
// Independent literal values for the contract only. Not real filings.
function summary(patch:Partial<SymbolFundamentalsSummary>={}):SymbolFundamentalsSummary{return{schemaVersion:1,market,availability:'available',reason:null,
 source:{kind:'local-import',label:'Test facts file',retrievedAt:'2026-10-01T00:00:00Z',sourceUrl:null,sha256:null},entity:{name:'Test Entity',cik:'0000000001'},asOf:'2026-09-30',
 fields:[{id:'revenue',label:'Revenue',value:1234.5,unit:'USD',period:{start:'2025-02-02',end:'2025-05-03',fiscalYear:2025,fiscalPeriod:'Q1'},filed:'2025-06-10',form:'10-Q',accession:'0000000001-25-000001',missingReason:null},
  {id:'netIncome',label:'Net income',value:0,unit:'USD',period:null,filed:null,form:null,accession:null,missingReason:null},
  {id:'shares',label:'Shares outstanding',value:null,unit:'shares',period:null,filed:null,form:null,accession:null,missingReason:'Not reported in the supplied facts'},
  {id:'margin',label:'Net margin',value:0,unit:null,period:null,filed:null,form:null,accession:null,missingReason:null,derived:{formula:'netIncome / revenue',inputs:['netIncome','revenue']}}],...patch};}
function harness(fundamentals?:SymbolDetailsProps['fundamentals'],snapshotPatch:Partial<DetailSnapshot>={}){
 const snapshot:DetailSnapshot={symbol:'GME',exchange:'NYSE',synthetic:false,description:'Imported listing',blocks:{summary:[{label:'Last supplied close',value:12}],daily:[],identity:[],source:[]},diagnostic:'Imported',disclaimer:'Independent watchlist snapshot',...snapshotPatch};
 const opened:any[]=[];let result:boolean|void=true;
 let props:SymbolDetailsProps={snapshot,identity:'source-a',ownerToken:{},preferences:defaultDetailPreferences(),notes:[],assertOwner(){},onBegin(){},onPreferences(){return true;},fundamentals,onOpenFundamentals(value){opened.push(value);return result;}};
 const render=()=>{hooks.cursor=0;return SymbolDetails(props);};
 const section=(root=render())=>find(root,node=>node.props?.['aria-label']==='Fundamentals summary');
 const button=(label:string,root=render())=>find(root,node=>node.type==='button'&&text(node)===label);
 return{render,section,button,opened,set(next:Partial<SymbolDetailsProps>){props={...props,...next};},reject(){result=false;}};
}
it('contract: accepts a valid summary, keeps zero distinct from missing, and formats periods',()=>{
 const check=checkFundamentalsSummary(summary(),market);expect(check.ok).toBe(true);
 if(check.ok){expect(check.summary.fields.map(row=>row.value)).toEqual([1234.5,0,null,0]);expect(check.summary.fields[3].derived).toEqual({formula:'netIncome / revenue',inputs:['netIncome','revenue']});}
 expect(formatFundamentalsPeriod({start:'2025-02-02',end:'2025-05-03',fiscalYear:2025,fiscalPeriod:'Q1'})).toBe('FY2025 Q1 · 2025-02-02 to 2025-05-03');expect(formatFundamentalsPeriod(null)).toBe('Period not supplied');
});
it('contract: rejects other markets, synthetic/real mixing, unexplained gaps, non-finite values and oversize lists',()=>{
 const reason=(value:unknown,m=market)=>{const check=checkFundamentalsSummary(value,m);return check.ok?'ok':check.reason;};
 expect(reason(summary({market:{...market,symbol:'SPY'}}))).toMatch(/different market identity/);
 expect(reason(summary({market:{...market,synthetic:true}}),{...market,synthetic:true})).toMatch(/SYNTHETIC DEMO symbol cannot display real/);
 expect(reason(summary({source:{kind:'synthetic',label:'Demo',retrievedAt:null,sourceUrl:null,sha256:null}}))).toMatch(/Synthetic fundamentals cannot be shown/);
 expect(reason(summary({availability:'unavailable',reason:'',fields:[]}))).toMatch(/must state why/);
 expect(reason(summary({fields:[{...summary().fields[2],missingReason:null}]}))).toMatch(/must state why it is missing/);
 expect(reason(summary({fields:[{...summary().fields[0],value:Number.NaN}]}))).toMatch(/non-finite/);
 expect(reason(summary({fields:[{...summary().fields[0],value:Infinity}]}))).toMatch(/non-finite/);
 expect(reason(summary({fields:Array.from({length:13},(_,index)=>({...summary().fields[0],id:'f'+index}))}))).toMatch(/at most 12/);
 expect(reason(summary({fields:[summary().fields[0],summary().fields[0]]}))).toMatch(/unique/);
 expect(reason(summary({source:null}))).toMatch(/needs its source/);
 const accessor=summary() as any;Object.defineProperty(accessor,'asOf',{get(){throw Error('getter ran');},enumerable:true});expect(reason(accessor)).toMatch(/accessors/);
 expect(reason(summary({availability:'not-loaded',reason:'Open Fundamentals to load public filings.',source:null,fields:[]}))).toBe('ok');
});
it('contract (review fixes): no values without a source, no empty values, derivations reference real fields',()=>{
 const reason=(value:unknown)=>{const check=checkFundamentalsSummary(value,market);return check.ok?'ok':check.reason;};
 expect(reason(summary({availability:'error',reason:'Load failed midway',source:null,fields:[summary().fields[0]]}))).toMatch(/names no source/);
 expect(reason(summary({availability:'error',reason:'Load failed midway',source:null,fields:[summary().fields[2]]}))).toBe('ok');
 expect(reason(summary({fields:[{...summary().fields[0],value:''}]}))).toMatch(/empty/);expect(reason(summary({fields:[{...summary().fields[0],label:' '}]}))).toMatch(/labelled/);
 expect(reason(summary({fields:[{...summary().fields[3]}]}))).toMatch(/not in this summary/);
});
it('contract (review fixes): values are read once, so a Proxy or array getter cannot change answers',()=>{
 let reads=0;const real=summary(),source={...real.source!},proxy=new Proxy(source,{get(target,key){if(key==='kind')reads++;return Reflect.get(target,key);},getOwnPropertyDescriptor(target,key){const d=Reflect.getOwnPropertyDescriptor(target,key);if(key==='kind'&&d){reads++;return{...d,value:reads>1?'sec-public':'local-import'};}return d;}});
 const check=checkFundamentalsSummary({...real,source:proxy},market);expect(check.ok&&check.summary.source!.kind).toBe('local-import');expect(reads).toBe(1);
 const fields=[...real.fields];Object.defineProperty(fields,'0',{get(){throw Error('getter ran');},enumerable:true,configurable:true});
 const getter=checkFundamentalsSummary({...real,fields},market);expect(getter.ok).toBe(false);if(!getter.ok)expect(getter.reason).toMatch(/accessors/);
 const sparse=[real.fields[0]];sparse.length=3;expect(checkFundamentalsSummary({...real,fields:sparse},market).ok).toBe(false);
});
it('SymbolDetails without the prop renders no fundamentals section (existing output unchanged)',()=>{expect(harness().section()).toBeNull();});
it('null prop states that nothing was supplied',()=>{expect(text(harness(null).section())).toContain('No fundamentals summary was supplied for this symbol.');});
it('renders values with units, provenance and explicit missing reasons; zero stays zero',()=>{
 const body=text(harness(summary()).section());
 expect(body).toContain('Source: Test facts file (local import) · retrieved 2026-10-01T00:00:00Z · filing cutoff 2026-09-30 · Test Entity (CIK 0000000001)');
 expect(body).toMatch(/RevenueFY2025 Q1 · 2025-02-02 to 2025-05-03 · 10-Q · filed 2025-06-10.*USD/);expect(body).toContain('Net incomePeriod not supplied0 USD');
 expect(body).toContain('Unavailable: Not reported in the supplied facts');expect(body).toContain('derived: netIncome / revenue');
});
it('not-loaded and rejected summaries show reasons and never values',()=>{
 expect(text(harness(summary({availability:'not-loaded',reason:'Open Fundamentals to load public filings.',source:null,fields:[]})).section())).toContain('Not loaded: Open Fundamentals to load public filings.');
 const rejected=text(harness(summary({market:{...market,symbol:'SPY'}})).section());expect(rejected).toMatch(/Fundamentals summary rejected: .*different market identity.*No values are shown/);expect(rejected).not.toContain('1,234.5');
});
it('Open fundamentals passes the exact market; a replaced summary or rejected open does nothing silently',()=>{
 const value=summary(),h=harness(value);h.button('Open fundamentals').props.onClick();expect(h.opened).toEqual([market]);
 const retained=h.button('Open fundamentals');h.set({fundamentals:summary()});h.render();retained.props.onClick();expect(h.opened).toHaveLength(1);
 h.reject();h.button('Open fundamentals').props.onClick();expect(text(find(h.render(),node=>node.props?.role==='alert'))).toBe('Fundamentals could not be opened.');
});
it('expanded details show the same section and opening fundamentals closes only that session',()=>{
 const h=harness(summary());h.button('Expand details').props.onClick();const modal=find(h.render(),node=>node.type===Modal);
 expect(text(h.section(modal))).toContain('Revenue');h.button('Open fundamentals',modal).props.onClick();expect(h.opened).toHaveLength(1);expect(find(h.render(),node=>node.type===Modal)).toBeNull();
});
it('second review F5: a non-available summary never renders its values, even with a source (contract file unchanged)',()=>{
 for(const availability of ['error','not-loaded'] as const){
  const body=text(harness(summary({availability,reason:'Refresh failed'})).section());
  expect(body).toMatch(/(Load failed|Not loaded): Refresh failed/);expect(body).toContain('4 supplied fields are not shown because this summary is not available.');
  expect(body).not.toContain('1,234.5');expect(body).not.toContain('Revenue');expect(body).not.toContain('0 USD');
 }
});
it('second review F6: a start-only period keeps its start date in SymbolDetails',()=>{
 const field={...summary().fields[0],period:{start:'2024-01-01',end:null,fiscalYear:null,fiscalPeriod:null}},body=text(harness(summary({fields:[field]})).section());
 expect(body).toContain('from 2024-01-01 (end not supplied)');expect(body).not.toContain('dates not supplied');
});
