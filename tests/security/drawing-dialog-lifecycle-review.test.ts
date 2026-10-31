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
 return{props,chart,update,render,record:()=>record,form:()=>find(render(),n=>n.type==='form'),button:(label:string)=>find(render(),n=>n.type==='button'&&text(n)===label),input:(name:string)=>find(render(),n=>n.type==='input'&&(n.props['data-property']===name||n.props['aria-label']===name))};
}
const submit=(form:any)=>form.props.onSubmit({preventDefault(){},nativeEvent:{isComposing:false}});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.writes=0;});
it('effect replay reactivates the current dialog but never revives an explicit cancellation',()=>{
 const ui=fixture();ui.render();const setup=hooks.effects[0],cleanup=setup();cleanup();setup();ui.input('style.lineColor').props.onChange({target:{value:'#123456'}});submit(ui.form());expect(ui.update).toHaveBeenCalledTimes(1);
 const writes=hooks.writes;setup();submit(ui.form());expect(ui.update).toHaveBeenCalledTimes(1);expect(hooks.writes).toBe(writes);
});
it('Reset invalidates an earlier changed draft and preserves the complete opening style',()=>{
 const ui=fixture(),original=structuredClone(ui.record());ui.input('style.lineColor').props.onChange({target:{value:'#123456'}});const old=ui.form();ui.button('Reset').props.onClick();submit(old);expect(ui.update).not.toHaveBeenCalled();submit(ui.form());expect(ui.record()).toEqual(original);expect(ui.update).toHaveBeenCalledTimes(1);
});
it('blank numeric input remains invalid and editable instead of silently becoming zero',()=>{
 const ui=fixture(),original=structuredClone(ui.record());ui.input('style.lineWidth').props.onChange({target:{value:''}});submit(ui.form());expect(ui.record()).toEqual(original);expect(ui.props.onClose).not.toHaveBeenCalled();expect(text(ui.render())).toMatch(/finite|number|width/i);
 ui.input('style.lineWidth').props.onChange({target:{value:'3'}});submit(ui.form());expect(ui.record().style.lineWidth).toBe(3);expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});
it('explicit rejected capture is a one-shot recovery failure after the native edit',()=>{
 const ui=fixture();ui.props.onChange.mockReturnValue(false);const old=ui.form();submit(old);submit(old);submit(ui.form());expect(ui.update).toHaveBeenCalledTimes(1);expect(ui.props.onChange).toHaveBeenCalledTimes(1);expect(ui.props.onClose).not.toHaveBeenCalled();expect(text(ui.render())).toMatch(/capture was rejected|Reopen/i);ui.button('Cancel').props.onClick();expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});
it('retirement during source validation cannot authorize a subsequent native edit',()=>{
 const ui=fixture();ui.render();const source=ui.chart.getSourceContext();let retired=false;ui.chart.getSourceContext=()=>{if(!retired){retired=true;ui.props.ownerToken={};ui.render();}return source;};submit(ui.form());expect(ui.update).not.toHaveBeenCalled();expect(ui.props.onChange).not.toHaveBeenCalled();expect(ui.props.onClose).not.toHaveBeenCalled();
});
it('failed close after accepted publication permits close retry without repeating mutation',()=>{
 const ui=fixture();ui.props.onClose.mockImplementationOnce(()=>{throw Error('independent close failure');});const old=ui.form();submit(old);expect(text(ui.render())).toContain('independent close failure');submit(old);submit(ui.form());expect(ui.update).toHaveBeenCalledTimes(1);expect(ui.props.onChange).toHaveBeenCalledTimes(1);ui.button('Cancel').props.onClick();expect(ui.props.onClose).toHaveBeenCalledTimes(2);
});

it('Trendline Text enabled Reset and current Apply preserve exact hidden annotation text, alpha and opaque siblings',()=>{
 const ui=fixture();ui.record().text={value:'SYNTHETIC hidden Unicode \u03a9',color:'rgba(30,40,50,0.5019607843137255)',lvAnnotation:{schemaVersion:1,enabled:false},futureText:{opaque:'retained'}} as any;const original=structuredClone(ui.record().text);ui.button('Text').props.onClick();
 ui.input('text.lvAnnotation.enabled').props.onChange({target:{checked:true}});const old=ui.form();ui.button('Reset').props.onClick();submit(old);expect(ui.update).not.toHaveBeenCalled();expect(ui.input('text.lvAnnotation.enabled').props.checked).toBe(false);
 ui.input('text.lvAnnotation.enabled').props.onChange({target:{checked:true}});submit(ui.form());expect(ui.record().text).toEqual({...original,lvAnnotation:{schemaVersion:1,enabled:true}});expect(ui.update.mock.calls[0][1]).toEqual({'text.lvAnnotation.enabled':true});
});
it('cancelled retaining-text toggle cannot be revived by a retained checkbox or Apply callback',()=>{
 const ui=fixture();ui.record().text={value:'SYNTHETIC retained text'} as any;const original=structuredClone(ui.record());ui.button('Text').props.onClick();const toggle=ui.input('text.lvAnnotation.enabled').props.onChange;
 toggle({target:{checked:false}});const old=ui.form();ui.button('Cancel').props.onClick();const writes=hooks.writes;toggle({target:{checked:true}});submit(old);
 expect(ui.record()).toEqual(original);expect(ui.update).not.toHaveBeenCalled();expect(ui.props.onChange).not.toHaveBeenCalled();expect(hooks.writes).toBe(writes);
});
