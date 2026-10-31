import {beforeEach,expect,it,vi} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {DrawingDialog} from '../../src/ui/DrawingDialog';
import {drawingEditor,patchDrawingEdit} from '../../src/chart/drawing-port';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
// Remove template in the drawing settings dialog's Template menu (; the drawing Template menu is a
// the recorded facts, visual-drawing-dialogs#unknowns). Actual DrawingDialog handlers, deterministic hook mock, SYNTHETIC rows.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>,writes:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.writes++;hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{const index=hooks.cursor++;if(!(index in hooks.cells)){hooks.cells[index]=true;hooks.effects.push(effect);}}};});
const text=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function findAll(node:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>findAll(child,predicate,out));else if(node?.props){if(predicate(node))out.push(node);findAll(node.props.children,predicate,out);}return out;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.writes=0;});
function fixture(){
 const dataset=fixtureDataset('GME',4),bars=dataset.bars,source=sourceContextForDataset(dataset);
 let record=createDrawing('trendline',{id:'line',paneId:'price',anchors:[{time:bars[0].time*1000,price:100},{time:bars[2].time*1000,price:120}]})!.serialize();
 let templates=[{id:'t1',name:'SYNTHETIC blue',type:'trendline',properties:{}},{id:'t2',name:'SYNTHETIC box',type:'box',properties:{}}];
 const removeTemplate=vi.fn((id:string)=>{templates=templates.filter(row=>row.id!==id);});
 const chart={getDrawingEditor:()=>({...drawingEditor(record,bars),recordFingerprint:JSON.stringify(record),sourceResolution:dataset.resolution}),getSourceBars:()=>bars,getSourceContext:()=>source,
  updateDrawingEdit:vi.fn((id:string,patch:any,coordinates:any,offset:any)=>{record=patchDrawingEdit(record,bars,patch,coordinates,offset);return{accepted:true};}),
  drawingManager:{state:()=>({groups:[],templates}),removeTemplate}};
 const props:any={chart,id:'line',ownerToken:{},isCurrent:()=>true,onClose:vi.fn(),onChange:vi.fn(),assertOwner:vi.fn()};
 const render=()=>{hooks.cursor=0;return DrawingDialog(props);};
 const select=()=>findAll(render(),node=>node.type==='select'&&node.props['aria-label']==='Template')[0];
 return{props,render,select,removeTemplate};
}
it('the Template menu lists Remove for each template of this tool; choosing it removes the template once and captures',()=>{
 const ui=fixture(),group=findAll(ui.select(),node=>node.type==='optgroup')[0];
 expect(group.props.label).toBe('Remove template');
 expect(findAll(group,node=>node.type==='option').map(node=>[node.props.value,text(node)])).toEqual([['__remove:t1','Remove SYNTHETIC blue']]);
 ui.select().props.onChange({target:{value:'__remove:t1'}});
 expect(ui.removeTemplate).toHaveBeenCalledWith('t1');expect(ui.props.onChange).toHaveBeenCalledTimes(1);
 expect(findAll(ui.select(),node=>node.type==='optgroup')).toEqual([]);// no template of this tool is left
});
