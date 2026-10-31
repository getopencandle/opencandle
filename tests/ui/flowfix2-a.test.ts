import {beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {BOTTOM_RANGES,bottomRange,servedBottomRange} from '../../src/chart/bottom-toolbar';
import {refitViewportForInterval} from '../../src/ui/workspace-intervals';
import {IntervalEntry} from '../../src/ui/IntervalEntry';

// Minimal hooks: state and refs persist per call order; effects run after each render when their deps change.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>void>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useEffect:(run:()=>any,deps?:unknown[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(old&&deps&&old.deps.length===deps.length&&old.deps.every((d:unknown,k:number)=>Object.is(d,deps[k])))return;hooks.effects.push(()=>{old?.cleanup?.();hooks.cells[i]={deps:deps??[],cleanup:run()};});}};});
function all(tree:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(tree))tree.forEach(child=>all(child,predicate,out));else if(tree?.props){if(predicate(tree))out.push(tree);all(tree.props.children,predicate,out);}return out;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});

const DAY=86400;
const daily=(n:number,start=1_600_000_000)=>Array.from({length:n},(_,i)=>start+i*DAY);
const weekly=(n:number,start=1_600_000_000)=>Array.from({length:n},(_,i)=>start+i*7*DAY);

it('#4 range buttons open the interval their tooltip names when the data can serve it (5Y opens 1W, 1Y opens 1D)',()=>{
 const servable=(id:string)=>['1D','1W','1M'].includes(id);
 expect(servedBottomRange(bottomRange('5Y'),servable)).toEqual({interval:'1W',tooltip:'5 years in 1 week intervals'});
 expect(servedBottomRange(bottomRange('1Y'),servable)).toEqual({interval:'1D',tooltip:'1 year in 1 day intervals'});
 expect(servedBottomRange(bottomRange('All'),servable)?.interval).toBe('1M');
});

it('#4 on daily-only data the intraday ranges name the nearest servable interval instead of minutes',()=>{
 const servable=(id:string)=>['1D','1W','1M'].includes(id);
 for(const preset of ['1D','5D','1M','3M','6M'])expect(servedBottomRange(bottomRange(preset),servable),preset).toMatchObject({interval:'1D',tooltip:expect.stringMatching(/ in 1 day intervals$/)});
 expect(servedBottomRange(bottomRange('5D'),servable)?.tooltip).toBe('5 days in 1 day intervals');
 // Hourly data serves 3M exactly and 1D at the nearest coarser hourly step.
 const hourly=(id:string)=>['60m','120m','240m','1D','1W','1M'].includes(id);
 expect(servedBottomRange(bottomRange('3M'),hourly)?.interval).toBe('60m');
 expect(servedBottomRange(bottomRange('1D'),hourly)).toEqual({interval:'60m',tooltip:'1 day in 1 hour intervals'});
 expect(servedBottomRange(bottomRange('1D'),()=>false)).toBeNull();
 expect(BOTTOM_RANGES).toHaveLength(9);
});

it('#6 an interval change keeps the visible bar count instead of the old time span (no hairline weekly candles)',()=>{
 const days=daily(1000),weeks=weekly(150);
 // At the latest bar with a 5 bar right margin: 100 daily bars visible.
 const old={from:days[900],to:days[999]+5*DAY};
 // A view at the latest bar drops its range; the renderer keeps the bar spacing (interval-spacing-carry).
 expect(refitViewportForInterval(old,days,weeks)).toBeNull();
 // Scrolled back: the view ends at the same time and still shows 100 bars (clamped at the first bar).
 const back=refitViewportForInterval({from:days[400],to:days[499]},days,weeks)!;
 const end=weeks.filter(t=>t<=days[499]).length-1;
 expect(back.to).toBe(weeks[end]);expect(back.from).toBe(weeks[Math.max(0,end-99)]);
 expect(refitViewportForInterval({from:days[0]-10*DAY,to:days[0]-DAY},days,weeks)).toBeNull();
});

it('#10 a refused interval shows its reason, then the prompt closes itself; a press outside closes it at once',()=>{
 vi.useFakeTimers();
 try{
  const listeners=new Map<string,(event:any)=>void>(),doc={addEventListener:(type:string,fn:any)=>listeners.set(type,fn),removeEventListener:(type:string)=>listeners.delete(type)};
  const onSubmit=vi.fn((_t:string)=>({ok:false,message:'Needs finer data than the loaded 1 day bars.'})),onClose=vi.fn();
  const render=()=>{hooks.cursor=0;const tree=IntervalEntry({seed:'3h',current:'1D',onSubmit,onClose,errorMs:1000});const form=all(tree,n=>n.type==='form')[0];hooks.cells[2].current={ownerDocument:doc,contains:(node:unknown)=>node==='inside'};const effects=hooks.effects;hooks.effects=[];effects.forEach(run=>run());return form;};
  render().props.onSubmit({preventDefault(){}});
  const shown=render();expect(JSON.stringify(all(shown,n=>n.props.role==='alert').map(n=>n.props.children))).toContain('Needs finer data');
  expect(onClose).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);expect(onClose).toHaveBeenCalledOnce();
  onClose.mockClear();listeners.get('pointerdown')!({target:'inside'});expect(onClose).not.toHaveBeenCalled();
  listeners.get('pointerdown')!({target:'outside'});expect(onClose).toHaveBeenCalledOnce();
 }finally{vi.useRealTimers();}
});

it('#1 and #6 App wiring: a time interval on a Range chart leaves Range; the derived-bars toast is gone',()=>{
 const app=readFileSync('src/ui/App.tsx','utf8'),menu=readFileSync('src/ui/IntervalMenu.tsx','utf8');
 expect(app).not.toContain('Opened derived local UTC bars');
 expect(app).toContain("function leaveRangeStyle():Partial<Workspace>{if(current.current.chartStyle!=='range')return{};");
 expect(app).toContain("style:'candles',chartOptions:{...cell.chartOptions,auto:true}");
 expect(app).toContain("const grid=current.current.chartStyle==='range'&&next.grid?gridLeavingRange(next.grid):next.grid;if(!commit({imports:next.imports,intervals:next.intervals,grid}))return false;");
 expect(app).toContain("if(choice.interval===dataset.resolution)return current.current.chartStyle!=='range'||commit(leaveRangeStyle())");
 expect(app).toContain('onLeaveRange={()=>commit(leaveRangeStyle())}');
 expect(menu).toContain('if (range?.active && onLeaveRange)');
 expect(app).toContain('served={bottomServed}');
});

it('#12 the Data window rereads an indicator whose first read had no values yet (RSI rows appear once calculated)',async()=>{
 const {dataWindowIndicators}=await import('../../src/ui/DataWindowPanel');
 let ready=false;const chart={indicators:{values:()=>ready?{id:'r',series:[{id:'rsi',label:'RSI',values:[50,60]}],diagnostics:[],policies:[]}:null}} as any;
 const view={id:'r',kind:'rsi',visible:true,series:[{id:'rsi',label:'RSI'}],plots:{}} as any;
 expect(dataWindowIndicators(chart,[view])[0].plots).toHaveLength(0);
 ready=true;expect(dataWindowIndicators(chart,[view])[0].plots.map(p=>p.values[1])).toEqual([60]);
});
