import {createVwapClient} from './client';
import type {VwapClient} from './types';

let client:VwapClient|null=null,retired=false;
/** One budget and failure domain for all charts and local technical alerts. */
export function applicationVwapClient():VwapClient{
 if(retired)throw Error('The application VWAP service is retired.');
 return client??=createVwapClient();
}
export function disposeApplicationVwapClient():void{
 if(retired)return;retired=true;
 const owned=client;client=null;owned?.dispose();
}
