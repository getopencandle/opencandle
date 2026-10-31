import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SymbolDetails,RangeBar,type SymbolDetailsProps} from '../../src/ui/SymbolDetails';
import {Modal} from '../../src/ui/Modal';
import {defaultDetailPreferences,type DetailSnapshot} from '../../src/watchlists/details';
import type {SymbolFundamentalsSummary} from '../../src/ui/symbol-details-fundamentals';

// SYNTHETIC data only. Market status, range bars, fundamentals key stats, coverage and the header links.
const hooks=vi.hoisted(()=>({scope:'parent',stores:new Map<string,{cells:any[];cursor:number;effects:Map<number,()=>void>}>()}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react'),same=(a:any[],b:any[])=>a?.length===b?.length&&a.every((value,index)=>Object.is(value,b[index]));
 const store=()=>{let value=hooks.stores.get(hooks.scope);if(!value){value={cells:[],cursor:0,effects:new Map()};hooks.stores.set(hooks.scope,value);}return value;};
 return{...actual,useState:(initial:any)=>{const s=store(),index=s.cursor++;if(!(index in s.cells))s.cells[index]=typeof initial==='function'?initial():initial;return[s.cells[index],(next:any)=>{s.cells[index]=typeof next==='function'?next(s.cells[index]):next;}];},useRef:(initial:any)=>{const s=store(),index=s.cursor++;if(!(index in s.cells))s.cells[index]={current:initial};return s.cells[index];},useMemo:(factory:()=>any,deps:any[])=>{const s=store(),index=s.cursor++;if(!(index in s.cells)||!same(s.cells[index].deps,deps))s.cells[index]={deps,value:factory()};return s.cells[index].value;},useEffect:(effect:()=>void|(()=>void),deps:any[])=>{const s=store(),index=s.cursor++;if(!(index in s.cells)||!same(s.cells[index],deps)){s.effects.get(index)?.();s.cells[index]=deps;const off=effect();if(off)s.effects.set(index,off);}}};
});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,test);if(result)return result;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function findAll(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))for(const child of node)findAll(child,test,out);else if(node?.props){if(test(node))out.push(node);findAll(node.props.children,test,out);}return out;}
function renderIn<T>(name:string,render:()=>T):T{hooks.scope=name;const old=hooks.stores.get(name);if(old)old.cursor=0;return render();}
beforeEach(()=>{hooks.scope='parent';hooks.stores.clear();vi.useFakeTimers();vi.stubGlobal('document',{querySelector:()=>null});vi.stubGlobal('window',{addEventListener(){},removeEventListener(){}});});
afterEach(()=>{for(const store of hooks.stores.values())for(const cleanup of store.effects.values())cleanup();vi.useRealTimers();vi.unstubAllGlobals();});

const market={exchange:'SYNTHETIC',symbol:'GME',synthetic:true};
function snapshot(extra:Partial<DetailSnapshot>={}):DetailSnapshot{return{symbol:'GME',exchange:'SYNTHETIC',synthetic:true,description:'Synthetic instrument',headline:{last:15,change:1,changePercent:7.1,tone:'up',session:'Regular session open, LV calendar'},
 blocks:{summary:[],daily:[{label:'Daily snapshot low',value:10},{label:'Daily snapshot high',value:20}],identity:[{label:'Currency',value:'USD'}],source:[]},diagnostic:'Synthetic',disclaimer:'Independent watchlist snapshot',
 keyStats:[{label:'52-week high',value:null,reason:'Needs a full year of daily history.'},{label:'Basic EPS (TTM)',value:null,reason:'Needs company fundamentals. OpenCandle has no permitted fundamentals source.'}],...extra};}
const summary:SymbolFundamentalsSummary={schemaVersion:1,market,availability:'available',reason:null,source:{kind:'synthetic',label:'Synthetic fixture',retrievedAt:null,sourceUrl:null,sha256:null},entity:{name:'Synthetic Co',cik:null},asOf:null,
 fields:[{id:'eps_diluted',label:'Diluted EPS (FY)',value:3,unit:'USD/shares',period:null,filed:null,form:null,accession:null,missingReason:null}]};
function details(view:DetailSnapshot,extra:Partial<SymbolDetailsProps>={}){const props:SymbolDetailsProps={snapshot:view,identity:'a',ownerToken:{},preferences:defaultDetailPreferences(),notes:[],assertOwner(){},onBegin(){},onPreferences:()=>true,...extra};return{props,render:()=>renderIn('details',()=>SymbolDetails(props))};}
const section=(root:any,label:string)=>find(root,node=>node.type==='section'&&node.props['aria-label']===label);
const button=(root:any,label:string)=>find(root,node=>node.type==='button'&&text(node)===label);

it('header shows the market status pill with the calendar caveat',()=>{
 const root=details(snapshot()).render(),pill=find(root,node=>node.props?.className==='symbol-details-status');
 expect(pill.props['data-state']).toBe('open');expect(text(pill)).toBe('Market open');expect(pill.props.title).toContain('not an exchange feed');
 // UI audit 1028 #2: an unknown market status is not shown as a row (the model still says why: symbol-details-quote.test.ts).
 const none=details(snapshot({headline:undefined})).render();
 expect(findAll(none,node=>node.props?.className==='symbol-details-status')).toHaveLength(0);expect(text(none)).not.toContain('Market status not available');
});
it('price ranges render a marked day range and a not-available 52-week range with its reason',()=>{
 const bars=findAll(section(details(snapshot()).render(),'Price ranges'),node=>node.type===RangeBar);
 expect(bars.map(bar=>bar.props.row.id)).toEqual(['day','year']);
 const day=RangeBar({row:bars[0].props.row}) as any,year=RangeBar({row:bars[1].props.row}) as any;
 expect(find(day,node=>node.props?.className==='detail-range-marker').props.style.left).toBe('50%');expect(text(day)).toContain('10');expect(text(day)).toContain('20');
 expect(text(year)).toContain('Not available: Needs a full year of daily history.');expect(find(year,node=>node.props?.className==='detail-range-marker')).toBeNull();
});
it('key stats fill from a valid fundamentals summary and keep the old reason without one',()=>{
 const plain=text(section(details(snapshot()).render(),'Key stats'));expect(plain).toContain('Unavailable: Needs company fundamentals');
 const filled=text(section(details(snapshot(),{fundamentals:summary}).render(),'Key stats'));expect(filled).toContain('Diluted EPS (FY)');expect(filled).toContain('3 USD/shares');
 const rejected=text(section(details(snapshot(),{fundamentals:{...summary,market:{...market,symbol:'OTHER'}}}).render(),'Key stats'));expect(rejected).toContain('Open fundamentals');expect(rejected).not.toContain('3 USD/shares');
});
it('More details lists unsourced sections as not available, also in the expanded view',()=>{
 const ui=details(snapshot()),more=section(ui.render(),'More details');
 expect(findAll(more,node=>node.props?.['data-coverage']!==undefined).length).toBe(11);expect(text(more)).toContain('Earnings');expect(text(more)).toContain('Not available: No options data source is connected.');
 button(ui.render(),'Expand details').props.onClick();expect(section(find(ui.render(),node=>node.type===Modal),'More details')).not.toBeNull();
 expect(text(more)).not.toMatch(/[–—]/);
});
it('Symbol info and Fundamentals header buttons open the exact market; absent handlers mean no buttons; false reports',()=>{
 expect(button(details(snapshot()).render(),'Symbol info')).toBeNull();expect(button(details(snapshot()).render(),'Fundamentals')).toBeNull();
 const info=vi.fn(()=>true),fund=vi.fn(()=>true),ui=details(snapshot(),{onOpenSymbolInfo:info,onOpenFundamentals:fund,fundamentals:summary});
 button(ui.render(),'Symbol info').props.onClick();expect(info).toHaveBeenCalledWith(market);
 button(ui.render(),'Fundamentals').props.onClick();expect(fund).toHaveBeenCalledWith(market);
 const refused=details(snapshot(),{onOpenSymbolInfo:()=>false});button(refused.render(),'Symbol info').props.onClick();
 expect(text(find(refused.render(),node=>node.props?.role==='alert'))).toBe('Symbol info could not be opened.');
});
