import {beforeEach,expect,it,vi} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';
import type {AlertCondition} from '../../src/domain/alerts';
import {LIST_ALERT_CONDITION_KINDS,createListAlert,editListAlert,evaluateListAlert,listAlertFromForm,listAlertToForm,restoreListAlerts,validateListAlerts,type ListAlert} from '../../src/domain/watchlist-alerts';
import {addWatchList,createWatchBook,referenceFromDataset,type WatchBook} from '../../src/watchlists/model';
import {addWatchMembers} from '../../src/watchlists/membership';
import {ListAlertDialog} from '../../src/ui/ListAlertDialog';
import {conditionText} from '../../src/ui/alerts-dock-model';

// SYNTHETIC closes only.: list alerts take the Moving up and Moving down conditions
// in price or percent over N bars, like the chart alert.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const match=find(child,test);if(match)return match;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
const T0=1767225600,DAY=86400;let serial=0;const id=()=>'m'+(++serial);
function source(symbol:string,closes:number[]):BarDataset{const base=fixtureDataset(symbol,closes.length);return{...base,resolution:'1D',instrument:{...base.instrument,id:'NYSE:'+symbol,exchange:'NYSE'},provenance:{...base.provenance,providerId:'wl-test',providerName:'Synthetic test input',datasetId:'wl:NYSE:'+symbol,fixture:false,session:'regular',state:'ready',delaySeconds:null},bars:closes.map((close,index)=>({time:T0+index*DAY,open:close,high:close,low:close,close,volume:1}))};}
const grow=(dataset:BarDataset,more:number[]):BarDataset=>({...dataset,bars:[...dataset.bars,...more.map((close,index)=>({time:dataset.bars.at(-1)!.time+(index+1)*DAY,open:close,high:close,low:close,close,volume:1}))]});
function bookOf(datasets:BarDataset[]):WatchBook{return addWatchMembers(addWatchList(createWatchBook([]),'L','Mine'),'L',datasets.map(referenceFromDataset),id).book;}
const spec=(condition:AlertCondition,frequency:'only-once'|'every-time'='every-time')=>({id:'mv',listId:'L',name:'Move',message:'{{ticker}} moved',condition,frequency,session:'regular' as const,createdAt:T0,expiresAt:null});

it('the condition list now holds Moving up and Moving down; position and level crossings stay chart-only',()=>{
 expect(LIST_ALERT_CONDITION_KINDS).toContain('moving-up');expect(LIST_ALERT_CONDITION_KINDS).toContain('moving-down');
 const a=source('AAA',[10,10]);
 expect(()=>createListAlert(spec({kind:'position'} as AlertCondition),[],bookOf([a]),[a])).toThrow(/price, channel and moving/i);
 expect(()=>createListAlert(spec({kind:'moving-up',amount:-1,bars:1,percent:false}),[],bookOf([a]),[a])).toThrow(/nonnegative/i);
 expect(()=>createListAlert(spec({kind:'moving-up',amount:1,bars:0,percent:false}),[],bookOf([a]),[a])).toThrow(/1 to 10000 bars/i);
 expect(()=>createListAlert(spec({kind:'moving-up',amount:1,bars:1,percent:false,value:3} as AlertCondition),[],bookOf([a]),[a])).toThrow(/fields/i);
});
it('Moving up % over 2 bars triggers each member against the close 2 completed bars earlier, history before creation included',()=>{
 const a=source('AAA',[100,100,100]),b=source('BBB',[50,50,50]),book=bookOf([a,b]);
 const alert=createListAlert(spec({kind:'moving-up',amount:10,bars:2,percent:true}),[],book,[a,b]);
 const step1=evaluateListAlert(alert,book,[grow(a,[105]),grow(b,[56])]);
 expect(step1.notifications.map(row=>row.memberKey)).toEqual(['NYSE:BBB']);expect(step1.notifications[0].message).toBe('BBB moved');
 const step2=evaluateListAlert(step1.alert,book,[grow(a,[105,111]),grow(b,[56,50])]);
 expect(step2.notifications.map(row=>row.memberKey)).toEqual(['NYSE:AAA']); // 111 vs 100 two bars earlier is +11%
 expect(restoreListAlerts(JSON.parse(JSON.stringify([step2.alert])))[0]).toEqual(step2.alert);
});
it('Moving down in price over 1 bar, and Once only completes when every member has moved',()=>{
 const a=source('AAA',[20]),b=source('BBB',[30]),book=bookOf([a,b]);
 const alert=createListAlert(spec({kind:'moving-down',amount:2,bars:1,percent:false},'only-once'),[],book,[a,b]);
 const one=evaluateListAlert(alert,book,[grow(a,[17.5]),grow(b,[29])]);expect(one.notifications.map(row=>row.memberKey)).toEqual(['NYSE:AAA']);expect(one.alert.status).toBe('active');
 const two=evaluateListAlert(one.alert,book,[grow(a,[17.5,10]),grow(b,[29,27])]);expect(two.notifications.map(row=>row.memberKey)).toEqual(['NYSE:BBB']);expect(two.alert.status).toBe('completed');
});
it('a member without enough history before its next bar never triggers on invented bars',()=>{
 const a=source('AAA',[100]),book=bookOf([a]);
 const alert=createListAlert(spec({kind:'moving-up',amount:1,bars:3,percent:true}),[],book,[a]);
 expect(evaluateListAlert(alert,book,[grow(a,[200])]).notifications).toEqual([]);
});
it('the dialog form round-trips the four moving choices, and editing restarts members on the new condition',()=>{
 const form={listId:'L',name:'Move',message:'',kind:'moving-up-percent',value:'',lower:'',upper:'',amount:'5',bars:'3',frequency:'every-time',session:'regular',expires:''};
 expect(listAlertFromForm(form,'x',T0).condition).toEqual({kind:'moving-up',amount:5,bars:3,percent:true});
 expect(listAlertFromForm({...form,kind:'moving-down'},'x',T0).condition).toEqual({kind:'moving-down',amount:5,bars:3,percent:false});
 expect(()=>listAlertFromForm({...form,amount:''},'x',T0)).toThrow('Enter a number for the movement');
 expect(()=>listAlertFromForm({...form,bars:'2.5'},'x',T0)).toThrow(/whole number of bars/i);
 const a=source('AAA',[10,10]),book=bookOf([a]),alert=createListAlert(listAlertFromForm(form,'mv',T0),[],book,[a]);
 expect(listAlertToForm(alert)).toMatchObject({kind:'moving-up-percent',amount:'5',bars:'3',value:''});
 const edited=editListAlert(alert,{...listAlertToForm(alert),kind:'moving-down-percent'},book,T0);expect(edited.condition).toEqual({kind:'moving-down',amount:5,bars:3,percent:true});
 expect(validateListAlerts([edited]).ok).toBe(true);
 expect(conditionText(edited.condition)).toBe('Moving down 5% over 3 bars');
});
it('the dialog offers Moving up, Moving down and their % forms with movement and bar fields',()=>{
 const a=source('AAA',[9,9]),book=bookOf([a]),created:ListAlert[][]=[];
 const render=()=>{hooks.cursor=0;return ListAlertDialog({book,listId:'L',alerts:[],datasets:[a],now:()=>T0,newId:()=>'new-alert',onCreate:next=>{created.push(next);return true;},onClose(){}});};
 const field=(label:string)=>find(render(),node=>(node.type==='input'||node.type==='select')&&node.props['aria-label']===label)?.props;
 const options=find(render(),node=>node.type==='select'&&node.props['aria-label']==='Condition').props.children.map((option:any)=>text(option));
 for(const label of ['Moving up','Moving down','Moving up %','Moving down %'])expect(options).toContain(label);
 field('Condition').onChange({target:{value:'moving-down-percent'}});expect(field('Level')).toBeUndefined();expect(field('Movement')).toBeTruthy();expect(field('Bars')).toBeTruthy();
 field('Alert name').onChange({target:{value:'Drop'}});field('Movement').onChange({target:{value:'4'}});field('Bars').onChange({target:{value:'2'}});
 find(render(),node=>node.type==='button'&&text(node)==='Create list alert').props.onClick();
 expect(created).toHaveLength(1);expect(created[0][0].condition).toEqual({kind:'moving-down',amount:4,bars:2,percent:true});
});
