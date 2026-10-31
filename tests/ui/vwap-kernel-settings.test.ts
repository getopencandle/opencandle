import {beforeEach,expect,it,vi} from 'vitest';
import {IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {createIndicatorLibrary,factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {indicatorInputSchema} from '../../src/chart/indicator-settings';
import type {IndicatorInstanceView} from '../../src/chart/indicator-port';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(value:any)=>{const n=hooks.cursor++;if(!(n in hooks.cells))hooks.cells[n]=typeof value==='function'?value():value;return[hooks.cells[n],(next:any)=>{hooks.cells[n]=typeof next==='function'?next(hooks.cells[n]):next;}];},useRef:(value:any)=>{const n=hooks.cursor++;if(!(n in hooks.cells))hooks.cells[n]={current:value};return hooks.cells[n];},useEffect:(effect:()=>unknown)=>{const n=hooks.cursor++;if(!(n in hooks.cells)){hooks.cells[n]=true;effect();}}};});
function find(tree:any,predicate:(node:any)=>boolean):any{if(Array.isArray(tree)){for(const item of tree){const found=find(item,predicate);if(found)return found;}}else if(tree?.props){if(predicate(tree))return tree;return find(tree.props.children,predicate);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
function setup(){let row:IndicatorInstanceView={id:'synthetic-vwap',kind:'vwap',...factoryIndicatorDefault('vwap'),rendererId:'synthetic-native',paneId:'price',diagnostics:[],presentationDiagnostics:[],policies:[],series:[],informationBars:2,latestInformationTime:1700000060};const apply=vi.fn((patch:any)=>{row={...row,...structuredClone(patch)};return true;}),library=createIndicatorLibrary();
 const render=()=>{hooks.cursor=0;return IndicatorSettings({row,chart:{indicators:{inputSchema:indicatorInputSchema,list:()=>[row]}} as any,library,getLibrary:()=>library,assertCurrent(){},onApply:apply,onMove:()=>true,onLibraryChange:()=>true});};
 const field=()=>find(render(),node=>node.type==='select'&&Array.isArray(node.props.children)&&node.props.children.map((child:any)=>child.props?.value).join(',')==='1,2');
 return{render,field,apply,row:()=>row,edit:(value:string)=>field().props.onChange({target:{value}}),submit:()=>render().props.onSubmit({preventDefault(){}})};
}
it('the actual calculation selector submits version2 as a numeric setting',()=>{
 const ui=setup();ui.edit('2');ui.submit();expect(ui.apply).toHaveBeenCalledTimes(1);expect(ui.row().inputs.kernelVersion).toBe(2);expect(typeof ui.row().inputs.kernelVersion).toBe('number');
});
it('untouched method fallback preserves omitted legacy storage and switching back explicitly records1',()=>{
 const ui=setup();expect(ui.row().inputs).not.toHaveProperty('kernelVersion');ui.submit();expect(ui.row().inputs).not.toHaveProperty('kernelVersion');ui.edit('2');ui.submit();ui.edit('1');ui.submit();expect(ui.row().inputs.kernelVersion).toBe(1);
});
it('invalid numeric method cannot apply while a valid retained draft can recover',()=>{
 const ui=setup();ui.edit('3');ui.submit();expect(ui.apply).not.toHaveBeenCalled();ui.edit('2');ui.submit();expect(ui.row().inputs.kernelVersion).toBe(2);
});
