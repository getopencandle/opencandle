import {expect,it} from 'vitest';
import {createPaperAccount,processPaperQuote,submitPaperOrder,restorePaperAccount,modifyPaperExitLevel,paperExitTarget,cancelPaperExitLevel,attachPaperPositionExits,paperPositionExitTarget,resetPaperAccount,type PaperAccount,type PaperResult} from '../../src/domain/paper';
import type {Instrument} from '../../src/domain/types';
const instrument:Instrument={id:'REVIEW:VIRTUAL',symbol:'VIRTUAL',name:'Synthetic independent ownership review',exchange:'SYNTHETIC',currency:'USD',assetClass:'stock',timezone:'UTC',tickSize:0.01,lotSize:1};
const accepted=(result:PaperResult)=>{expect(result.ok,result.diagnostics.map(row=>row.message).join('; ')).toBe(true);return result.account;};
function open():PaperAccount{
 let account=createPaperAccount({initialBalance:1000});account=accepted(processPaperQuote(account,{instrumentId:instrument.id,bid:9.98,ask:10.02,eventTime:1,receivedAt:1,availableAt:1,sequence:1,fixture:true,session:'unknown'},1,account.runId,instrument));
 return accepted(submitPaperOrder(account,{instrument,side:'buy',type:'market',quantity:10,exits:{schemaVersion:1,mode:'single',levels:[{quantity:10,takeProfit:12,stopLoss:9}]}},1));
}
const clone=(value:PaperAccount):PaperAccount=>JSON.parse(JSON.stringify(value));
it('independent unmodified bracket account restores and waits for its literal profit level',()=>{
 const account=restorePaperAccount(clone(open())),next=accepted(processPaperQuote(account,{instrumentId:instrument.id,bid:10,ask:10.02,eventTime:2,receivedAt:2,availableAt:2,sequence:2,fixture:true,session:'unknown'},2,account.runId,instrument));expect(next.positions[instrument.id].quantity).toBe(10);expect(next.fills).toHaveLength(1);
});
it('rejects a take-profit child rewritten into a stop that would close exposure early',()=>{
 const account=clone(open()),child=account.orders.find(row=>row.bracket?.leg==='tp')!;child.type='stop';child.stopPrice=12;delete child.limitPrice;expect(()=>restorePaperAccount(account)).toThrow();
});
it('rejects changed child prices and activation barriers that contradict their declared level',()=>{
 for(const mutate of [(child:any)=>{child.limitPrice=10;},(child:any)=>{child.bracket.activationSequence=0;}]){const account=clone(open()),child=account.orders.find(row=>row.bracket?.leg==='tp')!;mutate(child);expect(()=>restorePaperAccount(account)).toThrow();}
});
it('rejects group and child generation changes detached from their owned exposure',()=>{
 const account=clone(open());account.brackets!.groups[0].generation=2;for(const child of account.orders.filter(row=>row.bracket))child.bracket!.generation=2;expect(()=>restorePaperAccount(account)).toThrow();
});
it('rejects a control lot claiming more opening exposure than its actual entry fill',()=>{
 const account=clone(open());account.brackets!.lots[0].openedQuantity=11;expect(()=>restorePaperAccount(account)).toThrow();
});
it('rejects unsupported bracket extension fields instead of accepting unknown execution semantics',()=>{
 const account=clone(open());(account.brackets as any).futureExecutionPolicy='close-on-load';expect(()=>restorePaperAccount(account)).toThrow();
});
it('rejects changing a group parent to its own exit order',()=>{
 const account=clone(open());account.brackets!.groups[0].parentOrderId=account.orders.find(row=>row.bracket)?.id!;expect(()=>restorePaperAccount(account)).toThrow();
});
const quoted=(account:PaperAccount,bid:number,ask:number,sequence:number)=>accepted(processPaperQuote(account,{instrumentId:instrument.id,bid,ask,eventTime:sequence,receivedAt:sequence,availableAt:sequence,sequence,fixture:true,session:'unknown'},sequence,account.runId,instrument));
it('independent canonical queue gives an earlier manual reduction priority and defers resized children',()=>{
 let account=quoted(createPaperAccount({initialBalance:1000,commission:{kind:'fixed',value:1}}),9.98,10.02,1);
 account=accepted(submitPaperOrder(account,{instrument,side:'buy',type:'market',quantity:4},1));
 account=accepted(submitPaperOrder(account,{instrument,side:'sell',type:'limit',limitPrice:12,quantity:6},1));
 const manual=account.orders.at(-1)!.id;
 account=accepted(submitPaperOrder(account,{instrument,side:'buy',type:'market',quantity:6,exits:{schemaVersion:1,mode:'single',levels:[{quantity:6,takeProfit:12,stopLoss:9}]}},1));
 account=quoted(account,12,12.02,2);
 expect(account.fills.at(-1)!.orderId).toBe(manual);expect(account.fills).toHaveLength(3);expect(account.positions[instrument.id].quantity).toBe(4);
 expect(account.brackets!.groups[0].levels[0].allocation).toBe(4);expect(account.orders.filter(row=>row.bracket&&row.status==='working').map(row=>row.bracket!.activationSequence)).toEqual([2,2]);
 account=quoted(account,12,12.02,3);expect(account.positions).toEqual({});expect(account.cash).toBe(1015.8);expect(account.fees).toBe(4);
 expect(restorePaperAccount(clone(account))).toEqual(account);
});
it('independent short-side percentage fees and OCO exits match literal cash accounting',()=>{
 let account=quoted(createPaperAccount({initialBalance:1000,commission:{kind:'percent',value:1}}),9.98,10.02,1);
 account=accepted(submitPaperOrder(account,{instrument,side:'sell',type:'market',quantity:10,exits:{schemaVersion:1,mode:'multiple',levels:[{quantity:4,takeProfit:8,stopLoss:12},{quantity:6,takeProfit:7,stopLoss:13}]}},1));
 expect(account.cash).toBe(1098.802);account=quoted(account,7.98,8,2);expect(account.cash).toBe(1066.482);expect(account.positions[instrument.id].quantity).toBe(-6);
 account=quoted(account,6.98,7,3);expect(account.cash).toBe(1024.062);expect(account.fees).toBe(1.738);expect(account.positions).toEqual({});expect(account.orders.filter(row=>row.bracket&&row.status==='cancelled')).toHaveLength(2);
});
it('invalid and stale placed-level edits preserve the original account, including history counters',()=>{
 const account=open(),before=JSON.stringify(account),group=account.brackets!.groups[0],target=paperExitTarget(account,'group',group.id);
 for(const level of [{quantity:0,takeProfit:12,stopLoss:9},{quantity:10,takeProfit:8,stopLoss:9},{quantity:10,takeProfit:12.001,stopLoss:9}]){const result=modifyPaperExitLevel(account,target,group.levels[0].id,level,1);expect(result.ok).toBe(false);expect(result.account).toBe(account);expect(JSON.stringify(account)).toBe(before);}
 const changed=accepted(modifyPaperExitLevel(account,target,group.levels[0].id,{quantity:8,takeProfit:13,stopLoss:8},1));
 const stale=cancelPaperExitLevel(changed,target,group.levels[0].id,1);expect(stale.ok).toBe(false);expect(stale.account).toBe(changed);expect(restorePaperAccount(clone(changed))).toEqual(changed);
});
it('position replacement requires the exact listed owners and pins subsequent exposure changes',()=>{
 let account=open();const target=paperPositionExitTarget(account,instrument.id),plan={schemaVersion:1 as const,mode:'single' as const,levels:[{quantity:10,takeProfit:14,stopLoss:8}]};
 for(const owners of [[],[...target.owners.map(row=>row.id),'foreign'],[target.owners[0].id,target.owners[0].id]]){const result=attachPaperPositionExits(account,target,plan,owners,1);expect(result.ok).toBe(false);expect(result.account).toBe(account);}
 account=accepted(submitPaperOrder(account,{instrument,side:'buy',type:'market',quantity:1},1));const stale=attachPaperPositionExits(account,target,plan,target.owners.map(row=>row.id),1);expect(stale.ok).toBe(false);expect(stale.account).toBe(account);
});
it('an ordinary reset prevents old group targets from editing newly reused numeric identities',()=>{
 const original=open(),group=original.brackets!.groups[0],target=paperExitTarget(original,'group',group.id);
 let reset=quoted(resetPaperAccount(original,{},1),9.98,10.02,1);
 reset=accepted(submitPaperOrder(reset,{instrument,side:'buy',type:'market',quantity:10,exits:{schemaVersion:1,mode:'single',levels:[{quantity:10,takeProfit:12,stopLoss:9}]}},1));
 expect(reset.brackets!.groups[0].id).toBe(group.id);expect(reset.runId).not.toBe(original.runId);
 const result=cancelPaperExitLevel(reset,target,group.levels[0].id,1);expect(result.ok).toBe(false);expect(result.account).toBe(reset);
});
