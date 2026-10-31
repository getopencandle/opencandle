import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import type {ReactElement} from 'react';
import {readFileSync} from 'node:fs';
import {HeatmapDialog} from '../../src/ui/HeatmapDialog';
import {CalendarDialog} from '../../src/ui/CalendarDialog';
import {NewsDialog} from '../../src/ui/NewsDialog';
import {FundamentalsDialog} from '../../src/ui/FundamentalsDialog';
import {ScreenerDialog} from '../../src/ui/ScreenerDialog';
import {WatchlistPanel} from '../../src/ui/WatchlistPanel';
import {ScriptLibraryPanel} from '../../src/ui/ScriptLibraryPanel';
import {createHeatmapState} from '../../src/domain/heatmap';
import {createCalendarState} from '../../src/domain/calendar';
import {createNewsState} from '../../src/analysis-news/news';
import {normalizeSubmissions} from '../../src/analysis-news/filings';
import {normalizeCompanyFacts} from '../../src/fundamentals/company-facts';
import {createScreenerSettings} from '../../src/domain/screener-state';
import {createWatchBook} from '../../src/watchlists/model';
import {createScriptLibrary} from '../../src/ui/script-library';
import {initialScript} from '../../src/ui/ScriptPanel';
import {fixtureDataset} from '../../src/domain/fixtures';
import {executeScriptOnBars} from '../../src/ui/script-jobs';

// Real component handlers; hooks/effects are controlled. No DOM/native picker,
// IPC, real worker compilation, paint, focus, or executable interface pass.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,cleanups:[] as (()=>void)[]}));
vi.mock('../../src/ui/script-jobs',()=>({executeScriptOnBars:vi.fn(),scriptRunCount:(count:number)=>Math.min(count,5000),scriptTailNote:()=>''}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const effect=(fn:()=>void|(()=>void),deps:any[]=[])=>{const at=hooks.cursor++,old=hooks.cells[at];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i]))){old?.cleanup?.();const cleanup=fn();hooks.cells[at]={deps,cleanup};if(cleanup)hooks.cleanups.push(cleanup);}};return {...actual,useState:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]=typeof initial==='function'?initial():initial;return[hooks.cells[at],(value:any)=>{hooks.cells[at]=typeof value==='function'?value(hooks.cells[at]):value;}];},useRef:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]={current:initial};return hooks.cells[at];},useMemo:(fn:()=>any)=>fn(),useCallback:(fn:any)=>fn,useEffect:effect,useLayoutEffect:effect};});
const text=(value:any):string=>typeof value==='string'?value:typeof value==='number'?String(value):Array.isArray(value)?value.map(text).join(''):value?.props?text(value.props.children):'';
function find(tree:any,match:(node:ReactElement<any>)=>boolean):ReactElement<any>{let found:ReactElement<any>|undefined;const visit=(node:any)=>{if(found)return;if(Array.isArray(node)){node.forEach(visit);return;}if(!node?.props)return;if(match(node))found=node;else visit(node.props.children);};visit(tree);if(!found)throw Error('Synthetic publication handler target missing.');return found;}
function mount(component:(props:any)=>any,props:any){const render=()=>{hooks.cursor=0;return component(props);},button=(label:string)=>find(render(),node=>node.type==='button'&&(text(node.props.children)===label||node.props['aria-label']===label)),click=(label:string)=>button(label).props.onClick(),field=(label:string)=>find(render(),node=>node.props['aria-label']===label),change=(label:string,value:string)=>field(label).props.onChange({target:{value}}),error=()=>text(find(render(),node=>node.props.role==='alert'));return{props,render,button,click,field,change,error};}
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanups=[];vi.clearAllMocks();vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});vi.stubGlobal('document',{querySelector:()=>null});});
afterEach(()=>{hooks.cleanups.forEach(cleanup=>cleanup());vi.unstubAllGlobals();});

it('heatmap Apply rejection keeps its changed draft open; a legacy void acceptance closes once',()=>{
 const ui=mount(HeatmapDialog,{datasets:[fixtureDataset('GME',5)],state:createHeatmapState(),onChange:vi.fn(()=>false),onSelect:vi.fn(),onClose:vi.fn()});ui.change('Heatmap loaded bars','2');ui.click('Apply');expect(ui.error()).toContain('rejected');expect(ui.field('Heatmap loaded bars').props.value).toBe(2);expect(ui.props.onClose).not.toHaveBeenCalled();ui.props.onChange.mockReturnValue(undefined);ui.click('Apply');expect(ui.props.onClose).toHaveBeenCalledOnce();
});
it('calendar Apply rejection retains filters and added draft rather than closing or announcing a save',()=>{
 const ui=mount(CalendarDialog,{state:createCalendarState(),onChange:vi.fn(()=>false),onClose:vi.fn()});ui.change('Calendar availability cutoff','1234');ui.click('Apply');expect(ui.error()).toContain('rejected');expect(ui.field('Calendar availability cutoff').props.value).toBe(1234);expect(ui.props.onClose).not.toHaveBeenCalled();
});
it('news import rejection preserves pasted source and existing saved documents',()=>{
 const source=readFileSync(new URL('../../examples/news-synthetic.json',import.meta.url),'utf8'),state=createNewsState(),before=JSON.stringify(state),ui=mount(NewsDialog,{symbol:'GME',watchlist:['GME'],state,filings:[],onChange:vi.fn(()=>false),onFilingsChange:vi.fn(),onClose:vi.fn()});ui.change('Local news JSON',source);ui.click('Import pasted JSON');expect(ui.error()).toContain('rejected');expect(ui.field('Local news JSON').props.value).toBe(source);expect(JSON.stringify(state)).toBe(before);expect(ui.props.onClose).not.toHaveBeenCalled();
});
it('fundamentals import rejection retains JSON and selection instead of selecting an unsaved document',()=>{
 const source=JSON.stringify({cik:1234,entityName:'Synthetic review issuer',facts:{'us-gaap':{Assets:{units:{USD:[{end:'2024-12-31',val:12,filed:'2025-02-01'}]}}}}}),ui=mount(FundamentalsDialog,{symbol:'GME',documents:[],onChange:vi.fn(()=>false),onClose:vi.fn()});ui.change('Companyfacts JSON',source);ui.click('Import pasted JSON');expect(ui.error()).toContain('rejected');expect(ui.field('Companyfacts JSON').props.value).toBe(source);expect(ui.field('No fundamentals yet')).toBeTruthy();
});
it('screener save rejection preserves the named editor without pushing local Undo state',()=>{
 const ui=mount(ScreenerDialog,{datasets:[fixtureDataset('GME',5)],settings:{...createScreenerSettings(),activeScreenId:null},onChange:vi.fn(()=>false),onClose:vi.fn(),onSelect:vi.fn()});ui.click('Save screen');ui.change('Screen name','Synthetic retained draft');find(ui.render(),node=>node.type==='form').props.onSubmit({preventDefault:vi.fn(),nativeEvent:{isComposing:false}});expect(ui.error()).toContain('rejected');expect(ui.field('Screen name').props.value).toBe('Synthetic retained draft');expect(ui.button('Undo screen edit').props.disabled).toBe(true);expect(text(ui.render())).not.toContain('Changes applied.');
});
it('watchlist paste rejection preserves the native-free draft and active original list',()=>{
 const book=createWatchBook(['GME']),before=JSON.stringify(book),ui=mount(WatchlistPanel,{book,datasets:[],onChange:vi.fn(()=>false),onOpen:vi.fn(),onOpenAll:vi.fn()});ui.click('Watchlist column menu');ui.click('Import and export...');ui.change('Watchlist import text','NYSE:GME');ui.click('Import pasted list');expect(ui.error()).toContain('rejected');expect(ui.field('Watchlist import text').props.value).toBe('NYSE:GME');expect(JSON.stringify(book)).toBe(before);ui.props.onChange.mockReturnValue(undefined);ui.click('Import pasted list');expect(()=>ui.field('Watchlist import text')).toThrow('target missing');
});
it('rejected script creation cannot overwrite the original buffer before a later Save attempt',()=>{
 const library=createScriptLibrary(initialScript),ui=mount(ScriptLibraryPanel,{open:true,chart:null,bars:[],fixture:true,identity:'Synthetic review',library,bindings:[],onChange:vi.fn(()=>false),onBindingsChange:vi.fn(),onClose:vi.fn()});ui.click('New strategy');expect(text(ui.render())).toContain('rejected');ui.click('Save script');const last=ui.props.onChange.mock.calls.at(-1)[0];expect(last.documents.find((doc:any)=>doc.id===library.activeId).source).toBe(initialScript.source);expect(last.documents.length).toBe(1);expect(ui.props.onClose).not.toHaveBeenCalled();
});
it('rejected compiled script attachment emits neither result callback nor Added success',async()=>{
 const result={plots:[],alerts:[],orders:[],state:null,diagnostics:[],elapsedMs:0};vi.mocked(executeScriptOnBars).mockResolvedValue({result,barIds:[]} as any);const ui=mount(ScriptLibraryPanel,{open:true,chart:{scripts:{list:()=>[],subscribe:()=>()=>{}}},bars:[],fixture:true,identity:'Synthetic review',library:createScriptLibrary(initialScript),bindings:[],onChange:vi.fn(),onBindingsChange:vi.fn(()=>false),onResult:vi.fn(),onClose:vi.fn()});ui.click('Run and add to chart');await flush();expect(ui.props.onBindingsChange).toHaveBeenCalledOnce();expect(ui.props.onResult).not.toHaveBeenCalled();expect(text(ui.render())).toContain('rejected');expect(text(ui.render())).not.toContain('Added to chart');
});
it('SEC filings import rejection preserves its JSON draft and does not select an unsaved filing document',()=>{
 const source=JSON.stringify({cik:1234,name:'Synthetic filing issuer',filings:{recent:{accessionNumber:['0000001234-24-000001'],filingDate:['2024-01-02'],form:['8-K'],primaryDocument:['synthetic.htm']},files:[]}}),ui=mount(NewsDialog,{symbol:'GME',watchlist:['GME'],state:createNewsState(),filings:[],onChange:vi.fn(),onFilingsChange:vi.fn(()=>false),onClose:vi.fn()});ui.click('SEC filings');ui.change('SEC submissions JSON',source);ui.click('Import pasted JSON');expect(ui.props.onFilingsChange).toHaveBeenCalledOnce();expect(ui.error()).toContain('rejected');expect(ui.field('SEC submissions JSON').props.value).toBe(source);expect(ui.field('Saved filings document').props.value).toBe('');
});
it('rejected fundamentals removal preserves selected data and displays the failure inside its dialog',()=>{
 const facts=normalizeCompanyFacts({cik:1234,entityName:'Synthetic review issuer',facts:{}}),document={id:'synthetic-facts',facts,source:{kind:'synthetic',label:'Synthetic only',retrievedAt:'2026-10-14T00:00:00Z',sourceUrl:null,sha256:null}},ui=mount(FundamentalsDialog,{symbol:'GME',documents:[document],onChange:vi.fn(()=>false),onClose:vi.fn()});ui.click('Remove saved data');expect(ui.field('Fundamentals document').props.value).toBe('synthetic-facts');expect(ui.error()).toContain('rejected');expect(ui.props.onChange).toHaveBeenCalledWith([]);
});
it('rejected saved filings removal retains its selection',()=>{
 const document=normalizeSubmissions({cik:1234,name:'Synthetic filing issuer',filings:{recent:{accessionNumber:[],filingDate:[],form:[],primaryDocument:[]},files:[]}},{kind:'local-import',retrievedAt:'2026-10-14T00:00:00Z',sourceUrl:null,sha256:null},'synthetic-filings'),ui=mount(NewsDialog,{symbol:'GME',watchlist:['GME'],state:createNewsState(),filings:[document],onChange:vi.fn(),onFilingsChange:vi.fn(()=>false),onClose:vi.fn()});ui.click('SEC filings');ui.click('Remove saved filings');expect(ui.field('Saved filings document').props.value).toBe('synthetic-filings');expect(ui.error()).toContain('rejected');
});
it('rejected screener configuration edits leave the actual editor and its local Undo stack untouched',()=>{
 const settings=createScreenerSettings(),before=JSON.stringify(settings),ui=mount(ScreenerDialog,{datasets:[fixtureDataset('GME',5)],settings,onChange:vi.fn(()=>false),onClose:vi.fn(),onSelect:vi.fn()});ui.click('Add column');ui.change('Column label','Synthetic rejected column');find(ui.render(),node=>node.type==='form').props.onSubmit({preventDefault:vi.fn()});expect(ui.error()).toContain('rejected');expect(ui.field('Column label').props.value).toBe('Synthetic rejected column');expect(ui.button('Undo screen edit').props.disabled).toBe(true);expect(JSON.stringify(settings)).toBe(before);
});
it('rejected watchlist deletion retains confirmation and makes the failure visible inside that confirmation',()=>{
 const book=createWatchBook(['GME']),before=JSON.stringify(book),ui=mount(WatchlistPanel,{book,datasets:[],onChange:vi.fn(()=>false),onOpen:vi.fn(),onOpenAll:vi.fn()});ui.click('Open watchlists');ui.click('Delete active list');ui.click('Confirm change');const dialog=find(ui.render(),node=>node.props.title==='Confirm watchlist change');expect(text(dialog)).toContain('rejected');expect(ui.button('Confirm change')).toBeTruthy();expect(JSON.stringify(book)).toBe(before);
});
