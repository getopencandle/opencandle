import {expect,it} from 'vitest';
import {buildCompoundFormDefinition,type CompoundFormChoice,type CompoundFormDraft} from '../../src/ui/compound-alert-form';
import type {CompoundContext} from '../../src/domain/compound-alerts';
const context:CompoundContext={instrumentId:'SYNTHETIC',sourceFamily:'SYNTHETIC feed',interval:'1m',session:'regular',basis:'SYNTHETIC basis'};
function setup(){
 const choices:CompoundFormChoice[]=[{id:'price',label:'SYNTHETIC Close',declaration:{kind:'price',field:'close'}},{id:'average',label:'SYNTHETIC SMA 3',declaration:{kind:'indicator',indicator:'sma',plot:'sma',snapshotId:'SYNTHETIC frozen inputs',inputs:{length:3,source:'close'}}}];
 const draft:CompoundFormDraft={name:'  SYNTHETIC conjunction  ',message:'SYNTHETIC message',frequency:'once-per-bar-close',expiresAt:200,conditions:[{id:'first',sourceId:'price',kind:'crossing-up',value:' 1.25e2 ',lower:'',upper:''},{id:'second',sourceId:'average',kind:'inside',value:'',lower:'100',upper:'130'}]};
 const build=(next:CompoundFormDraft=draft,list=choices,c=context)=>buildCompoundFormDefinition(next,list,c,{id:'SYNTHETIC alert',now:100});
 return{draft,choices,build};
}
it('builds an immutable two-condition declaration with literal thresholds and frozen SMA inputs',()=>{
 const {build,choices}=setup(),result=build();
 expect(result.name).toBe('SYNTHETIC conjunction');expect(result.predicates.map(p=>p.operator)).toEqual([{kind:'crossing-up',value:125},{kind:'inside',lower:100,upper:130}]);
 expect(result.context).toEqual(context);expect(result.context).not.toBe(context);expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.predicates)).toBe(true);
 const source=result.predicates[1].source;expect(source).not.toBe(choices[1].declaration);expect(source.kind).toBe('indicator');if(source.kind==='indicator')expect(Object.isFrozen(source.inputs)).toBe(true);
});
it('refuses blank, nondecimal, nonfinite and oversized thresholds without converting them to zero',()=>{
 const {draft,build}=setup();for(const value of ['','   ','0x10','NaN','Infinity','1e999','1'.repeat(65)])expect(()=>build({...draft,conditions:[{...draft.conditions[0],value},draft.conditions[1]]})).toThrow();
});
it('refuses removed, unavailable and duplicate catalog choices rather than substituting another source',()=>{
 const {choices,build}=setup();expect(()=>build(undefined,choices.slice(1))).toThrow();expect(()=>build(undefined,[{...choices[0],unavailableReason:'Wait for the source.'},choices[1]])).toThrow();expect(()=>build(undefined,[...choices,choices[0]])).toThrow();
});
it('refuses incomplete operators, unordered channels and duplicate condition identities',()=>{
 const {draft,build}=setup();expect(()=>build({...draft,conditions:[{...draft.conditions[0],kind:''},draft.conditions[1]]})).toThrow();expect(()=>build({...draft,conditions:[draft.conditions[0],{...draft.conditions[1],lower:'131'}]})).toThrow();expect(()=>build({...draft,conditions:[draft.conditions[0],{...draft.conditions[1],id:'first'}]})).toThrow();
});
it('supports all nine operators and preserves explicitly equal channel bounds',()=>{
 const {draft,build}=setup();for(const kind of ['greater','less','crossing','crossing-up','crossing-down','inside','outside','entering','exiting'] as const){const row={...draft.conditions[0],kind,lower:'7',upper:'7'},result=build({...draft,conditions:[row,draft.conditions[1]]});expect(result.predicates[0].operator.kind).toBe(kind);if('lower' in result.predicates[0].operator)expect(result.predicates[0].operator).toEqual({kind,lower:7,upper:7});}
});
it('accepts five conditions and rejects fewer than two or more than five',()=>{
 const {draft,build}=setup();const rows=Array.from({length:5},(_,i)=>({...draft.conditions[0],id:'SYNTHETIC '+i}));expect(build({...draft,conditions:rows}).predicates).toHaveLength(5);for(const conditions of [[],rows.slice(0,1),[...rows,{...rows[0],id:'sixth'}]])expect(()=>build({...draft,conditions})).toThrow();
});
it('refuses daily or extended contexts and unsupported or malformed frozen indicator declarations',()=>{
 const {choices,build}=setup();expect(()=>build(undefined,choices,{...context,interval:'1D'})).toThrow();expect(()=>build(undefined,choices,{...context,session:'extended'})).toThrow();for(const inputs of [{length:0,source:'close'},{length:3,source:'chart'},{length:3,source:'close',extra:1}] as ReadonlyArray<Record<string,number|string>>)expect(()=>build(undefined,[choices[0],{...choices[1],declaration:{kind:'indicator',indicator:'sma',plot:'sma',snapshotId:'SYNTHETIC',inputs}}])).toThrow();
});
it('requires future explicit expiry and preserves message, frequency and original source settings',()=>{
 const {draft,choices,build}=setup();expect(()=>build({...draft,expiresAt:100})).toThrow();const result=build({...draft,frequency:'every-time',expiresAt:null});expect(result.message).toBe('SYNTHETIC message');expect(result.frequency).toBe('every-time');expect(result.expiresAt).toBeNull();(choices[1].declaration as {inputs:Record<string,number|string>}).inputs.length=50;expect(result.predicates[1].source.kind==='indicator'&&result.predicates[1].source.inputs.length).toBe(3);
});
