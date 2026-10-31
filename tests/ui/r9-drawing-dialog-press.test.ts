import {beforeEach,expect,it,vi} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {DrawingDialog} from '../../src/ui/DrawingDialog';
import {drawingEditor,patchDrawingEdit} from '../../src/chart/drawing-port';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';

// Regression (the drawing settings dialog opened from the selection bar could not
// be used. The pinned renderer's selection popup listens for pointerdown on the document (bubble phase, the same
// listener documented in src/ui/drawing-edit-bar.tsx) and clears the drawing selection on any press
// outside its chrome. App renders the dialog only while a drawing is selected, so a press on Cancel or Apply unmounted
// the dialog before the click arrived. Model of the browser event path, no DOM: a press bubbles from the control through
// its ancestors' onPointerDown handlers to the document listener, and the click reaches the control only if the dialog
// is still rendered. SYNTHETIC; not executable UI evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:()=>{hooks.cursor++;}};});
const text=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
/** The element path from the root to the first node matching the predicate (root first). */
function pathTo(node:any,predicate:(node:any)=>boolean):any[]|null{
 if(Array.isArray(node)){for(const child of node){const found=pathTo(child,predicate);if(found)return found;}return null;}
 if(!node?.props)return null;if(predicate(node))return [node];
 const below=pathTo(node.props.children,predicate);return below?[node,...below]:null;
}
function fixture(){
 const dataset=fixtureDataset('GME',4),bars=dataset.bars,source=sourceContextForDataset(dataset);
 let record=createDrawing('hline',{id:'line',paneId:'price',anchors:[{time:bars[0].time*1000,price:100}]})!.serialize();
 const update=vi.fn((_id:string,patch:any,coordinates:any,offset:any)=>{record=patchDrawingEdit(record,bars,patch,coordinates,offset);return{accepted:true};});
 const chart={getDrawingEditor:()=>({...drawingEditor(record,bars),recordFingerprint:JSON.stringify(record),sourceResolution:dataset.resolution}),getSourceBars:()=>bars,getSourceContext:()=>source,updateDrawingEdit:update};
 // App.tsx: {dialog==='drawing'&&chart&&selectedDrawing&&<DrawingDialog .../>}. The document listener models the renderer popup.
 const app={selected:'line' as string|null,documentPressCount:0};
 const props:any={chart,id:'line',ownerToken:{},isCurrent:()=>app.selected!==null,onClose:vi.fn(),onChange:vi.fn(()=>true),assertOwner:vi.fn()};
 const render=()=>{hooks.cursor=0;return app.selected?DrawingDialog(props):null;};
 const isButton=(label:string)=>(node:any)=>node.type==='button'&&text(node)===label;
 /** pointerdown on the control (bubbling to the document unless stopped), then the click if the control is still rendered. */
 function pressAndClick(label:string){
  const path=pathTo(render(),isButton(label));if(!path)throw Error('Missing control '+label);
  let stopped=false;const event={stopPropagation:()=>{stopped=true;},preventDefault:()=>{}};
  for(const node of [...path].reverse()){node.props.onPointerDown?.(event);if(stopped)break;}
  if(!stopped){app.documentPressCount++;app.selected=null;}
  const after=pathTo(render(),isButton(label));if(!after)return false;
  const target=after.at(-1);
  if(target.props.type==='submit'){const form=after.find((node:any)=>node.type==='form');form.props.onSubmit({preventDefault(){},nativeEvent:{isComposing:false}});}
  else target.props.onClick();
  return true;
 }
 return{props,app,update,render,pressAndClick};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});

it('a press on Cancel stays inside the dialog: the selection survives, the click lands and the dialog closes through onClose',()=>{
 const ui=fixture();
 expect(ui.pressAndClick('Cancel')).toBe(true);
 expect(ui.app.documentPressCount).toBe(0);expect(ui.app.selected).toBe('line');
 expect(ui.props.onClose).toHaveBeenCalledTimes(1);expect(ui.update).not.toHaveBeenCalled();
});
it('a press on Apply stays inside the dialog: the click submits, the edit is applied once and the dialog closes',()=>{
 const ui=fixture();
 expect(ui.pressAndClick('Apply')).toBe(true);
 expect(ui.app.documentPressCount).toBe(0);expect(ui.app.selected).toBe('line');
 expect(ui.update).toHaveBeenCalledTimes(1);expect(ui.props.onChange).toHaveBeenCalledTimes(1);expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});
it('presses on other dialog controls and on the Modal header stay inside the dialog too',()=>{
 const ui=fixture();
 for(const label of ['Reset','Style','Coordinates']){expect(ui.pressAndClick(label),label).toBe(true);expect(ui.app.selected,label).toBe('line');}
 expect(ui.app.documentPressCount).toBe(0);expect(ui.props.onClose).not.toHaveBeenCalled();
 // The Modal header (title and Close button) is rendered inside the Modal component, below the root that stops the press.
 const root=ui.render() as any;let stopped=false;root.props.onPointerDown?.({stopPropagation:()=>{stopped=true;}});expect(stopped).toBe(true);
});
it('the stop does not cancel the default action (focus and text selection inside the dialog still work)',()=>{
 const ui=fixture(),root=ui.render() as any,event={stopPropagation:vi.fn(),preventDefault:vi.fn()};
 root.props.onPointerDown(event);expect(event.stopPropagation).toHaveBeenCalledOnce();expect(event.preventDefault).not.toHaveBeenCalled();
});
