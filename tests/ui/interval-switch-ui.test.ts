import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {IntervalMenu} from '../../src/ui/IntervalMenu';
import {IntervalEntry} from '../../src/ui/IntervalEntry';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createIntervalMenuState,editIntervalMenu,intervalEntrySeed,submitIntervalEntry} from '../../src/domain/intervals';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:()=>{hooks.cursor++;},useMemo:(fn:()=>any)=>{hooks.cursor++;return fn();}};});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function all(tree:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(tree))tree.forEach(child=>all(child,predicate,out));else if(tree?.props){if(predicate(tree))out.push(tree);all(tree.props.children,predicate,out);}return out;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});afterEach(()=>vi.unstubAllGlobals());

const liveOf=(providerId:string,datasetId:string)=>{const base=fixtureDataset('BTC-USD',3);return{...base,resolution:'5m',provenance:{...base.provenance,providerId,datasetId}};};
const setup=(current:any,state=createIntervalMenuState())=>{
 const props={datasets:[current],current,state,onApply:vi.fn((..._a:unknown[])=>true),onApplyLive:vi.fn((..._a:unknown[])=>true),onEditMenu:vi.fn((..._a:unknown[])=>true),onAdvanced:vi.fn(),onClose:vi.fn()};
 const render=()=>{hooks.cursor=0;return IntervalMenu(props as any);};
 return{props,render,radio:(label:string)=>all(render(),n=>n.props.role==='menuitemradio'&&text(n).replace('✓','')===label)[0]};
};

it('demo: rows with no finer source are disabled with a short plain reason; derivable rows stay enabled and switch',()=>{
 const demo=fixtureDataset('GME',3),{radio,props,render}=setup(demo);
 expect(radio('1 minute').props.disabled).toBe(true);expect(radio('1 minute').props.title).toMatch(/finer/i);
 expect(radio('1 week').props.disabled).toBe(false);expect(radio('12 months').props.disabled).toBe(false);
 // The reason moved from visible row text into the tooltip (row + button title) and stays exposed as the button's accessible description.
 const reasonText=radio('1 minute').props.title as string;expect(reasonText).toMatch(/Needs finer data/);
 const described=all(render(),n=>n.props.id===radio('1 minute').props['aria-describedby']);expect(described).toHaveLength(1);expect(text(described[0])).toBe(reasonText);expect(described[0].props.className).toBe('lv-sr-only');
 expect(all(render(),n=>n.props.className==='lv-interval-row'&&n.props.title===reasonText).length).toBeGreaterThan(0);
 expect(text(render())).toMatch(/Needs finer data/);
 expect(radio('1 week').props['aria-describedby']).toBeUndefined();
 radio('3 months').props.onClick();
 expect(props.onApply).toHaveBeenCalledOnce();expect((props.onApply.mock.calls[0][0] as any).resolution).toBe('3M');
 expect(props.onApplyLive).not.toHaveBeenCalled();
});

it('live Coinbase: 7 minutes, 4 hours and 1 week switch through onApplyLive; seconds are disabled with a reason',()=>{
 const live=liveOf('coinbase-public','live:coinbase-public:BTC-USD:5m'),state=editIntervalMenu(createIntervalMenuState(),{type:'add',interval:'7m'}),{radio,props}=setup(live,state);
 expect(radio('30 seconds').props.disabled).toBe(true);expect(radio('30 seconds').props.title).toMatch(/1 minute/);
 for(const label of ['7 minutes','4 hours','1 week','3 months'])expect(radio(label).props.disabled,label).toBe(false);
 radio('7 minutes').props.onClick();
 expect(props.onApplyLive).toHaveBeenCalledWith('7m',expect.anything());expect(props.onApply).not.toHaveBeenCalled();
});

it('live Alpaca: a custom 90m interval switches by aggregation',()=>{
 const live=liveOf('alpaca-iex','live:alpaca-iex:AAPL:5m'),state=editIntervalMenu(createIntervalMenuState(),{type:'add',interval:'90m'}),{radio,props}=setup(live,state);
 radio('90 minutes').props.onClick();
 expect(props.onApplyLive).toHaveBeenCalledWith('90m',expect.anything());
});

it('custom input: an unavailable interval is still kept in the menu and explains why',()=>{
 const demo=fixtureDataset('GME',3),{props,render}=setup(demo);
 const input=()=>all(render(),n=>n.type==='input'&&n.props['aria-label']==='Custom interval')[0];
 input().props.onChange({target:{value:'7m'}});
 all(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 expect(props.onEditMenu).toHaveBeenCalledWith({type:'add',interval:'7m'});expect(props.onApply).not.toHaveBeenCalled();
 expect(all(render(),n=>n.props.role==='alert').map(text).join('')).toMatch(/finer/);
 input().props.onChange({target:{value:'3D'}});
 all(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 expect((props.onApply.mock.calls.at(-1)![0] as any).resolution).toBe('3D');
});

it('custom rows can be starred and removed',()=>{
 const demo=fixtureDataset('GME',3),state=editIntervalMenu(createIntervalMenuState(),{type:'add',interval:'3D'}),{props,render}=setup(demo,state);
 const remove=all(render(),n=>n.props['aria-label']==='Remove 3 days')[0];remove.props.onClick();
 expect(props.onEditMenu).toHaveBeenCalledWith({type:'remove',interval:'3D'});
 const star=all(render(),n=>n.props['aria-label']==='Favorite 3 days')[0];star.props.onClick();
 expect(props.onEditMenu).toHaveBeenCalledWith({type:'favorite',interval:'3D'});
});

it('keyboard: a digit seeds the prompt, Enter applies "5", "1h", "2D" through the same switch handler; bad text stays open',()=>{
 expect(intervalEntrySeed('5')).toBe('5');expect(intervalEntrySeed('x')).toBeNull();
 const apply=vi.fn((_i:string)=>({ok:true}));
 for(const [text,id] of [['5','5m'],['1h','60m'],['2D','2D'],['3M','3M']] as const){expect(submitIntervalEntry(text,apply)).toMatchObject({ok:true,interval:id});}
 expect(apply.mock.calls.map(c=>c[0])).toEqual(['5m','60m','2D','3M']);
 const bad=submitIntervalEntry('zz',apply);expect(bad.ok).toBe(false);expect(apply).toHaveBeenCalledTimes(4);
 const refused=submitIntervalEntry('5',()=>({ok:false,message:'No finer data.'}));expect(refused).toMatchObject({ok:false,message:'No finer data.'});
});

it('IntervalEntry prompt submits the typed text and closes; Escape closes without applying',()=>{
 const onSubmit=vi.fn((_t:string)=>({ok:true,message:null})),onClose=vi.fn();
 const render=()=>{hooks.cursor=0;return IntervalEntry({seed:'5',current:'1D',onSubmit,onClose});};
 const form=all(render(),n=>n.type==='form')[0],input=all(render(),n=>n.type==='input')[0];
 input.props.onChange({target:{value:'1h'}});
 all(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 expect(onSubmit).toHaveBeenCalledWith('1h');expect(onClose).toHaveBeenCalledOnce();expect(form.props['aria-label']).toBe('Change interval');
 onClose.mockClear();
 all(render(),n=>n.type==='input')[0].props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){}});
 expect(onClose).toHaveBeenCalledOnce();
});

it('App wiring: digit key opens the prompt, favorites are sorted and switch live and demo through one handler',async()=>{
 const {readFileSync}=await vi.importActual<typeof import('node:fs')>('node:fs'),app=readFileSync('src/ui/App.tsx','utf8');
 expect(app).toContain('setIntervalPrompt(intervalSeed)');
 expect(app).toContain('<IntervalEntry ');
 expect(app).toContain('sortIntervalIds(workspace.intervals.favorites)');
 expect(app).toContain('onApplyLive={applyLiveInterval}');
 expect(app).toMatch(/function favoriteInterval\(target:string\)\{const result=switchInterval\(target\)/);
});
