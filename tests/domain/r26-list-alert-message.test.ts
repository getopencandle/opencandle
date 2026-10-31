import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';
import type {AlertCondition} from '../../src/domain/alerts';
import {clearListAlertHistory,createListAlert,evaluateListAlert,restartListAlert,restoreListAlerts} from '../../src/domain/watchlist-alerts';
import {addWatchList,createWatchBook,referenceFromDataset,type WatchBook} from '../../src/watchlists/model';
import {addWatchMembers} from '../../src/watchlists/membership';
import {listAlertLogEntries} from '../../src/ui/alerts-dock-model';

// SYNTHETIC hand-written closes.: list (watchlist) alert messages fill the local placeholders per member.
const T0=1767225600,DAY=86400;let serial=0;const id=()=>'r26m'+(++serial);
function source(symbol:string,closes:number[]):BarDataset{
 const base=fixtureDataset(symbol,closes.length);
 return{...base,resolution:'1D',instrument:{...base.instrument,id:'NYSE:'+symbol,exchange:'NYSE'},provenance:{...base.provenance,providerId:'wl-test',providerName:'Synthetic test input',datasetId:'wl:NYSE:'+symbol,fixture:false,session:'regular',state:'ready'},bars:closes.map((close,index)=>({time:T0+index*DAY,open:close-1,high:close+1,low:close-2,close,volume:100+index}))};
}
const grow=(dataset:BarDataset,close:number):BarDataset=>({...dataset,bars:[...dataset.bars,{time:dataset.bars.at(-1)!.time+DAY,open:close-1,high:close+1,low:close-2,close,volume:7}]});
const bookOf=(datasets:BarDataset[]):WatchBook=>addWatchMembers(addWatchList(createWatchBook([]),'L','Mine'),'L',datasets.map(referenceFromDataset),id).book;

it('fills {{ticker}}, {{exchange}}, {{close}}, {{volume}} and {{time}} from each triggering member and keeps {{timenow}} as typed',()=>{
 const a=source('AAA',[9]),b=source('BBB',[9]),book=bookOf([a,b]);
 const alert=createListAlert({id:'la',listId:'L',name:'Cross 10',message:'{{exchange}}:{{ticker}} closed {{close}} vol {{volume}} at {{time}} ({{timenow}}) {{unknown}}',condition:{kind:'crossing-up',value:10} as AlertCondition,frequency:'every-time',session:'regular',createdAt:T0,expiresAt:null},[],book,[a,b]);
 const result=evaluateListAlert(alert,book,[grow(a,11),grow(b,12)]);
 expect(result.notifications.map(row=>row.message)).toEqual([
  'NYSE:AAA closed 11 vol 7 at 2026-01-02T00:00:00Z ({{timenow}}) {{unknown}}',
  'NYSE:BBB closed 12 vol 7 at 2026-01-02T00:00:00Z ({{timenow}}) {{unknown}}',
 ]);
 // The saved alert keeps the template; only the notification is rendered.
 expect(result.alert.message).toContain('{{ticker}}');
 // The panel log rebuilds the message from the saved trigger (member, close, bar time); bar fields it does not keep stay as typed.
 expect(listAlertLogEntries([result.alert]).map(row=>[row.symbol,row.message])).toEqual([
  ['AAA','NYSE:AAA closed 11 vol {{volume}} at 2026-01-02T00:00:00Z ({{timenow}}) {{unknown}}'],
  ['BBB','NYSE:BBB closed 12 vol {{volume}} at 2026-01-02T00:00:00Z ({{timenow}}) {{unknown}}'],
 ]);
 const cleared=clearListAlertHistory([result.alert]);
 expect(cleared[0].history).toEqual([]);expect(cleared[0].members).toEqual(result.alert.members);
 expect(restoreListAlerts(cleared)).toHaveLength(1);
});
it('restarts a completed list alert from fresh baselines, an expired one open-ended, and refuses an active one or a deleted list',()=>{
 const a=source('AAA',[9]),book=bookOf([a]);
 const alert=createListAlert({id:'lb',listId:'L',name:'Once',message:'',condition:{kind:'crossing-up',value:10} as AlertCondition,frequency:'only-once',session:'regular',createdAt:T0,expiresAt:null},[],book,[a]);
 expect(()=>restartListAlert(alert,book)).toThrow(/completed, expired or stopped/);
 const done=evaluateListAlert(alert,book,[grow(a,11)]).alert;expect(done.status).toBe('completed');
 const again=restartListAlert(done,book);
 expect(again.status).toBe('active');expect(again.members[0]).toMatchObject({status:'waiting-for-data',triggers:1,baselineTime:null});expect(again.history).toEqual(done.history);
 // No trigger for the gap: the next evaluation only re-baselines on the latest bar.
 expect(evaluateListAlert(again,book,[grow(a,11)]).notifications).toEqual([]);
 const expired=restartListAlert({...done,status:'expired',expiresAt:T0+DAY},book);expect(expired.expiresAt).toBeNull();expect(restoreListAlerts([expired])).toHaveLength(1);
 expect(()=>restartListAlert(done,addWatchList(createWatchBook([]),'Other','Other'))).toThrow(/deleted/);
});
