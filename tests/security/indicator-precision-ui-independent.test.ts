import {beforeEach,expect,it,vi} from 'vitest';
import {IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {createIndicatorLibrary,factoryIndicatorDefault,type IndicatorLibrary} from '../../src/ui/indicator-library';
import {indicatorInputSchema} from '../../src/chart/indicator-settings';
import type {IndicatorInstanceView} from '../../src/chart/indicator-port';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,writes:0,cleanups:[] as Array<()=>void>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(next:any)=>{hooks.writes++;hooks.cells[index]=typeof next==='function'?next(hooks.cells[index]):next;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>void|(()=>void))=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;const cleanup=effect();if(cleanup)hooks.cleanups.push(cleanup);}}};});
const text=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.writes=0;hooks.cleanups=[];});
function fixture(){
 let active=true,library=createIndicatorLibrary(),row:IndicatorInstanceView={...factoryIndicatorDefault('rsi'),id:'independent-rsi',kind:'rsi',paneId:'oscillator',rendererId:'native-rsi',diagnostics:[],presentationDiagnostics:[],policies:[],series:[],informationBars:2,latestInformationTime:2};
 const apply=vi.fn((next:any)=>{row={...row,...structuredClone(next)};return true;}),save=vi.fn((next:IndicatorLibrary,expected:IndicatorLibrary)=>{expect(expected).toBe(library);library=next;return true;});
 const render=()=>{hooks.cursor=0;return IndicatorSettings({row,chart:{indicators:{list:()=>[row],inputSchema:indicatorInputSchema}} as any,library,getLibrary:()=>library,assertCurrent(){if(!active)throw Error('Independent precision owner retired');},onApply:apply,onMove:()=>true,onLibraryChange:save});};
 const button=(label:string)=>find(render(),node=>node.type==='button'&&text(node)===label),precision=()=>find(render(),node=>node.props['aria-label']==='Decimal precision');button('Style').props.onClick();
 return{render,button,precision,apply,save,get row(){return row;},get library(){return library;},revoke(){active=false;},edit(value:string){precision().props.onChange({target:{value}});},submit(){render().props.onSubmit({preventDefault(){}});}};
}
it('numeric precision draft survives rejected default save and remains distinct from accepted native instance settings',()=>{
 const ui=fixture(),original=structuredClone(ui.row);ui.edit('16');ui.save.mockReturnValueOnce(false);ui.button('Save as default').props.onClick();expect(ui.precision().props.value).toBe('16');expect(ui.row).toEqual(original);expect(ui.library.defaults.rsi).toBeUndefined();expect(ui.apply).not.toHaveBeenCalled();
 ui.button('Save as default').props.onClick();expect(ui.library.defaults.rsi?.presentation?.precision).toBe(16);expect(ui.row).toEqual(original);ui.submit();expect(ui.row.presentation?.precision).toBe(16);expect(ui.row.inputs).toEqual(original.inputs);expect(ui.row.plots).toEqual(original.plots);
});
it('rejected precision Apply retains its exact draft and permits one corrected acceptance without changing saved defaults',()=>{
 const ui=fixture(),original=structuredClone(ui.row);ui.edit('0');ui.apply.mockReturnValueOnce(false);ui.submit();expect(ui.row).toEqual(original);expect(ui.precision().props.value).toBe('0');expect(text(ui.render())).toContain('draft is retained');
 ui.submit();expect(ui.apply).toHaveBeenCalledTimes(2);expect(ui.row.presentation?.precision).toBe(0);expect(ui.library.defaults.rsi).toBeUndefined();
});
it('precision edits invalidate retained default handlers and source retirement blocks late edits without state writes',()=>{
 const ui=fixture();ui.edit('3');const oldSave=ui.button('Save as default').props.onClick;ui.edit('12');oldSave();expect(ui.save).not.toHaveBeenCalled();expect(ui.precision().props.value).toBe('12');
 for(const bad of ['01','+1','-0','1e0','Infinity','０','2\n','2 ']){ui.edit(bad);expect(ui.precision().props.value).toBe('12');}
 const retained=ui.precision().props.onChange;ui.revoke();const writes=hooks.writes;retained({target:{value:'8'}});ui.submit();expect(hooks.writes).toBe(writes);expect(ui.apply).not.toHaveBeenCalled();
});
