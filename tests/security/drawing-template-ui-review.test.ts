import {beforeEach,expect,it,vi} from 'vitest';
import {DrawingManagerDialog} from '../../src/ui/DrawingManagerDialog';
import {DrawingTemplateBatchError} from '../../src/chart/drawing-template-batch';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,writes:0,effects:[] as Array<()=>any>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const n=hooks.cursor++;if(!(n in hooks.cells))hooks.cells[n]=typeof initial==='function'?initial():initial;return[hooks.cells[n],(value:any)=>{hooks.writes++;hooks.cells[n]=typeof value==='function'?value(hooks.cells[n]):value;}];},useRef:(value:any)=>{const n=hooks.cursor++;if(!(n in hooks.cells))hooks.cells[n]={current:value};return hooks.cells[n];},useEffect:(effect:()=>any)=>{const n=hooks.cursor++;if(!(n in hooks.cells)){hooks.cells[n]=true;hooks.effects.push(effect);}}};});
const text=(tree:any):string=>typeof tree==='string'?tree:Array.isArray(tree)?tree.map(text).join(''):tree?.props?text(tree.props.children):'';
function find(tree:any,test:(node:any)=>boolean):any{if(Array.isArray(tree)){for(const child of tree){const found=find(child,test);if(found)return found;}}else if(tree?.props){if(test(tree))return tree;return find(tree.props.children,test);}return null;}
function fixture(){
 let dataset=fixtureDataset('GME',3),source=sourceContextForDataset(dataset),bars=dataset.bars;
 const receipt={accepted:true,changed:true,recoveryRequired:false},prepare=vi.fn(()=>({count:1,changedCount:1})),commit=vi.fn(()=>receipt),failed=vi.fn((_receipt:unknown,cause:unknown)=>{throw new DrawingTemplateBatchError(true,[cause]);});
 const chart:any={getSourceContext:()=>source,getSourceBars:()=>bars,getStyle:()=> 'candles',captureDrawingManagerOwner(){const openingSource=source,openingBars=bars;return()=>{if(source!==openingSource||bars!==openingBars)throw Error('independent manager source changed');};},drawingManager:{list:()=>[{id:'reused-local-id',type:'trendline',renderable:true}],state:()=>({schemaVersion:1,groups:[],templates:[{id:'shared-template',name:'SYNTHETIC style',type:'trendline'}]}),policies:[],select:()=>({unavailableIds:[]}),prepareTemplate:prepare,commitTemplate:commit,failTemplatePublication:failed},drawings:{select(){}},onDrawingsChanged:()=>()=>{}};
 const props:any={chart,ownerToken:{},isCurrent:()=>true,assertOwner(){},onClose:vi.fn(),onChange:vi.fn(()=>true)},render=()=>{hooks.cursor=0;return DrawingManagerDialog(props);},button=(name:string)=>find(render(),n=>n.type==='button'&&text(n)===name);
 const select=()=>{button('Select all').props.onClick();find(render(),n=>n.props['aria-label']==='Drawing template').props.onChange({target:{value:'shared-template'}});};
 return{props,render,button,select,prepare,commit,failed,receipt,changeSource(){dataset=fixtureDataset('SPY',3);source=sourceContextForDataset(dataset);bars=dataset.bars;}};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.writes=0;hooks.effects=[];});
it('a retained Apply cannot freshly prepare against a replacement source with reused local drawing IDs',()=>{
 const ui=fixture();ui.select();const apply=ui.button('Apply to selected').props.onClick;ui.changeSource();apply();expect(ui.prepare).not.toHaveBeenCalled();expect(ui.commit).not.toHaveBeenCalled();expect(ui.props.onChange).not.toHaveBeenCalled();
});
it('rejected workspace capture makes the accepted template action terminal without a duplicate native commit',()=>{
 const ui=fixture();ui.props.onChange.mockReturnValue(false);ui.select();const apply=ui.button('Apply to selected').props.onClick;apply();apply();ui.button('Apply to selected').props.onClick();expect(ui.commit).toHaveBeenCalledTimes(1);expect(ui.failed).toHaveBeenCalledTimes(1);expect(text(ui.render())).toMatch(/accepted|rejected|Reopen/);
});
it('a genuine no-op template receipt skips the workspace publication callback',()=>{
 const ui=fixture();ui.receipt.changed=false;ui.select();ui.button('Apply to selected').props.onClick();expect(ui.commit).toHaveBeenCalledTimes(1);expect(ui.props.onChange).not.toHaveBeenCalled();expect(ui.failed).not.toHaveBeenCalled();
});
it('reentrant parent replacement during accepted publication cannot update or quarantine a newer dialog',()=>{
 const ui=fixture();let atReplacement=0;ui.props.onChange.mockImplementation(()=>{ui.props.ownerToken={};ui.render();atReplacement=hooks.writes;return false;});ui.select();ui.button('Apply to selected').props.onClick();expect(ui.commit).toHaveBeenCalledTimes(1);expect(hooks.writes).toBe(atReplacement);expect(ui.failed).not.toHaveBeenCalled();
});
