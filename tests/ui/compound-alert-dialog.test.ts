import {expect,it} from 'vitest';
import {compoundDialogChoices,compoundSeedCondition,compoundDefinitionDrafts,validateCompoundAddedCondition,sameCompoundDialogContext} from '../../src/ui/compound-alert-dialog';
import {buildCompoundFormDefinition} from '../../src/ui/compound-alert-form';
import type {AlertDraft,AlertSourceChoice} from '../../src/ui/AlertDialog';
import {COMPOUND_POLICY,type CompoundDefinition} from '../../src/domain/compound-alerts';
import {captureIndicatorAlertSource} from '../../src/domain/technical-alerts';
import {indicatorDefaults} from '../../src/chart/indicator-settings';
import {calculateIndicator} from '../../src/domain/indicators';
const context={instrumentId:'SYNTHETIC GME',sourceFamily:'SYNTHETIC provider',interval:'1m' as const,session:'regular' as const,basis:'SYNTHETIC split/raw'};
const draft:AlertDraft={name:'SYNTHETIC alert',message:'SYNTHETIC message',kind:'greater',value:' 407 ',lower:'3',upper:'7',amount:'1',bars:'1',percent:false,frequency:'every-time',expirationEnabled:false,expiresAt:''};
const price:AlertSourceChoice={id:'SYNTHETIC price choice',label:'Close',source:{kind:'price',field:'close',transformId:'standard'}};
function average(length=3,snapshotId='SYNTHETIC SMA frozen'):AlertSourceChoice{return{id:'SYNTHETIC indicator choice',label:'SMA / SMA',source:{kind:'indicator',instanceId:'SYNTHETIC instance',snapshotId,indicator:'sma',plotId:'sma',inputs:{length,source:'close'},inputBasis:'standard-ohlc',transformId:'standard'}};}
function saved():CompoundDefinition{return{kind:'compound',schemaVersion:1,policy:COMPOUND_POLICY,mode:'ordinary',id:'SYNTHETIC saved',name:'Original',message:'Original message',context,predicates:[{id:'original-first',source:{kind:'price',field:'close'},operator:{kind:'greater',value:407}},{id:'original-second',source:{kind:'indicator',indicator:'sma',plot:'sma',snapshotId:'SYNTHETIC original snapshot',inputs:{length:3,source:'close'}},operator:{kind:'inside',lower:3,upper:7}}],frequency:'every-time',createdAt:10,expiresAt:null};}
it('derives explicit supported raw prices and exact standard frozen SMA from catalog metadata only',()=>{
 const choices=compoundDialogChoices([price,average(),{id:'derived',label:'Heikin Ashi close',source:{kind:'price',field:'close',transformId:'heikinashi'}},{...average(),id:'missing',disabledReason:'Unavailable.'}]);
 expect(choices).toHaveLength(2);expect(choices[0].declaration).toEqual({kind:'price',field:'close'});expect(choices[1].declaration).toEqual({kind:'indicator',indicator:'sma',plot:'sma',snapshotId:'SYNTHETIC SMA frozen',inputs:{length:3,source:'close'}});expect(Object.isFrozen(choices)).toBe(true);
});
it('detaches frozen input declarations without rebinding after catalog inputs change',()=>{
 const row=average(),choices=compoundDialogChoices([row]);if(row.source?.kind!=='indicator')throw Error('Synthetic setup.');row.source.inputs.length=8;
 const source=choices[0].declaration;expect(source.kind).toBe('indicator');if(source.kind==='indicator'){expect(source.inputs.length).toBe(3);expect(Object.isFrozen(source.inputs)).toBe(true);}
});
it('keeps original saved SMA snapshots available alongside changed current catalog settings',()=>{
 const d=saved(),choices=compoundDialogChoices([price,average(8,'SYNTHETIC current snapshot')],d),rows=compoundDefinitionDrafts(d,choices);
 expect(choices).toHaveLength(3);const chosen=choices.find(choice=>choice.id===rows[1].sourceId)!;expect(chosen.label).toContain('saved inputs');expect(chosen.declaration).toBe(d.predicates[1].source);expect(rows.map(row=>row.id)).toEqual(['original-first','original-second']);expect(rows[1]).toMatchObject({kind:'inside',lower:'3',upper:'7'});
});
it('seeds the first condition from the exact existing draft without invented level or source defaults',()=>{
 const choices=compoundDialogChoices([price]),row=compoundSeedCondition(draft,price.id,choices);expect(row).toMatchObject({sourceId:choices[0].id,kind:'greater',value:' 407 ',lower:'3',upper:'7'});
 expect(compoundSeedCondition({...draft,value:''},price.id,choices).value).toBe('');expect(()=>compoundSeedCondition(draft,'missing',choices)).toThrow(/supported/);expect(()=>compoundSeedCondition({...draft,kind:'moving-up'},price.id,choices)).toThrow(/supported/);
});
it('rebuilds an edited definition using original identity and createdAt while preserving frozen choices',()=>{
 const d=saved(),choices=compoundDialogChoices([],d),conditions=compoundDefinitionDrafts(d,choices),result=buildCompoundFormDefinition({name:'Edited',message:'Edited message',conditions,frequency:d.frequency,expiresAt:200},choices,d.context,{id:d.id,now:d.createdAt});
 expect(result.id).toBe(d.id);expect(result.createdAt).toBe(10);expect(result.predicates).toEqual(d.predicates);expect(result.name).toBe('Edited');expect(result.expiresAt).toBe(200);
});
it('does not silently drop extra SMA inputs or admit derived and unsupported kernels',()=>{
 const cases=[average(),average(),average()];for(const row of cases)if(row.source?.kind!=='indicator')throw Error('Synthetic setup.');
 if(cases[0].source?.kind==='indicator')cases[0].source.inputs.extra=1;if(cases[1].source?.kind==='indicator')cases[1].source.indicator='rsi';if(cases[2].source?.kind==='indicator')cases[2].source.inputBasis='chart-prices';expect(compoundDialogChoices(cases)).toHaveLength(0);
});
it('requires complete finite added conditions and preserves explicit equal channel bounds',()=>{
 const choices=compoundDialogChoices([price]),row=compoundSeedCondition(draft,price.id,choices);for(const value of ['','0x10','NaN','Infinity','1e999'])expect(()=>validateCompoundAddedCondition({...row,value},choices)).toThrow();expect(()=>validateCompoundAddedCondition({...row,kind:'inside',lower:'3',upper:'2'},choices)).toThrow();expect(()=>validateCompoundAddedCondition({...row,kind:'inside',lower:'3',upper:'3'},choices)).not.toThrow();
});
it('compares every source-context field without treating display text as producer authority',()=>{
 expect(sameCompoundDialogContext(context,{...context})).toBe(true);for(const field of ['instrumentId','sourceFamily','interval','session','basis'] as const)expect(sameCompoundDialogContext(context,{...context,[field]:'SYNTHETIC different'} as typeof context)).toBe(false);
});
it('projects an actual modern five-input primary SMA capture without changing its canonical primary plot',()=>{
 const inputs={...indicatorDefaults.sma},captured=captureIndicatorAlertSource({id:'SYNTHETIC actual SMA',kind:'sma',inputs,plots:{},offset:0,visible:true},'sma','standard','SYNTHETIC genuine capture');expect(Object.keys(captured.inputs).sort()).toEqual(['length','smoothingLength','smoothingMultiplier','smoothingType','source']);
 const choices=compoundDialogChoices([{id:'SYNTHETIC actual catalog row',label:'SMA / SMA',source:captured}]);expect(choices).toHaveLength(1);const primary=choices[0].declaration;expect(primary.kind).toBe('indicator');if(primary.kind!=='indicator')throw Error('Synthetic setup.');expect(primary.inputs).toEqual({length:indicatorDefaults.sma.length,source:indicatorDefaults.sma.source});
 const bars=Array.from({length:20},(_,index)=>({time:index*60,open:index+1,high:index+2,low:index,close:index+1,volume:10})),modern=calculateIndicator('sma',bars,{...captured.inputs,smoothingType:'EMA'}),plain=calculateIndicator('sma',bars,primary.inputs);expect(modern.diagnostics).toEqual([]);expect(plain.diagnostics).toEqual([]);expect(modern.series[0].id).toBe('sma');expect(plain.series[0].id).toBe('sma');expect(modern.series[0].values).toEqual(plain.series[0].values);expect(modern.series[0].values.at(-1)).toBe(16);
 expect(compoundDialogChoices([{id:'bad',label:'Invalid smoothing',source:{...captured,inputs:{...captured.inputs,smoothingLength:0}}}])).toHaveLength(0);
});
