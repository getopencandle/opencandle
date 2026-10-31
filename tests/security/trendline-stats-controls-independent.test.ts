import {beforeEach,expect,it,vi} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {DrawingDialog} from '../../src/ui/DrawingDialog';
import {drawingEditor,patchDrawingEdit} from '../../src/chart/drawing-port';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>any>,writes:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const n=hooks.cursor++;if(!(n in hooks.cells))hooks.cells[n]=typeof initial==='function'?initial():initial;return[hooks.cells[n],(value:any)=>{hooks.writes++;hooks.cells[n]=typeof value==='function'?value(hooks.cells[n]):value;}];},useRef:(value:any)=>{const n=hooks.cursor++;if(!(n in hooks.cells))hooks.cells[n]={current:value};return hooks.cells[n];},useEffect:(effect:()=>any)=>{const n=hooks.cursor++;if(!(n in hooks.cells)){hooks.cells[n]=true;hooks.effects.push(effect);}}};});
const text=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,test);if(result)return result;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function fixture(){
 const dataset=fixtureDataset('GME',4),bars=dataset.bars,source=sourceContextForDataset(dataset);let record=createDrawing('trendline',{id:'independent-line',paneId:'price',anchors:[{time:bars[0].time*1000,price:100},{time:bars[2].time*1000,price:120}]})!.serialize();
 const update=vi.fn((_id:string,properties:any,coordinates:any,offset:any)=>{record=patchDrawingEdit(record,bars,properties,coordinates,offset);return{accepted:true};});
 const chart={getDrawingEditor:()=>({...drawingEditor(record,bars),recordFingerprint:JSON.stringify(record)}),getSourceBars:()=>bars,getSourceContext:()=>source,updateDrawingEdit:update};
 const props:any={chart,id:record.id,ownerToken:{},isCurrent:()=>true,onClose:vi.fn(),onChange:vi.fn(),assertOwner:vi.fn()};
 const render=()=>{hooks.cursor=0;return DrawingDialog(props);};
 return{props,chart,update,render,record:()=>record,form:()=>find(render(),n=>n.type==='form'),button:(label:string)=>find(render(),n=>n.type==='button'&&text(n)===label),input:(name:string)=>find(render(),n=>n.props['data-property']===name||n.type==='input'&&n.props['aria-label']===name)};
}
const submit=(form:any)=>form.props.onSubmit({preventDefault(){},nativeEvent:{isComposing:false}});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.writes=0;});

const prefix='props.lvTrendlineStats.';
it('a retained same-render stats toggle cannot overwrite a newer draft revision',()=>{
 const ui=fixture();ui.record().props={future:{retain:['SYNTHETIC',null]}};
 const oldPercent=ui.input(prefix+'percentChange').props.onChange;
 ui.input(prefix+'priceRange').props.onChange({target:{checked:true}});
 const writes=hooks.writes;oldPercent({target:{checked:true}});expect(hooks.writes).toBe(writes);
 expect(ui.input(prefix+'priceRange').props.checked).toBe(true);expect(ui.input(prefix+'percentChange').props.checked).toBe(false);
 ui.input(prefix+'percentChange').props.onChange({target:{checked:true}});submit(ui.form());
 expect(ui.record().props).toEqual({future:{retain:['SYNTHETIC',null]},lvTrendlineStats:{schemaVersion:1,priceRange:true,percentChange:true,barsRange:false,dateTimeRange:false,alwaysShow:false,position:'right'}});
 expect(ui.update).toHaveBeenCalledTimes(1);
});
it('an on-off statistics draft is a legacy no-op and skips workspace capture',()=>{
 const ui=fixture(),before=structuredClone(ui.record());
 ui.update.mockImplementation((_id,properties,coordinates,offset)=>{const next=patchDrawingEdit(ui.record(),ui.chart.getSourceBars(),properties,coordinates,offset);expect(next).toBe(ui.record());return{accepted:true,changed:false} as any;});
 ui.input(prefix+'alwaysShow').props.onChange({target:{checked:true}});ui.input(prefix+'alwaysShow').props.onChange({target:{checked:false}});submit(ui.form());
 expect(ui.update.mock.calls[0][1]).toEqual({});expect(ui.record()).toEqual(before);expect(ui.props.onChange).not.toHaveBeenCalled();expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});
it('accepted stats capture reopening a dialog cannot close or overwrite the new session',()=>{
 const ui=fixture();ui.input(prefix+'barsRange').props.onChange({target:{checked:true}});
 ui.props.onChange.mockImplementationOnce(()=>{ui.props.ownerToken={};ui.render();});submit(ui.form());
 expect(ui.update).toHaveBeenCalledTimes(1);expect(ui.props.onClose).not.toHaveBeenCalled();expect(ui.input(prefix+'barsRange').props.checked).toBe(true);
 ui.input(prefix+'position').props.onChange({target:{value:'below'}});submit(ui.form());
 expect(ui.update).toHaveBeenCalledTimes(2);expect(ui.record().props?.lvTrendlineStats).toMatchObject({position:'below'});expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});
it('a same-ID canonical statistics replacement blocks an older changed draft',()=>{
 const ui=fixture();ui.input(prefix+'priceRange').props.onChange({target:{checked:true}});const old=ui.form();
 ui.record().props={lvTrendlineStats:{schemaVersion:9,position:'SYNTHETIC opaque replacement'}};
 const replacement=structuredClone(ui.record());submit(old);
 expect(ui.update).not.toHaveBeenCalled();expect(ui.record()).toEqual(replacement);expect(ui.props.onChange).not.toHaveBeenCalled();expect(text(ui.render())).toMatch(/changed while settings were open/);
});
it('rejected workspace capture leaves the accepted statistics terminal and Cancel available',()=>{
 const ui=fixture();ui.input(prefix+'dateTimeRange').props.onChange({target:{checked:true}});ui.props.onChange.mockReturnValue(false);
 const old=ui.form();submit(old);const accepted=structuredClone(ui.record());const writes=hooks.writes;
 ui.input(prefix+'dateTimeRange').props.onChange({target:{checked:false}});submit(old);submit(ui.form());
 expect(ui.record()).toEqual(accepted);expect(ui.update).toHaveBeenCalledTimes(1);expect(ui.props.onChange).toHaveBeenCalledTimes(1);expect(hooks.writes).toBe(writes);expect(text(ui.render())).toMatch(/capture was rejected/);
 ui.button('Cancel').props.onClick();expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});
