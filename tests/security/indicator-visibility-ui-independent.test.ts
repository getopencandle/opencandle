import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {createIndicatorLibrary,factoryIndicatorDefault,type IndicatorLibrary} from '../../src/ui/indicator-library';
import {indicatorInputSchema} from '../../src/chart/indicator-settings';
import type {IndicatorInstanceView} from '../../src/chart/indicator-port';

const hooks=vi.hoisted(()=>({cells:[]as any[],cursor:0,cleanup:[]as (()=>void)[],writes:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.writes++;hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:(effect:()=>void|(()=>void))=>{const i=hooks.cursor++;if(!(i in hooks.cells)){hooks.cells[i]=true;const cleanup=effect();if(cleanup)hooks.cleanup.push(cleanup);}}};});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(node:any,predicate:(value:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanup=[];hooks.writes=0;});afterEach(()=>{for(const cleanup of hooks.cleanup.reverse())cleanup();});
function setup(){let active=true,library=createIndicatorLibrary(),row:IndicatorInstanceView={id:'SYNTHETIC visibility',kind:'rsi',...factoryIndicatorDefault('rsi'),rendererId:'native-synthetic',paneId:'pane',diagnostics:[],presentationDiagnostics:[],policies:[],series:[],informationBars:3,latestInformationTime:3};delete row.presentation;
 const apply=vi.fn((patch:any)=>{row={...row,...structuredClone(patch)};return true;}),save=vi.fn((next:IndicatorLibrary)=>{library=next;return true;});
 const render=()=>{hooks.cursor=0;return IndicatorSettings({row,chart:{indicators:{list:()=>[row],inputSchema:indicatorInputSchema}}as any,library,getLibrary:()=>library,assertCurrent(){if(!active)throw Error('Independent owner retired');},onApply:apply,onMove:()=>true,onLibraryChange:save});};
 const button=(label:string)=>find(render(),node=>node.type==='button'&&text(node)===label),field=(label:string)=>find(render(),node=>node.props['aria-label']===label),click=(label:string)=>button(label).props.onClick(),edit=(label:string,value:string)=>field(label).props.onChange({target:{value}}),submit=()=>render().props.onSubmit({preventDefault(){}});
 return{render,button,field,click,edit,submit,apply,save,get row(){return row;},get library(){return library;},retire:()=>{active=false;}};
}

it('an invalid retained All-mode range cannot be discarded by editing unrelated Inputs or saving defaults',()=>{
 const ui=setup();ui.click('Visibility');ui.edit('Indicator exact intervals','1h');ui.click('Add interval range');ui.edit('Interval range 1 min','');
 ui.click('Inputs');ui.edit('Length','7');ui.submit();ui.click('Save as default');expect(ui.apply).not.toHaveBeenCalled();expect(ui.save).not.toHaveBeenCalled();
 ui.click('Visibility');expect(ui.field('Interval range 1 min').props.value).toBe('');expect(ui.field('Indicator exact intervals').props.value).toBe('1h');
 ui.click('Discard draft and reload');expect(ui.field('Indicator exact intervals').props.value).toBe('');ui.click('Inputs');expect(ui.field('Length').props.value).toBe('14');expect(ui.row.presentation).toBeUndefined();
});

it('retained index-based range handlers cannot alter the shifted remaining range',()=>{
 const ui=setup();ui.click('Visibility');ui.click('Add interval range');ui.click('Add interval range');const retained=ui.field('Interval range 2 min').props.onChange;
 ui.click('Remove interval range 1');const writes=hooks.writes;retained({target:{value:'9'}});expect(hooks.writes).toBe(writes);
 expect(ui.field('Interval range 1 unit').props.value).toBe('second');expect(ui.field('Interval range 1 min').props.value).toBe(1);ui.submit();expect(ui.row.presentation?.visibility?.ranges).toEqual([{unit:'second',min:1,max:1}]);
});

it('a rejected default publication that retires the parent cannot write status into its replacement',()=>{
 const ui=setup();ui.click('Visibility');ui.edit('Indicator interval visibility','exclude');ui.edit('Indicator exact intervals','1D,1W');
 const save=ui.button('Save as default').props.onClick;ui.save.mockImplementationOnce(()=>{ui.retire();return false;});const writes=hooks.writes;save();
 expect(ui.save).toHaveBeenCalledOnce();expect(ui.apply).not.toHaveBeenCalled();expect(ui.library.defaults.rsi).toBeUndefined();expect(ui.row.presentation).toBeUndefined();expect(hooks.writes).toBe(writes);
});
