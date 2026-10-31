import {beforeEach,expect,it,vi} from 'vitest';
import {IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {createIndicatorLibrary,factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {indicatorInputSchema,indicatorLegacyDefaults} from '../../src/chart/indicator-settings';
import type {IndicatorInstanceView} from '../../src/chart/indicator-port';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,writes:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(value:any)=>{const n=hooks.cursor++;if(!(n in hooks.cells))hooks.cells[n]=typeof value==='function'?value():value;return[hooks.cells[n],(next:any)=>{hooks.writes++;hooks.cells[n]=typeof next==='function'?next(hooks.cells[n]):next;}];},useRef:(value:any)=>{const n=hooks.cursor++;if(!(n in hooks.cells))hooks.cells[n]={current:value};return hooks.cells[n];},useEffect:(effect:()=>unknown)=>{const n=hooks.cursor++;if(!(n in hooks.cells)){hooks.cells[n]=true;effect();}}};});
function find(tree:any,test:(node:any)=>boolean):any{if(Array.isArray(tree)){for(const item of tree){const found=find(item,test);if(found)return found;}}else if(tree?.props){if(test(tree))return tree;return find(tree.props.children,test);}return null;}
const text=(tree:any):string=>typeof tree==='string'?tree:Array.isArray(tree)?tree.map(text).join(''):tree?.props?text(tree.props.children):'';
function fixture(){
 let active=true,row:IndicatorInstanceView={id:'independent-vwap',kind:'vwap',...factoryIndicatorDefault('vwap'),inputs:{...indicatorLegacyDefaults.vwap},rendererId:'native-vwap',paneId:'price',diagnostics:[],presentationDiagnostics:[],policies:[],series:[],informationBars:3,latestInformationTime:3};delete row.presentation;
 const library=createIndicatorLibrary(),apply=vi.fn((patch:any)=>{row={...row,...structuredClone(patch)};return true;}),publish=vi.fn(()=>true);
 const props:any={get row(){return row;},chart:{indicators:{inputSchema:indicatorInputSchema,list:()=>[row]}},library,getLibrary:()=>library,assertCurrent(){if(!active)throw Error('independent retired VWAP owner');},onApply:apply,onMove:()=>true,onLibraryChange:publish};
 const render=()=>{hooks.cursor=0;return IndicatorSettings(props);};
 return{render,apply,publish,retire:()=>{active=false;},field:(name:string)=>find(render(),n=>n.props['aria-label']===name),button:(label:string)=>find(render(),n=>n.type==='button'&&text(n)===label),row:()=>row};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.writes=0;});
it('a deliberate hide-only edit preserves the untouched legacy numerical tuple exactly',()=>{
 const ui=fixture(),legacy=structuredClone(ui.row().inputs);ui.field('Hide VWAP on daily and above').props.onChange({target:{checked:true}});ui.render().props.onSubmit({preventDefault(){}});
 expect(ui.apply).toHaveBeenCalledTimes(1);expect(ui.row().inputs).toEqual(legacy);expect(ui.row().presentation?.hideOnDaily).toBe(true);
});
it('a rejected new tuple remains editable and invalid retained draft handlers cannot publish old fields',()=>{
 const ui=fixture();ui.field('Band 1 enabled').props.onChange({target:{checked:true}});const old=ui.render();ui.field('Band 1 percentage multiplier').props.onChange({target:{value:''}});old.props.onSubmit({preventDefault(){}});ui.render().props.onSubmit({preventDefault(){}});expect(ui.apply).not.toHaveBeenCalled();
 ui.field('Band 1 percentage multiplier').props.onChange({target:{value:'0'}});ui.apply.mockReturnValueOnce(false);ui.render().props.onSubmit({preventDefault(){}});expect(ui.field('Band 1 enabled').props.checked).toBe(true);expect(text(ui.render())).toContain('draft is retained');
 ui.render().props.onSubmit({preventDefault(){}});expect(ui.row().inputs).toMatchObject({bandMode:'Percentage',band1Enabled:true,band1Multiplier:0,band2Enabled:false,band2Multiplier:2,band3Enabled:false,band3Multiplier:3});
});
it('default publication retirement suppresses late status and draft updates for the new VWAP controls',()=>{
 const ui=fixture();ui.field('Band 3 enabled').props.onChange({target:{checked:true}});ui.publish.mockImplementation(()=>{ui.retire();return true;});const button=ui.button('Save as default'),writes=hooks.writes;button.props.onClick();expect(ui.publish).toHaveBeenCalledTimes(1);expect(ui.apply).not.toHaveBeenCalled();expect(hooks.writes).toBe(writes);
});
