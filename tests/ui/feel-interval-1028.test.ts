import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {IntervalMenu,customIntervalText} from '../../src/ui/IntervalMenu';
import {intervalStrip,intervalToolbar,currentIntervalId} from '../../src/ui/interval-toolbar';
import {rangeBars,rangeStartIndex,rangeSizeRefusal,RANGE_BARS_MAX} from '../../src/chart/derived/range';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createIntervalMenuState} from '../../src/domain/intervals';
import type {Bar} from '../../src/domain/types';
// Controlled handler tests (no DOM rendering or native input).
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:()=>{hooks.cursor++;},useMemo:(fn:()=>any)=>{hooks.cursor++;return fn();}};});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function all(tree:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(tree))tree.forEach(child=>all(child,predicate,out));else if(tree?.props){if(predicate(tree))out.push(tree);all(tree.props.children,predicate,out);}return out;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});afterEach(()=>vi.unstubAllGlobals());

it('favorites strip: a fixed set in stored order, the active one pressed, the current interval on the dropdown only when it is not a favorite',()=>{
 const favorites=['1m','5m','60m','1D'];
 for(const current of ['1m','60m','1D','30m','1W']){
  const strip=intervalStrip(favorites,current);
  expect(strip.favorites.map(row=>row.id)).toEqual(favorites);// never reordered or rewritten by a pick
  expect(strip.favorites.filter(row=>row.active).map(row=>row.id)).toEqual(favorites.includes(current)?[current]:[]);
  expect(strip.current).toBe(favorites.includes(current)?null:current);
 }
 expect(intervalStrip([],'1D').current).toBe('1D');
 expect(currentIntervalId('candles',null,'1D')).toBe('1D');expect(currentIntervalId('range',{range:{range:100}} as any,'1D')).toBe('100R');
});
it('toolbar: favorites come before the dropdown; clicking the active favorite does nothing; others switch',()=>{
 const onPick=vi.fn(),onToggleMenu=vi.fn(),tree=intervalToolbar({favorites:['1m','5m','1D'],currentId:'5m',menuOpen:false,onPick,onToggleMenu});
 const buttons=all(tree,n=>n.type==='button');
 expect(buttons.map(b=>b.props.id??b.props['data-interval-favorite'])).toEqual(['1m','5m','1D','lv-interval-badge']);
 expect(buttons[1].props['aria-pressed']).toBe(true);expect(buttons[1].props.className).toBe('active');
 buttons[1].props.onClick();expect(onPick).not.toHaveBeenCalled();
 buttons[0].props.onClick();expect(onPick).toHaveBeenCalledWith('1m');
 expect(text(buttons[3])).toBe('');// current is a favorite: the dropdown shows only its chevron
 buttons[3].props.onClick();expect(onToggleMenu).toHaveBeenCalledOnce();
 const other=all(intervalToolbar({favorites:['1m','5m','1D'],currentId:'240m',menuOpen:false,onPick,onToggleMenu}),n=>n.props.id==='lv-interval-badge')[0];
 expect(text(other)).toBe('4h');
});

const setup=(current=fixtureDataset('GME',40),over:Record<string,unknown>={})=>{
 const props={datasets:[current],current,state:createIntervalMenuState(),onApply:vi.fn((..._a:unknown[])=>true),onApplyLive:vi.fn((..._a:unknown[])=>true),onEditMenu:vi.fn((..._a:unknown[])=>true),onAdvanced:vi.fn(),onClose:vi.fn(),onRangeInterval:vi.fn((..._a:unknown[])=>true),...over};
 const render=()=>{hooks.cursor=0;return IntervalMenu(props as any);};
 return{props,render};
};
it('menu: the reference app-like groups with collapsible headers that remember their state; the current group opens with the menu',()=>{
 const store=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>{store.set(key,value);}});
 const {render}=setup(),headers=()=>all(render(),n=>n.props['data-interval-group']!==undefined);
 expect(headers().map(text).map(value=>value.replace(/[▸▾]/g,''))).toEqual(['Ticks','Seconds','Minutes','Hours','Days','Weeks','Months','Ranges']);
 const rows=(group:string)=>all(all(render(),n=>n.props.role==='group'&&n.props['aria-label']===group)[0],n=>n.props.role==='menuitemradio').map(text);
 expect(rows('Minutes')).toEqual(['1 minute','2 minutes','3 minutes','5 minutes','10 minutes','15 minutes','30 minutes','45 minutes']);
 expect(rows('Hours')).toEqual(['1 hour','2 hours','3 hours','4 hours']);
 expect(rows('Months')).toEqual(['1 month','3 months','6 months','12 months']);
 headers().find(n=>n.props['data-interval-group']==='Minutes')!.props.onClick();
 expect(rows('Minutes')).toEqual([]);expect(JSON.parse(store.get('lv.intervalMenu.collapsed')!)).toEqual(['Minutes']);
 store.set('lv.intervalMenu.collapsed',JSON.stringify(['Minutes','Days']));hooks.cells=[];
 const again=setup();hooks.cursor=0;const tree=again.render(),open=(group:string)=>all(tree,n=>n.props['data-interval-group']===group)[0].props['aria-expanded'];
 expect(open('Minutes')).toBe(false);expect(open('Days')).toBe(true);// GME demo is on 1D, so Days opens
});
it('menu: blocked browser storage leaves every group open',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}});
 const {render}=setup();const headers=all(render(),n=>n.props['data-interval-group']!==undefined);
 expect(headers.every(n=>n.props['aria-expanded']===true)).toBe(true);headers[0].props.onClick();
});
it('custom interval: number plus unit; text with its own unit keeps it',()=>{
 expect(customIntervalText('7','h')).toBe('7h');expect(customIntervalText(' 3 ','D')).toBe('3D');expect(customIntervalText('90m','D')).toBe('90m');expect(customIntervalText('25','R')).toBe('25R');
 const {props,render}=setup();
 all(render(),n=>n.type==='input'&&n.props['aria-label']==='Custom interval')[0].props.onChange({target:{value:'3'}});
 all(render(),n=>n.type==='select'&&n.props['aria-label']==='Custom interval unit')[0].props.onChange({target:{value:'D'}});
 all(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 expect((props.onApply.mock.calls.at(-1)![0] as any).resolution).toBe('3D');
 all(render(),n=>n.type==='input'&&n.props['aria-label']==='Custom interval')[0].props.onChange({target:{value:'40'}});
 all(render(),n=>n.type==='select'&&n.props['aria-label']==='Custom interval unit')[0].props.onChange({target:{value:'R'}});
 all(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 expect(props.onRangeInterval).toHaveBeenCalledWith(40);
});

/** BTC-like daily bars: price about 60,000, a 3% day, tick 0.01. */
function bigBars(count:number):Bar[]{const out:Bar[]=[];let price=60000;for(let i=0;i<count;i++){const open=price,close=price*(i%2?1.01:0.99);out.push({time:1700000000+i*86400,open,high:Math.max(open,close)*1.01,low:Math.min(open,close)*0.99,close,volume:1});price=close;}return out;}
it('range bars: a tiny range on big moves no longer builds an unbounded list (the renderer crash); recent bars are used, or a clear refusal',()=>{
 const bars=bigBars(300);
 const ten=rangeBars(bars,{range:1000,phantomBars:false},{tickSize:0.01});// 10 dollars on 3% days: about 1M bars before
 expect(ten.ok).toBe(true);if(!ten.ok)return;
 expect(ten.value.confirmed.length).toBeLessThanOrEqual(RANGE_BARS_MAX);expect(ten.value.confirmed.length).toBeGreaterThan(RANGE_BARS_MAX/2);
 expect(rangeStartIndex(bars,1000,0.01)).toBeGreaterThan(0);
 const one=rangeBars(bars,{range:1,phantomBars:false},{tickSize:0.01});// 1 cent: one daily bar alone is far over the limit
 expect(one.ok).toBe(false);if(!one.ok){expect(one.diagnostic.code).toBe('DERIVED_OUTPUT_LIMIT');expect(one.diagnostic.message).toMatch(/^1R is too small for these bars.*Use \d+R or larger/);}
 // Ordinary data is unchanged: every source bar is used.
 const demo=fixtureDataset('GME',500).bars;expect(rangeStartIndex(demo,100,0.01)).toBe(0);expect(rangeSizeRefusal(demo,1,0.01)).toBeNull();
});
it('menu: a range interval that cannot be built is disabled with the reason; ones that fit stay enabled',()=>{
 const base=fixtureDataset('BTC-USD',3),current={...base,bars:bigBars(300)},{render}=setup(current as any);
 const row=(label:string)=>all(render(),n=>n.props.role==='menuitemradio'&&text(n)===label)[0];
 expect(row('1 range').props.disabled).toBe(true);expect(row('1 range').props.title).toMatch(/too small/);
 expect(row('1000 ranges').props.disabled).toBe(false);
});
it('App: bottom range buttons switch a live feed interval and resolve against the chart as it is now',async()=>{
 const {readFileSync}=await vi.importActual<typeof import('node:fs')>('node:fs'),app=readFileSync('src/ui/App.tsx','utf8');
 const body=app.slice(app.indexOf('function rangeFromBottomToolbar('),app.indexOf('function toggleIntervalMenu('));
 expect(body).toContain("choice.kind==='live'&&choice.interval!==dataset.resolution){");expect(body).toContain('applyLiveInterval(interval,current.current.intervals,()=>{const id=current.current.sourceId;');
 expect(body).toContain('const served=servedBottomRange(row,id=>');expect(body).not.toContain('bottomServed[row.preset]');
});
it('several original sources: a weekly or 2-hour interval aggregates from the coarsest source at or below it, not the finest',async()=>{
 const {resolveIntervalSwitch}=await import('../../src/domain/interval-switch');
 const daily=fixtureDataset('GME',200),last=daily.bars.at(-1)!.time;
 const minute={...daily,resolution:'1m',bars:Array.from({length:600},(_,i)=>({time:last+86400+i*60,open:20,high:21,low:19,close:20.5,volume:1})),provenance:{...daily.provenance,datasetId:daily.provenance.datasetId+':1m'}};
 const hourly={...minute,resolution:'60m',bars:Array.from({length:40},(_,i)=>({time:last+86400+i*3600,open:20,high:21,low:19,close:20.5,volume:1})),provenance:{...daily.provenance,datasetId:daily.provenance.datasetId+':60m'}};
 const sources=[daily,minute,hourly];
 const weekly=resolveIntervalSwitch(sources,minute,'1W');
 expect(weekly.ok&&weekly.kind==='local'&&(weekly.result as any).derivation.sourceResolution).toBe('1D');
 expect(weekly.ok&&weekly.kind==='local'&&weekly.result.dataset.bars.length).toBeGreaterThan(30);// 4 bars when built from the 1m source
 const two=resolveIntervalSwitch(sources,daily,'120m');
 expect(two.ok&&two.kind==='local'&&(two.result as any).derivation.sourceResolution).toBe('60m');
 const seven=resolveIntervalSwitch(sources,daily,'7m');// only the 1m source fits 7-minute buckets
 expect(seven.ok&&seven.kind==='local'&&(seven.result as any).derivation.sourceResolution).toBe('1m');
});
