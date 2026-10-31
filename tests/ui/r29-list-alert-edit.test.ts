import {beforeEach,expect,it,vi} from 'vitest';
import {ListAlertDialog} from '../../src/ui/ListAlertDialog';
import {ListAlertsGroup} from '../../src/ui/ListAlertsGroup';
import {fixtureDataset} from '../../src/domain/fixtures';
import {addWatchList,createWatchBook,referenceFromDataset} from '../../src/watchlists/model';
import {addWatchMembers} from '../../src/watchlists/membership';
import {createListAlert,editListAlert,evaluateListAlerts,listAlertToForm,validateListAlerts,type ListAlert} from '../../src/domain/watchlist-alerts';

// Edit a list alert in place. SYNTHETIC rows; actual handlers with controlled hooks; no DOM.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];}};});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const match=find(child,test);if(match)return match;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
const T0=1767225600;
const source=(symbol:string,closes:number[])=>{const base=fixtureDataset(symbol,closes.length);return{...base,resolution:'1D',instrument:{...base.instrument,id:'NYSE:'+symbol,exchange:'NYSE'},provenance:{...base.provenance,datasetId:'wl:'+symbol,fixture:false,session:'regular' as const,state:'ready' as const},bars:closes.map((close,index)=>({time:T0+index*86400,open:close,high:close,low:close,close,volume:1}))};};
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
function world(){
 const a=source('AAA',[9,9]),book=addWatchMembers(addWatchList(createWatchBook([]),'L','Mine'),'L',[referenceFromDataset(a)],()=>'row-1').book;
 const alert=createListAlert({id:'e1',listId:'L',name:'Cross ten',message:'up',condition:{kind:'crossing-up',value:10},frequency:'every-time',session:'regular',createdAt:T0,expiresAt:null},[],book,[a]);
 // One trigger: 11 crosses 10.
 const fired=evaluateListAlerts([alert],book,[source('AAA',[9,9,11])]).alerts[0];
 return{a,book,alert:fired};
}

it('a saved list alert round-trips through its form, and an edit of name, message or expiry keeps its id, history and running state',()=>{
 const {book,alert}=world();
 expect(alert.history).toHaveLength(1);expect(alert.members[0]).toMatchObject({status:'active',triggers:1});
 const form=listAlertToForm(alert);expect(form).toMatchObject({listId:'L',name:'Cross ten',message:'up',kind:'crossing-up',value:'10',frequency:'every-time',session:'regular',expires:''});
 const edited=editListAlert(alert,{...form,name:'Renamed',message:'new text',expires:'2026-03-01T12:30'},book,T0+86400*3);
 expect(edited).toMatchObject({id:'e1',listId:'L',createdAt:T0,name:'Renamed',message:'new text',expiresAt:Date.parse('2026-03-01T12:30:00Z')/1000,status:'active'});
 expect(edited.history).toEqual(alert.history);expect(edited.members).toEqual(alert.members);
 expect(listAlertToForm(edited).expires).toBe('2026-03-01T12:30');
 expect(validateListAlerts([edited]).ok).toBe(true);
});

it('a new condition restarts each symbol from a fresh baseline (kept trigger count), so no crossing is reported for old bars',()=>{
 const {book,alert}=world();
 const edited=editListAlert(alert,{...listAlertToForm(alert),kind:'greater',value:'5'},book,T0);
 expect(edited.condition).toEqual({kind:'greater',value:5});expect(edited.members[0]).toMatchObject({status:'waiting-for-data',baselineTime:null,triggers:1});
 // The next evaluation only takes a baseline: the old bars above 5 never trigger.
 const next=evaluateListAlerts([edited],book,[source('AAA',[9,9,11])]).alerts[0];
 expect(next.history).toHaveLength(1);expect(next.members[0].baselineTime).toBe(T0+2*86400);
 const later=evaluateListAlerts([next],book,[source('AAA',[9,9,11,12])]);expect(later.notifications).toHaveLength(1);
});

it('refuses a past expiry, a bad level and a deleted list; a stopped alert that is saved runs again',()=>{
 const {book,alert}=world();
 expect(()=>editListAlert(alert,{...listAlertToForm(alert),expires:'2026-01-01T00:30'},book,T0+86400)).toThrow('already past');
 expect(()=>editListAlert(alert,{...listAlertToForm(alert),value:'ten'},book,T0)).toThrow('Enter a number');
 expect(()=>editListAlert(alert,listAlertToForm(alert),createWatchBook([]),T0)).toThrow('deleted');
 const stopped={...alert,status:'completed' as const,statusReason:'done'};
 expect(editListAlert(stopped,listAlertToForm(stopped),book,T0)).toMatchObject({status:'active',statusReason:null});
});

it('the dialog opens an existing list alert, saves the change in place without recreating it, and the group offers Edit',()=>{
 const {a,book,alert}=world(),other={...alert,id:'e2',name:'Other'},alerts=[alert,other];
 const saved:ListAlert[][]=[],close=vi.fn();
 const render=()=>{hooks.cursor=0;return ListAlertDialog({book,listId:'L',alerts,datasets:[a],now:()=>T0,newId:()=>{throw new Error('an edit never makes a new id');},onCreate:next=>{saved.push(next);return true;},onClose:close,editing:alert});};
 expect(render().props.title).toBe('Edit list alert');
 const field=(label:string)=>find(render(),node=>(node.type==='input'||node.type==='select')&&node.props['aria-label']===label).props;
 expect(field('Alert name').value).toBe('Cross ten');expect(field('Level').value).toBe('10');
 field('Level').onChange({target:{value:'12'}});
 find(render(),node=>node.type==='button'&&text(node)==='Save').props.onClick();
 expect(saved).toHaveLength(1);expect(saved[0].map(row=>row.id)).toEqual(['e1','e2']);
 expect(saved[0][0]).toMatchObject({id:'e1',condition:{kind:'crossing-up',value:12},createdAt:T0});expect(saved[0][0].history).toEqual(alert.history);expect(saved[0][1]).toBe(other);
 expect(close).toHaveBeenCalledOnce();
 const edits:string[]=[],group=ListAlertsGroup({alerts,book,onEdit:id=>edits.push(id)});
 find(group,node=>node.type==='button'&&node.props['aria-label']==='Edit list alert Cross ten').props.onClick();expect(edits).toEqual(['e1']);
});
