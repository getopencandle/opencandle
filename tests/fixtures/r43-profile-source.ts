import type {Bar,BarDataset} from '../../src/domain/types';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {profileSourceContext,setProfileDatasets} from '../../src/chart/vp-visible-range-ltf';
export const T=Date.UTC(2026,0,1)/1000;
export const rows:Bar[]=Array.from({length:12},(_,index)=>({time:T+index*86400,open:15,high:20,low:10,close:15,volume:100}));
export const finerRows:Bar[]=Array.from({length:4},(_,index)=>({time:T+index*3600,open:11,high:11.2,low:11,close:11.1,volume:10000}));
export function source(resolution='1D',bars=rows,id='local:SYNTHETIC-primary:1D'):BarDataset{return{instrument:{id:'SYNTHETIC:SHARED',symbol:'SHARED',name:'SYNTHETIC source isolation',exchange:'SYNTHETIC',currency:'USD',assetClass:'crypto',tickSize:.01,lotSize:1,timezone:'UTC'},resolution,bars,provenance:{providerId:'SYNTHETIC-local-provider',providerName:'SYNTHETIC local source',datasetId:id,fixture:true,coverage:'SYNTHETIC matched observation basis',asOf:0,delaySeconds:0,adjustment:'raw',session:'all',timezone:'UTC',state:'ready',license:'SYNTHETIC',revision:'SYNTHETIC-revision:'+resolution,notes:[]}};}
export function fixtures(){const primary=source('1D',rows.map(row=>({...row}))),fine=source('60m',finerRows.map(row=>({...row})),'local:SYNTHETIC-finer:60m'),foreign=source('60m',finerRows.map(row=>({...row,open:19,high:19.2,low:19,close:19.1})),'live:SYNTHETIC-foreign:60m');foreign.provenance.providerId='SYNTHETIC-live-provider';foreign.provenance.providerName='SYNTHETIC foreign live source';return{primary,fine,foreign};}
export function publish(primary:BarDataset,list:BarDataset[]){setProfileDatasets(list);return profileSourceContext(sourceContextForDataset(primary),primary.bars);}
