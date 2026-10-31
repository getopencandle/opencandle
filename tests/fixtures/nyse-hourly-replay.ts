import type {Bar,BarDataset} from '../../src/domain/types';
import {openReplay,selectReplayStart} from '../../src/domain/replay-session';
export const HOURLY_FRIDAY=1709908200,HOURLY_MONDAY=1710163800,HOURLY_MONDAY_CLOSE=1710187200;
export function hourlyReplayDataset(start=HOURLY_FRIDAY,count=7):BarDataset{
 const day=(open:number,price:number):Bar[]=>Array.from({length:count},(_,index)=>({time:open+index*3600,open:price-2,high:price+3,low:price-4,close:price,volume:10}));
 return{instrument:{id:'SYNTHETIC:hourly:GME',symbol:'GME',name:'Synthetic hourly replay',exchange:'NYSE',currency:'USD',assetClass:'stock',tickSize:.01,lotSize:1,timezone:'America/New_York'},resolution:'60m',bars:start===HOURLY_FRIDAY?[...day(start,110),...day(HOURLY_MONDAY,130)]:day(start,130),provenance:{providerId:'synthetic-local',providerName:'Synthetic hourly fixture',datasetId:'SYNTHETIC:hourly',fixture:true,coverage:'Invented hourly candles',asOf:HOURLY_MONDAY_CLOSE,delaySeconds:null,adjustment:'raw',session:'regular',timezone:'America/New_York',state:'ready',license:'Original synthetic test prices; no network or account.',revision:'SYNTHETIC:hourly:1',notes:['Synthetic fixture']}};
}
export function hourlyParticipant(data:BarDataset,cellId='hourly'){
 return{cellId,instrumentId:data.instrument.id,symbol:data.instrument.symbol,interval:data.resolution,chartType:'candles',datasetId:data.provenance.datasetId,revision:data.provenance.revision};
}
export function selectHourlyReplay(data:BarDataset,time=data.bars[0].time){
 return selectReplayStart(openReplay({participants:[hourlyParticipant(data)],activeCellId:'hourly',sessionId:'SYNTHETIC:hourly-session'}),data,time,'60m');
}
export function selectHourlySecondClock(data:BarDataset,end=HOURLY_MONDAY_CLOSE){
 const clock:BarDataset={...data,resolution:'1s',bars:Array.from({length:3},(_,index)=>({time:end-2+index,open:160,high:161,low:159,close:160,volume:1})),provenance:{...data.provenance,datasetId:'SYNTHETIC:hourly-second-clock',revision:'SYNTHETIC:clock:1'}};
 const session=selectReplayStart(openReplay({participants:[hourlyParticipant(data),hourlyParticipant(clock,'clock')],activeCellId:'clock',scope:'all',sessionId:'SYNTHETIC:hourly-second-session'}),clock,clock.bars[0].time,'1s');
 return{clock,session};
}
