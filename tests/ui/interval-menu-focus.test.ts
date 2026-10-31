import {beforeEach,expect,it,vi} from 'vitest';
import {IntervalMenu} from '../../src/ui/IntervalMenu';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createIntervalMenuState} from '../../src/domain/intervals';
// The menu's initial focus must run once, not on every render. React re-invokes a ref callback whose
// identity changes between renders, so an inline ref focused the checked row after each keystroke in the custom box.
// This harness models React's rules for refs (callback refs re-run when their identity changes) and effects (run when deps change).
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as {fn:()=>unknown;deps:unknown[]|undefined}[],ran:[] as (unknown[]|undefined|null)[]}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useEffect:(fn:()=>unknown,deps?:unknown[])=>{const i=hooks.cursor++;hooks.effects[i]={fn,deps};},
 useLayoutEffect:(fn:()=>unknown,deps?:unknown[])=>{const i=hooks.cursor++;hooks.effects[i]={fn,deps};},
 useMemo:(fn:()=>any)=>{hooks.cursor++;return fn();}};});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function all(tree:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(tree))tree.forEach(child=>all(child,predicate,out));else if(tree?.props){if(predicate(tree))out.push(tree);all(tree.props.children,predicate,out);}return out;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.ran=[];});

function harness(){
 const data=fixtureDataset('GME',40),props={datasets:[data],current:data,state:createIntervalMenuState(),onApply:vi.fn((..._a:unknown[])=>true),onEditMenu:vi.fn((..._a:unknown[])=>true),onAdvanced:vi.fn(),onClose:vi.fn()};
 const focus=vi.fn(),checked={focus},element={querySelector:(selector:string)=>selector.includes('aria-checked')?checked:null};
 let previousRef:unknown=undefined;
 // Commit a render the way React does: a changed ref (callback or object) is attached again, and effects with changed deps run.
 const render=()=>{
  hooks.cursor=0;const tree=IntervalMenu(props as any),menu=all(tree,n=>n.props.role==='menu')[0],ref=menu.props.ref??menu.ref;
  if(ref!==previousRef){if(typeof ref==='function'){if(typeof previousRef==='function')(previousRef as any)(null);ref(element);}else if(ref&&typeof ref==='object')ref.current=element;previousRef=ref;}
  hooks.effects.forEach((effect,i)=>{if(!effect)return;const last=hooks.ran[i];const changed=last===undefined||!effect.deps||!last||effect.deps.some((value,k)=>!Object.is(value,last[k]));if(changed){effect.fn();hooks.ran[i]=effect.deps??null;}});
  return tree;
 };
 const input=(tree:any)=>all(tree,n=>n.type==='input'&&n.props['aria-label']==='Custom interval')[0];
 return{data,props,render,input,focus};
}

for(const typed of ['3D','7m','90m','2h']){
 it(`typing ${typed} into the custom box keeps every character and focus, and Enter adds and selects it`,()=>{
  const {props,render,input,focus}=harness();
  render();expect(focus).toHaveBeenCalledTimes(1);// the checked row is focused once on open
  let value='';
  for(const char of typed){value+=char;input(render()).props.onChange({target:{value}});render();}
  expect(focus).toHaveBeenCalledTimes(1);// typing never pulls focus back to the checked row
  expect(input(render()).props.value).toBe(typed);
  all(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
  const minuteSource=typed.endsWith('D')||typed.endsWith('W');
  if(minuteSource){expect(props.onApply).toHaveBeenCalledOnce();const [dataset,menu]=props.onApply.mock.calls[0] as any[];expect(dataset.resolution).toBe(typed);expect(menu.custom).toContain(typed);expect(props.onClose).toHaveBeenCalledWith(true);}
  else{// a 1D chart cannot show minute bars: the row is still kept in the Custom group, with the reason shown
   expect(props.onEditMenu).toHaveBeenCalledWith({type:'add',interval:expect.any(String)});expect(props.onApply).not.toHaveBeenCalled();}
 });
}
it('a 1-minute source adds and selects 7m, 90m and 2h from the box',()=>{
 for(const typed of ['7m','90m','2h']){
  hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.ran=[];
  const {props,render,input}=harness(),minute=fixtureDataset('GME',600);
  const base=Math.floor(minute.bars[0].time/86400)*86400;minute.resolution='1m';minute.bars=minute.bars.map((bar,index)=>({...bar,time:base+index*60}));
  props.datasets=[minute];props.current=minute;
  render();let value='';for(const char of typed){value+=char;input(render()).props.onChange({target:{value}});render();}
  all(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
  expect(props.onApply).toHaveBeenCalledOnce();const [dataset,menu]=props.onApply.mock.calls[0] as any[];
  const id=typed==='2h'?'120m':typed;expect(dataset.resolution).toBe(id);if(typed!=='2h')expect(menu.custom).toContain(id);// 2h is the standard 120m row
 }
});
