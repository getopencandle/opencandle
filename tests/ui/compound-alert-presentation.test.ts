import {expect,it} from 'vitest';
import {COMPOUND_POLICY,type CompoundDefinition,type CompoundNotification} from '../../src/domain/compound-alerts';
import {compoundConditionLabels,compoundNotificationView} from '../../src/ui/compound-alert-presentation';
function fixture(){
 const definition:CompoundDefinition={kind:'compound',schemaVersion:1,policy:COMPOUND_POLICY,mode:'ordinary',id:'SYNTHETIC private alert ID',name:'SYNTHETIC original name',message:'SYNTHETIC original message',context:{instrumentId:'SYNTHETIC private instrument ID',sourceFamily:'SYNTHETIC private provider ID',basis:'SYNTHETIC private basis',interval:'1m',session:'regular'},predicates:[{id:'SYNTHETIC first private condition ID',source:{kind:'price',field:'close'},operator:{kind:'crossing-up',value:10}},{id:'SYNTHETIC second private condition ID',source:{kind:'indicator',indicator:'sma',plot:'sma',snapshotId:'SYNTHETIC private snapshot ID',inputs:{length:3,source:'hl2'}},operator:{kind:'inside',lower:9,upper:12}}],frequency:'every-time',createdAt:0,expiresAt:null};
 const notification:CompoundNotification={id:'SYNTHETIC notification ID',alertId:definition.id,revision:1,sequence:5,at:100,barId:'SYNTHETIC private bar ID',values:[11,10.5],local:true};
 return{definition,notification,binding:{revision:1,declaration:definition}};
}
it('formats the whole vector with original frozen source settings and literal values',()=>{
 const {binding,notification}=fixture(),view=compoundNotificationView(binding,notification);expect(view.title).toBe('Alert: SYNTHETIC original name');expect(view.conditions).toEqual([{label:'Close: Crossing up 10',value:'11'},{label:'SMA (3, High/Low average): Inside channel 9 to 12',value:'10.5'}]);expect(view.desktopBody).toBe('SYNTHETIC original message\nClose: Crossing up 10 = 11\nSMA (3, High/Low average): Inside channel 9 to 12 = 10.5');expect(Object.isFrozen(view)).toBe(true);expect(Object.isFrozen(view.conditions)).toBe(true);
});
it('keeps original historical names and predicates after a later revision changes',()=>{
 const {binding,notification,definition}=fixture(),original=compoundNotificationView(binding,notification),edited={...definition,name:'SYNTHETIC later name',message:'SYNTHETIC later message',predicates:[...definition.predicates,{...definition.predicates[0],id:'SYNTHETIC third'}]};expect(compoundNotificationView(binding,notification)).toEqual(original);expect(()=>compoundNotificationView({revision:2,declaration:edited},notification)).toThrow(/saved alert revision/);
});
it('never puts internal identifiers into visible title, body or condition labels',()=>{
 const {binding,notification}=fixture(),view=compoundNotificationView(binding,notification),visible=[view.title,view.message,view.desktopBody,...view.conditions.map(row=>row.label)].join(' ');expect(visible).not.toContain('private');expect(visible).not.toContain(notification.id);expect(visible).not.toContain(notification.barId);
});
it('refuses a foreign alert or mismatched revision instead of relabeling its vector',()=>{
 const {binding,notification}=fixture();expect(()=>compoundNotificationView(binding,{...notification,alertId:'SYNTHETIC foreign'})).toThrow();expect(()=>compoundNotificationView(binding,{...notification,revision:2})).toThrow();
});
it('refuses missing, extra and nonfinite saved values',()=>{
 const {binding,notification}=fixture();for(const values of [[11],[11,10,9],[NaN,10],[11,Infinity]])expect(()=>compoundNotificationView(binding,{...notification,values})).toThrow();
});
it('requires the original name and keeps an empty message empty',()=>{
 const {definition,notification}=fixture(),view=compoundNotificationView({revision:1,declaration:{...definition,message:''}},notification);expect(view.title).toBe('Alert: SYNTHETIC original name');expect(view.message).toBe('');expect(view.desktopBody).toBe('Close: Crossing up 10 = 11\nSMA (3, High/Low average): Inside channel 9 to 12 = 10.5');expect(()=>compoundNotificationView({revision:1,declaration:{...definition,name:''}},notification)).toThrow();
});
it('refuses unsupported saved indicator declarations rather than showing internal type or snapshot names',()=>{
 const {definition,notification}=fixture();const predicates=[definition.predicates[0],{...definition.predicates[1],source:{kind:'indicator' as const,indicator:'SYNTHETIC unsupported private type',plot:'SYNTHETIC private plot',snapshotId:'SYNTHETIC private snapshot',inputs:{length:3,source:'close'}}}];expect(()=>compoundNotificationView({revision:1,declaration:{...definition,predicates}},notification)).toThrow(/description is unavailable/);
});
it('describes all seven raw price fields without exposing field identifiers as settings IDs',()=>{
 const {definition}=fixture();for(const [field,label] of [['open','Open'],['high','High'],['low','Low'],['close','Close'],['hl2','High/Low average'],['hlc3','Typical price'],['ohlc4','OHLC average']] as const){const predicates=[{...definition.predicates[0],source:{kind:'price' as const,field}},definition.predicates[1]];expect(compoundConditionLabels({...definition,predicates})[0]).toBe(label+': Crossing up 10');}
});
it('refuses sparse or accessor vectors without invoking the accessor',()=>{
 const {binding,notification}=fixture(),sparse=Array<number>(2);sparse[0]=11;expect(()=>compoundNotificationView(binding,{...notification,values:sparse})).toThrow();
 const values=[11,10.5];let reads=0;Object.defineProperty(values,'1',{enumerable:true,get(){reads++;return 10.5;}});expect(()=>compoundNotificationView(binding,{...notification,values})).toThrow();expect(reads).toBe(0);
});
