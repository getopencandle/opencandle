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
function setup(){let active=true,library=createIndicatorLibrary(),row:IndicatorInstanceView={id:'SYNTHETIC independent Volume',kind:'volume',...factoryIndicatorDefault('volume'),rendererId:'native-synthetic',paneId:'pane',diagnostics:[],presentationDiagnostics:[],policies:[],series:[],informationBars:3,latestInformationTime:3};delete row.presentation;
 const apply=vi.fn((patch:any)=>{row={...row,...structuredClone(patch)};return true;}),save=vi.fn((next:IndicatorLibrary)=>{library=next;return true;});
 const render=()=>{hooks.cursor=0;return IndicatorSettings({row,chart:{indicators:{list:()=>[row],inputSchema:indicatorInputSchema}}as any,library,getLibrary:()=>library,assertCurrent(){if(!active)throw Error('Independent owner retired');},onApply:apply,onMove:()=>true,onLibraryChange:save});};
 const button=(label:string)=>find(render(),node=>node.type==='button'&&text(node)===label),field=(label:string)=>find(render(),node=>node.props['aria-label']===label),click=(label:string)=>button(label).props.onClick(),edit=(label:string,value:string)=>field(label).props.onChange({target:{value}}),submit=()=>render().props.onSubmit({preventDefault(){}});
 return{render,button,field,click,edit,submit,apply,save,get row(){return row;},get library(){return library;},retire:()=>{active=false;},replace:(inputs:Record<string,string|number|boolean>)=>{row={...row,inputs};}};
}

it('a successful future-default receipt cannot authorize overwriting a reentrantly changed MA instance',()=>{
 const ui=setup();ui.edit('Volume MA type','WMA');ui.save.mockImplementationOnce(next=>{ui.replace({length:5,maType:'EMA'});return true;});
 ui.click('Save as default');expect(ui.row.inputs).toEqual({length:5,maType:'EMA'});ui.submit();expect(ui.apply).not.toHaveBeenCalled();expect(ui.row.inputs).toEqual({length:5,maType:'EMA'});
});

it('Volume MA and its independent presentation controls survive cross-tab staging without materializing an untouched fallback',()=>{
 const ui=setup();ui.click('Style');ui.edit('Decimal precision','3');ui.click('Inputs');ui.edit('Volume coloring','previous-close');ui.submit();expect(ui.row.inputs).toEqual({length:20});
 ui.edit('Volume MA type','EMA');ui.click('Style');ui.edit('ma opacity','37');ui.click('Visibility');ui.edit('Indicator interval visibility','exclude');ui.edit('Indicator exact intervals','1D');ui.click('Inputs');expect(ui.field('Volume MA type').props.value).toBe('EMA');ui.submit();
 expect(ui.row.inputs).toEqual({length:20,maType:'EMA'});expect(ui.row.presentation).toMatchObject({precision:3,volumePalette:{mode:'previous-close'},visibility:{mode:'exclude',intervals:['1D']}});expect(ui.row.plots.ma.opacity).toBe(37);
});

it('a successful save-default that retires its parent makes zero post-callback state writes',()=>{
 const ui=setup();ui.edit('Volume MA type','EMA');ui.save.mockImplementationOnce(()=>{ui.retire();return true;});const before=hooks.writes;ui.click('Save as default');expect(hooks.writes).toBe(before);expect(ui.apply).not.toHaveBeenCalled();expect(ui.row.inputs).toEqual({length:20});
});
