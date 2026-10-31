import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {createIndicatorLibrary,factoryIndicatorDefault,type IndicatorLibrary} from '../../src/ui/indicator-library';
import {indicatorInputSchema,VOLUME_NEW_INSTANCE_PALETTE} from '../../src/chart/indicator-settings';
import type {IndicatorInstanceView} from '../../src/chart/indicator-port';

const hooks=vi.hoisted(()=>({cells:[]as any[],cursor:0,cleanup:[]as (()=>void)[],writes:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.writes++;hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:(effect:()=>void|(()=>void))=>{const i=hooks.cursor++;if(!(i in hooks.cells)){hooks.cells[i]=true;const cleanup=effect();if(cleanup)hooks.cleanup.push(cleanup);}}};});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(node:any,predicate:(value:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.cleanup=[];hooks.writes=0;});afterEach(()=>{for(const cleanup of hooks.cleanup.reverse())cleanup();});
function setup(){let active=true,library=createIndicatorLibrary(),row:IndicatorInstanceView={id:'SYNTHETIC independent Volume',kind:'volume',...factoryIndicatorDefault('volume'),rendererId:'native-synthetic',paneId:'pane',diagnostics:[],presentationDiagnostics:[],policies:[],series:[],informationBars:3,latestInformationTime:3};delete row.presentation;
 const apply=vi.fn((patch:any)=>{row={...row,...structuredClone(patch)};return true;}),save=vi.fn((next:IndicatorLibrary)=>{library=next;return true;});
 const render=()=>{hooks.cursor=0;return IndicatorSettings({row,chart:{indicators:{list:()=>[row],inputSchema:indicatorInputSchema}}as any,library,getLibrary:()=>library,assertCurrent(){if(!active)throw Error('Independent owner retired');},onApply:apply,onMove:()=>true,onLibraryChange:save});};
 const button=(label:string)=>find(render(),node=>node.type==='button'&&text(node)===label),field=(label:string)=>find(render(),node=>node.props['aria-label']===label),click=(label:string)=>button(label).props.onClick(),edit=(label:string,value:string)=>field(label).props.onChange({target:{value}}),submit=()=>render().props.onSubmit({preventDefault(){}});
 return{render,button,field,click,edit,submit,apply,save,get row(){return row;},get library(){return library;},retire:()=>{active=false;}};
}

it('two same-render directional color callbacks cannot overwrite each other before a rerender',()=>{
 const ui=setup();ui.edit('Volume coloring','previous-close');ui.click('Style');const up=ui.field('Volume up color').props.onChange,down=ui.field('Volume down color').props.onChange;
 up({target:{value:'#012345'}});const writes=hooks.writes;down({target:{value:'#543210'}});expect(hooks.writes).toBe(writes);
 expect(ui.field('Volume up color').props.value).toBe('#012345');expect(ui.field('Volume down color').props.value).toBe('#ef5350');ui.submit();expect(ui.row.presentation?.volumePalette).toEqual({schemaVersion:1,mode:'previous-close',upColor:'#012345',downColor:'#ef5350'});
});

it('a retained directional color callback cannot materialize a removed factory tuple',()=>{
 const ui=setup();ui.edit('Volume coloring','open-close');ui.click('Style');const retained=ui.field('Volume down color').props.onChange;ui.click('Reset draft to factory');const writes=hooks.writes;retained({target:{value:'#123456'}});expect(hooks.writes).toBe(writes);
 // 0.8.1: factory reset restores the factory direction palette (VOLUME_NEW_INSTANCE_PALETTE); the retained callback's #123456 never lands.
 ui.submit();expect(ui.row.presentation?.volumePalette).toEqual(VOLUME_NEW_INSTANCE_PALETTE);expect(ui.row.inputs.length).toBe(20);
});

it('a rejected save-default that closes the parent cannot publish status, apply or lose the retained mode',()=>{
 const ui=setup();ui.edit('Volume coloring','previous-close');ui.click('Style');ui.edit('Volume down color','#123abc');const save=ui.button('Save as default').props.onClick;
 ui.save.mockImplementationOnce(()=>{ui.retire();return false;});const writes=hooks.writes;save();expect(hooks.writes).toBe(writes);expect(ui.apply).not.toHaveBeenCalled();expect(ui.library.defaults.volume).toBeUndefined();expect(ui.row.presentation).toBeUndefined();
});

it('an area correction to uniform keeps dormant bad colors invalid until deliberate correction',()=>{
 const ui=setup();ui.edit('Volume coloring','previous-close');ui.click('Style');ui.edit('Volume up color','invalid raw color');ui.edit('volume plot type','area');ui.click('Inputs');ui.edit('Volume coloring','uniform');ui.submit();ui.click('Save as default');expect(ui.apply).not.toHaveBeenCalled();expect(ui.save).not.toHaveBeenCalled();
 ui.click('Style');expect(ui.field('volume color').props.disabled).toBe(false);ui.click('Discard draft and reload');ui.submit();expect(ui.row.presentation).toBeUndefined();
});
