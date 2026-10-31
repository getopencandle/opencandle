import {beforeEach,expect,it,vi} from 'vitest';
import {IndicatorDialog} from '../../src/ui/IndicatorDialog';
import {ComparisonDialog} from '../../src/ui/ComparisonDialog';
import {createIndicatorLibrary} from '../../src/ui/indicator-library';
import {fixtureDataset} from '../../src/domain/fixtures';
const hooks=vi.hoisted(()=>({cells:[] as unknown[],cursor:0,writes:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<typeof import('react')>('react');return{...actual,useState:(initial:unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?(initial as ()=>unknown)():initial;return[hooks.cells[index],(next:unknown)=>{hooks.writes++;hooks.cells[index]=typeof next==='function'?(next as (prior:unknown)=>unknown)(hooks.cells[index]):next;}];},useRef:(initial:unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:()=>{hooks.cursor++;}};});
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.writes=0;});
function fixture(kind:'indicator'|'comparison'){
 let owned=true;const add=vi.fn(()=> 'independent-one'),changed=vi.fn<()=>boolean|void>(()=>true),dataset=fixtureDataset('GME',1),chart={indicators:{catalog:['sma'],list:()=>[],add,subscribe:()=>()=>{}},comparisons:{list:()=>[],add,subscribe:()=>()=>{}}};
 const props:any={chart,instances:[],library:createIndicatorLibrary(),onLibraryChange:()=>true,onClose:vi.fn(),onChange:changed,datasets:[dataset],ownerToken:{},assertOwner(){if(!owned)throw Error('Independent parent authority retired');}};
 const render=()=>{hooks.cursor=0;return kind==='indicator'?IndicatorDialog(props):ComparisonDialog(props);};
 const button=find(render(),node=>node.type==='button'&&(kind==='indicator'?node.props['aria-label']==='Add Simple Moving Average':text(node).includes('GME')));
 return{add,changed,render,button,revoke(){owned=false;},writes:()=>hooks.writes};
}
it.each(['indicator','comparison'] as const)('%s native success cannot publish through a parent retired before the component rerenders',kind=>{
 const h=fixture(kind);h.add.mockImplementation(()=>{h.revoke();return 'accepted-one';});h.button.props.onClick();expect(h.add).toHaveBeenCalledTimes(1);expect(h.changed).not.toHaveBeenCalled();expect(h.writes()).toBe(0);
});
it.each(['indicator','comparison'] as const)('%s native failure after parent retirement cannot write an old error into a replacement session',kind=>{
 const h=fixture(kind);h.add.mockImplementation(()=>{h.revoke();throw Error('Independent old native action failure');});h.button.props.onClick();expect(h.changed).not.toHaveBeenCalled();expect(h.writes()).toBe(0);
});
it.each(['indicator','comparison'] as const)('%s rejected post-publication callback cannot write error or terminal state after reentrant parent retirement',kind=>{
 const h=fixture(kind);let beforeRetirement=-1;h.changed.mockImplementation(()=>{beforeRetirement=h.writes();h.revoke();return false;});h.button.props.onClick();expect(h.changed).toHaveBeenCalledTimes(1);expect(h.writes()).toBe(beforeRetirement);
});
