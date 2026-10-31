// A typed interval queued behind a background save keeps the prompt open and shows a refusal there.
import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {IntervalEntry} from '../../src/ui/IntervalEntry';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>void>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useEffect:(run:()=>any,deps?:unknown[])=>{const i=hooks.cursor++,old=hooks.cells[i];if(old&&deps&&old.deps.length===deps.length&&old.deps.every((d:unknown,k:number)=>Object.is(d,deps[k])))return;hooks.effects.push(()=>{old?.cleanup?.();hooks.cells[i]={deps:deps??[],cleanup:run()};});}};});
function all(tree:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(tree))tree.forEach(child=>all(child,predicate,out));else if(tree?.props){if(predicate(tree))out.push(tree);all(tree.props.children,predicate,out);}return out;}

function harness(onSubmit:(text:string)=>any){
 hooks.cells=[];hooks.effects=[];const onClose=vi.fn(),doc={addEventListener(){},removeEventListener(){}};
 const render=()=>{hooks.cursor=0;const tree=IntervalEntry({seed:'5',current:'1D',onSubmit,onClose});hooks.cells[2].current={ownerDocument:doc,contains:()=>true,querySelector:()=>null};const effects=hooks.effects;hooks.effects=[];effects.forEach(run=>run());return tree;};
 return{render,onClose};
}
const text=(tree:any)=>JSON.stringify(all(tree,n=>n.props['aria-live']==='polite').map(n=>n.props.children));

it('a queued switch that is refused shows its reason in the prompt and does not close it',async()=>{
 let settle:(value:{ok:boolean;message:string|null})=>void=()=>{};
 const {render,onClose}=harness(()=>({ok:true,message:null,settled:new Promise(resolve=>{settle=resolve;})}));
 render().props.onSubmit({preventDefault(){}});
 expect(text(render())).toContain('Switching once the save finishes');expect(onClose).not.toHaveBeenCalled();
 settle({ok:false,message:'The exact drawing publication source is unavailable.'});await Promise.resolve();await Promise.resolve();
 expect(text(render())).toContain('publication source is unavailable');expect(onClose).not.toHaveBeenCalled();
});
it('a queued switch that succeeds closes the prompt; an immediate one closes at once',async()=>{
 let settle:(value:{ok:boolean;message:string|null})=>void=()=>{};
 const queued=harness(()=>({ok:true,message:null,settled:new Promise(resolve=>{settle=resolve;})}));
 queued.render().props.onSubmit({preventDefault(){}});settle({ok:true,message:null});await Promise.resolve();await Promise.resolve();
 expect(queued.onClose).toHaveBeenCalledOnce();
 const now=harness(()=>({ok:true,message:null}));now.render().props.onSubmit({preventDefault(){}});expect(now.onClose).toHaveBeenCalledOnce();
});
it('App passes the queued result to the prompt, and the Coinbase offer returns focus to the search field',()=>{
 const app=readFileSync('src/ui/App.tsx','utf8');
 expect(app).toContain('if(deferSwitch(dataset.instrument.symbol+\' \'+target,()=>switchers.current.switchInterval(target),settle))return{ok:true,settled};');
 expect(app).toContain('return settled&&result.ok?{...result,settled}:result;');
 const dialog=readFileSync('src/ui/SymbolSearchDialog.tsx','utf8');
 expect(dialog).toMatch(/onEnableCoinbase\?\.\(\);[^]*?inputRef\.current\?\.focus\(\{preventScroll:true\}\)/);
 expect(readFileSync('src/ui/styles.css','utf8')).toContain('.topbar .lv-interval-strip>.interval-badge{display:inline-flex;align-items:center;justify-content:center;gap:3px;min-width:62px;');
});
