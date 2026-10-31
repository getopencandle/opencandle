import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {SymbolDetails,type SymbolDetailsProps} from '../../src/ui/SymbolDetails';
import {Modal} from '../../src/ui/Modal';
import {createWatchBook,restoreWatchBook} from '../../src/watchlists/model';
import {defaultDetailPreferences,type DetailSnapshot} from '../../src/watchlists/details';

// SYNTHETIC data only.: the Key stats and Performance sections, and the parent memo that attaches performance.
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

function snapshot(extra:Partial<DetailSnapshot>={}):DetailSnapshot{return{symbol:'GME',exchange:'SYNTHETIC',synthetic:true,description:'Synthetic instrument',blocks:{summary:[],daily:[],identity:[],source:[]},diagnostic:'Synthetic',disclaimer:'Independent watchlist snapshot',...extra};}
function details(view:DetailSnapshot){const props:SymbolDetailsProps={snapshot:view,identity:'a',ownerToken:{},preferences:defaultDetailPreferences(),notes:[],assertOwner(){},onBegin(){},onPreferences:()=>true};return{props,render:()=>renderIn('details',()=>SymbolDetails(props))};}
const PERF:DetailSnapshot['performance']={asOf:1789430400,reason:null,rows:[{id:'week',label:'1W',value:2.5,reason:null,base:{time:1,close:10}},{id:'month',label:'1M',value:-10,reason:null,base:{time:1,close:10}},{id:'threeMonths',label:'3M',value:0,reason:null,base:{time:1,close:10}},{id:'sixMonths',label:'6M',value:null,reason:'The daily history does not reach 2026-03-15.',base:null},{id:'ytd',label:'YTD',value:5,reason:null,base:{time:1,close:10}},{id:'year',label:'1Y',value:null,reason:'The daily history does not reach 2025-09-15.',base:null}]};

it('Performance shows one bar per period, scaled to the largest move and coloured by sign; a missing period says why',()=>{
 const ui=details(snapshot({performance:PERF})),root=ui.render(),section=find(root,node=>node.type==='section'&&node.props['aria-label']==='Performance');
 expect(section).not.toBeNull();const rows=findAll(section,node=>node.props?.['data-period']!==undefined);
 expect(rows.map(row=>row.props['data-period'])).toEqual(['1W','1M','3M','6M','YTD','1Y']);
 const fill=(label:string)=>find(rows.find(row=>row.props['data-period']===label),node=>node.props?.className==='detail-performance-fill');
 expect(fill('1M').props.style.width).toBe('100%');expect(fill('1W').props.style.width).toBe('25%');expect(fill('1M').props['data-tone']).toBe('down');expect(fill('1W').props['data-tone']).toBe('up');expect(fill('3M').props['data-tone']).toBeUndefined();
 expect(text(rows[0])).toContain('+2.5%');expect(text(rows[1])).toContain('-10%');
 const missing=rows.find(row=>row.props['data-period']==='6M');expect(text(missing)).toContain('Unavailable');expect(missing.props.title).toContain('does not reach');
 expect(text(section)).not.toMatch(/[\u2013\u2014]/);
});
it('Key stats list values and name the reason for each unavailable stat; both sections also render in the expanded view',()=>{
 const ui=details(snapshot({performance:PERF,keyStats:[{label:'Volume',value:1234,reason:null},{label:'Market capitalization',value:null,reason:'Needs company fundamentals. OpenCandle has no permitted fundamentals source.'}]}));
 const section=find(ui.render(),node=>node.type==='section'&&node.props['aria-label']==='Key stats');expect(section).not.toBeNull();
 expect(text(section)).toContain('Volume');expect(text(section)).toContain('1,234');expect(text(section)).toContain('Unavailable: Needs company fundamentals');
 find(ui.render(),node=>node.type==='button'&&text(node)==='Expand details').props.onClick();
 const modal=find(ui.render(),node=>node.type===Modal);expect(find(modal,node=>node.props?.['aria-label']==='Performance')).not.toBeNull();expect(find(modal,node=>node.props?.['aria-label']==='Key stats')).not.toBeNull();
});
it('an older snapshot without the new fields renders no new section',()=>{
 const root=details(snapshot()).render();expect(find(root,node=>node.props?.['aria-label']==='Performance')).toBeNull();expect(find(root,node=>node.props?.['aria-label']==='Key stats')).toBeNull();
});
it('the watchlist attaches performance from the selected daily source, reuses it while nothing changes, and recomputes after a restore',()=>{
 let props:any={book:createWatchBook(),datasets:[],onOpen:vi.fn(()=>true),onOpenAll:vi.fn(()=>true),onNotes:vi.fn(()=>true),onChange:vi.fn((next:any)=>{props={...props,book:next};return true;})};
 const parent=()=>renderIn('parent',()=>WatchlistPanel(props)),element=()=>find(parent(),node=>node.type===SymbolDetails);
 find(parent(),node=>node.type==='tr'&&node.key==='initial-row-0').props.onClick({ctrlKey:true,metaKey:false,shiftKey:false,altKey:false,detail:1});
 const first=element().props.snapshot as DetailSnapshot;
 expect(first.performance!.rows.map(row=>row.label)).toEqual(['1W','1M','3M','6M','YTD','1Y']);expect(first.performance!.rows.find(row=>row.label==='1W')!.value).not.toBeNull();
 expect(first.keyStats!.length).toBeGreaterThan(0);
 expect(element().props.snapshot).toBe(first);
 props={...props,book:restoreWatchBook(JSON.parse(JSON.stringify(props.book)))};
 const restored=element()?.props.snapshot as DetailSnapshot|undefined;
 if(restored)expect(restored.performance).toEqual(first.performance);
});
