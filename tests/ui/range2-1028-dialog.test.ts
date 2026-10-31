import {beforeEach,describe,expect,it,vi} from 'vitest';
import {IntervalDialog} from '../../src/ui/IntervalDialog';
import {createIntervalMenuState} from '../../src/domain/intervals';
import {fixtureDataset} from '../../src/domain/fixtures';

// The ACTUAL IntervalDialog handlers, called as a function with recorded hook cells (no DOM, focus or GUI claim).
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useMemo:(make:()=>unknown)=>make()};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
const render=(props:Record<string,unknown>)=>{hooks.cursor=0;return (IntervalDialog as any)(props);};
function find(node:any,test:(props:any)=>boolean):any{
 if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const child of node){const hit=find(child,test);if(hit)return hit;}return null;}
 if(node.props&&test(node.props))return node;return find(node.props?.children,test);
}
const text=(node:any):string=>node==null||typeof node==='boolean'?'':typeof node!=='object'?String(node):Array.isArray(node)?node.map(text).join(''):text(node.props?.children);

describe('RANGE2-1028 Advanced interval dialog handlers',()=>{
 const current=fixtureDataset('GME',10);
 it('a typed 250R is selected, previewed and applied as the Range size with the menu draft',()=>{
  const calls:unknown[][]=[];let closed=0,applied=0;
  const props={current,datasets:[current],state:createIntervalMenuState(),onApply:()=>{applied++;},onClose:()=>{closed++;},onRangeInterval:(size:number,state:unknown)=>{calls.push([size,state]);return true;},rangeActive:false,rangeSize:100};
  let tree=render(props);
  find(tree,p=>p['aria-label']==='Favorite 10R').props.onClick();tree=render(props);
  find(tree,p=>p['aria-label']==='Custom interval').props.onChange({target:{value:'250R'}});tree=render(props);
  find(tree,p=>typeof p.onSubmit==='function').props.onSubmit({preventDefault(){}});tree=render(props);
  expect(text(find(tree,p=>p.role==='status'))).toContain('Range chart: 250 ranges (250R)');
  expect(find(tree,p=>p['aria-pressed']===true&&text(p.children)==='250 ranges')).toBeTruthy();
  const apply=find(tree,p=>text(p.children)==='Apply'&&typeof p.onClick==='function');expect(apply.props.disabled).toBe(false);apply.props.onClick();
  expect(calls).toHaveLength(1);expect(calls[0][0]).toBe(250);expect((calls[0][1] as any).favorites).toEqual(['10R']);expect(closed).toBe(1);expect(applied).toBe(0);
 });
 it('a rejected range keeps the dialog open with a message; a bad typed size is refused before Apply',()=>{
  let closed=0;const props={current,datasets:[current],state:createIntervalMenuState(),onApply:()=>{},onClose:()=>{closed++;},onRangeInterval:()=>false,rangeActive:true,rangeSize:100};
  let tree=render(props);
  find(tree,p=>text(p.children)==='Apply'&&typeof p.onClick==='function').props.onClick();tree=render(props);
  expect(closed).toBe(0);expect(text(find(tree,p=>p.role==='alert'))).toContain('The range interval was rejected');
  find(tree,p=>p['aria-label']==='Custom interval').props.onChange({target:{value:'0R'}});tree=render(props);
  find(tree,p=>typeof p.onSubmit==='function').props.onSubmit({preventDefault(){}});tree=render(props);
  expect(text(find(tree,p=>p.role==='alert'))).toContain('A range interval is a whole number');
 });
});
