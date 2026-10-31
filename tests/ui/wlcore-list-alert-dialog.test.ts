import {beforeEach,expect,it,vi} from 'vitest';
import {ListAlertDialog} from '../../src/ui/ListAlertDialog';
import {ListAlertsGroup} from '../../src/ui/ListAlertsGroup';
import {Modal} from '../../src/ui/Modal';
import {fixtureDataset} from '../../src/domain/fixtures';
import {addWatchList,createWatchBook,referenceFromDataset} from '../../src/watchlists/model';
import {addWatchMembers} from '../../src/watchlists/membership';
import {createListAlert,evaluateListAlerts,type ListAlert} from '../../src/domain/watchlist-alerts';

// Drafts for root step R8, tested where they sit. Actual handlers with controlled hooks; no DOM.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];}};});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const match=find(child,test);if(match)return match;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
const T0=1767225600;
const source=(symbol:string,closes:number[])=>{const base=fixtureDataset(symbol,closes.length);return{...base,resolution:'1D',instrument:{...base.instrument,id:'NYSE:'+symbol,exchange:'NYSE'},provenance:{...base.provenance,datasetId:'wl:'+symbol,fixture:false,session:'regular' as const,state:'ready' as const},bars:closes.map((close,index)=>({time:T0+index*86400,open:close,high:close,low:close,close,volume:1}))};};
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
function setup(alerts:ListAlert[]=[]){
 const a=source('AAA',[9,9]),book=addWatchMembers(addWatchList(createWatchBook([]),'L','Mine'),'L',[referenceFromDataset(a)],()=>'row-1').book;
 const created:ListAlert[][]=[],close=vi.fn();let accept=true;
 const render=()=>{hooks.cursor=0;return ListAlertDialog({book,listId:'L',alerts,datasets:[a],now:()=>T0,newId:()=>'new-alert',onCreate:next=>{created.push(next);return accept;},onClose:close});};
 const field=(label:string)=>find(render(),node=>(node.type==='input'||node.type==='select')&&node.props['aria-label']===label).props;
 const button=(name:string)=>find(render(),node=>node.type==='button'&&text(node)===name).props;
 return{render,field,button,created,close,refuse(){accept=false;},book,a};
}
it('creates a list alert from the dialog fields and closes; the result is in the separate collection',()=>{
 const ui=setup();expect(ui.render().type).toBe(Modal);expect(text(ui.render())).toContain('Watches every symbol in "Mine"');
 expect(ui.field('Sessions').value).toBe('regular');expect(ui.field('Frequency').value).toBe('only-once');
 ui.field('Alert name').onChange({target:{value:'Cross ten'}});ui.field('Level').onChange({target:{value:'10'}});ui.button('Create list alert').onClick();
 expect(ui.created).toHaveLength(1);expect(ui.created[0][0]).toMatchObject({id:'new-alert',listId:'L',name:'Cross ten',condition:{kind:'crossing-up',value:10},session:'regular',frequency:'only-once',status:'active'});expect(ui.created[0][0].members.map(row=>row.key)).toEqual(['NYSE:AAA']);expect(ui.close).toHaveBeenCalledOnce();
});
it('shows channel fields for channel conditions, names what is wrong, and keeps the dialog open when the save is refused',()=>{
 const ui=setup();ui.button('Create list alert').onClick();expect(text(find(ui.render(),node=>node.props?.role==='alert'))).toContain('Enter a number for the level');expect(ui.created).toEqual([]);expect(ui.close).not.toHaveBeenCalled();
 ui.field('Condition').onChange({target:{value:'entering'}});expect(ui.field('Lower bound')).toBeTruthy();expect(ui.field('Upper bound')).toBeTruthy();
 ui.field('Alert name').onChange({target:{value:'Channel'}});ui.field('Lower bound').onChange({target:{value:'5'}});ui.field('Upper bound').onChange({target:{value:'15'}});ui.field('Sessions').onChange({target:{value:'extended'}});ui.refuse();ui.button('Create list alert').onClick();
 expect(text(find(ui.render(),node=>node.props?.role==='alert'))).toContain('could not be saved');expect(ui.close).not.toHaveBeenCalled();ui.button('Cancel').onClick();expect(ui.close).toHaveBeenCalledOnce();
});
it('refuses the 21st list alert with the cap message',()=>{
 const a=source('AAA',[9,9]),book=addWatchMembers(addWatchList(createWatchBook([]),'L','Mine'),'L',[referenceFromDataset(a)],()=>'row-1').book;
 const existing=Array.from({length:20},(_,i)=>createListAlert({id:'e'+i,listId:'L',name:'E'+i,message:'',condition:{kind:'greater',value:1},frequency:'every-time',session:'regular',createdAt:T0,expiresAt:null},[],book,[a]));
 const ui=setup(existing);ui.field('Alert name').onChange({target:{value:'Twenty-first'}});ui.field('Level').onChange({target:{value:'3'}});ui.button('Create list alert').onClick();
 expect(text(find(ui.render(),node=>node.props?.role==='alert'))).toContain('at most 20 list alerts');expect(ui.created).toEqual([]);
});
it('the manager group lists each alert with its list name and per-symbol state counts, without internal ids',()=>{
 const ui=setup(),a=ui.a,alert=createListAlert({id:'internal-id-123',listId:'L',name:'Cross ten',message:'',condition:{kind:'crossing-up',value:10},frequency:'only-once',session:'regular',createdAt:T0,expiresAt:null},[],ui.book,[a]);
 const onPause=vi.fn(),onRemove=vi.fn(),group=ListAlertsGroup({alerts:[alert],book:ui.book,onPause,onRemove}) as any;
 expect(text(group)).toContain('Cross ten');expect(text(group)).toContain('Mine: 1 symbols, 0 waiting for data, 1 running, 0 triggered.');expect(group.props['aria-label']).toBe('List alerts');
 expect(text(group)).toContain('NYSE:AAA: running');
 expect(text(group)).not.toContain('internal-id-123');expect(find(group,node=>node.type==='article').props['aria-label']).not.toContain('internal-id-123');
 find(group,node=>node.type==='button'&&text(node)==='Pause').props.onClick();expect(onPause).toHaveBeenCalledWith('internal-id-123',true);
 const done=evaluateListAlerts([alert],ui.book,[{...a,bars:[...a.bars,{time:T0+2*86400,open:11,high:11,low:11,close:11,volume:1}]}]).alerts[0];
 expect(text(ListAlertsGroup({alerts:[done],book:ui.book}))).toContain('1 triggered');expect(text(ListAlertsGroup({alerts:[done],book:ui.book}))).toContain('Every symbol in the list has triggered');
 expect(ListAlertsGroup({alerts:[],book:ui.book})).toBeNull();
});
