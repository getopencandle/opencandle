import {expect,it} from 'vitest';
import {createPaperAccount,submitPaperOrder,processPaperQuote,restorePaperAccount,paperSummary} from '../../src/domain/paper';
import {previewPaperTicket,materializePaperTicket,type PaperTicketInput,type PaperTicketContext} from '../../src/domain/paper-ticket';
const input=():PaperTicketInput=>({schemaVersion:1,side:'buy',type:'limit',quantity:{kind:'units',value:'1'},limit:{kind:'price',value:'10'},stop:null,validity:{kind:'day'},entryOutsideRth:false,takeProfitOutsideRth:false,exits:null});
function context():PaperTicketContext{return{account:createPaperAccount({initialBalance:1000,now:1000}),instrument:{id:'SYNTHETIC:REVIEW',symbol:'REVIEW',name:'Synthetic review',exchange:'SYNTHETIC',currency:'USD',assetClass:'stock',timezone:'UTC',tickSize:.01,lotSize:1},quote:{instrumentId:'SYNTHETIC:REVIEW',bid:9.99,ask:10,eventTime:1000,availableAt:1000,receivedAt:1000,sequence:1,fixture:true,session:'regular'},quoteSource:{key:'synthetic independent source',state:'ready'},now:1005};}
it('refuses to submit before a preview was prepared, even while the account clock has not advanced',()=>{
 const draft=input(),ctx=context(),preview=previewPaperTicket(draft,ctx);expect(preview.ok).toBe(true);if(!preview.ok)return;
 const result=materializePaperTicket(preview.value,draft,{...ctx,now:1000});expect(result.ok).toBe(false);expect(result.diagnostics[0].message).toMatch(/time|preview|precede/i);
});
it('percent sizing never silently converts account currency and sub-lot budgets remain zero',()=>{
 const draft=input(),ctx=context();draft.quantity={kind:'balance-percent',basis:'cash',value:'1'};ctx.instrument={...ctx.instrument,currency:'EUR'};expect(previewPaperTicket(draft,ctx)).toMatchObject({ok:false,diagnostics:[{code:'TICKET_FX_UNAVAILABLE'}]});ctx.instrument.currency='USD';draft.quantity.value='.1';expect(previewPaperTicket(draft,ctx)).toMatchObject({ok:false,diagnostics:[{code:'ZERO_SIZED_QUANTITY'}]});
});
it('display preview mutations cannot rewrite the canonical submitted quantity or expiry',()=>{
 const draft=input(),ctx=context(),result=previewPaperTicket(draft,ctx);expect(result.ok).toBe(true);if(!result.ok)return;result.value.resolved.quantity=999;result.value.validity={kind:'manual-expiry',expiresAt:1100};const request=materializePaperTicket(result.value,draft,{...ctx,now:1010});expect(request.ok).toBe(true);if(request.ok){expect(request.value.quantity).toBe(1);expect(request.value.expiresAt).toBe(87410);}
});
it('resolved short risk sizing and money exits produce literal virtual cash, fees, exposure and P&L across distinct quotes',()=>{
 const ctx=context();ctx.now=1000;ctx.account=createPaperAccount({initialBalance:1000,leverage:4,commission:{kind:'fixed',value:1},now:1000});ctx.quote={...ctx.quote!,bid:99,ask:99.25};
 const draft=input();draft.side='sell';draft.limit!.value='100';draft.quantity={kind:'risk-money',currency:'USD',value:'50',stopLevelId:'selected'};draft.exits={mode:'single',levels:[{id:'selected',quantity:'10',takeProfit:{kind:'money',value:'25',currency:'USD'},stopLoss:{kind:'price',value:'102'}}]};
 const preview=previewPaperTicket(draft,ctx);expect(preview.ok).toBe(true);if(!preview.ok)return;expect(preview.value.sizing).toMatchObject({quantity:25,grossNotional:2500,riskStopPrice:102});expect(preview.value.resolved.exits!.levels[0]).toEqual({quantity:10,takeProfit:97.5,stopLoss:102});
 const request=materializePaperTicket(preview.value,draft,ctx);expect(request.ok).toBe(true);if(!request.ok)return;let result=submitPaperOrder(ctx.account,request.value,1000);expect(result.ok).toBe(true);expect(result.account.orders[0].expiresAt).toBe(87400);
 result=processPaperQuote(result.account,{...ctx.quote,bid:100,ask:100.25,sequence:2,eventTime:1001,availableAt:1001,receivedAt:1001},1001,result.account.runId,ctx.instrument);expect(result.ok).toBe(true);expect(result.account.cash).toBe(3499);expect(result.account.positions[ctx.instrument.id].quantity).toBe(-25);
 result=processPaperQuote(result.account,{...ctx.quote,bid:97.25,ask:97.5,sequence:3,eventTime:1002,availableAt:1002,receivedAt:1002},1002,result.account.runId,ctx.instrument);expect(result.ok).toBe(true);expect(result.account.cash).toBe(2523);expect(result.account.positions[ctx.instrument.id].quantity).toBe(-15);expect(result.account.realizedGross).toBe(25);expect(result.account.fees).toBe(2);expect(paperSummary(result.account,1002).equity).toBe(1060.5);expect(restorePaperAccount(result.account)).toEqual(result.account);
});
