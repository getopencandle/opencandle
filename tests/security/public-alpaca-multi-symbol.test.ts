import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {AlpacaMarketData}=require('../../electron/public-alpaca.cjs');

// Synthetic key material and a fake socket. The free plan allows one stream connection, so every live
// chart symbol is multiplexed over that one socket by subscription diffs.
const KEY_ID='SYNTHETICKEY0000ABCD',SECRET='SyntheticSecretNotARealKey0000000000000000';
class MemoryKeys{async load(){return{keyId:KEY_ID,secret:SECRET};}}
class FakeSocket{
 static all:FakeSocket[]=[];sent:any[]=[];closed=false;onopen:any;onmessage:any;onclose:any;onerror:any;
 constructor(public url:string){FakeSocket.all.push(this);}
 send(text:string){this.sent.push(JSON.parse(text));}close(){this.closed=true;}
 open(){this.onopen?.({});}message(value:unknown){this.onmessage?.({data:JSON.stringify(value)});}
}
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
beforeEach(()=>{FakeSocket.all=[];vi.useFakeTimers();vi.setSystemTime(Date.UTC(2026,9,20,15,0,0));});
afterEach(()=>vi.useRealTimers());

it('several live charts share one Alpaca socket: symbols are added and removed by subscription diffs',async()=>{
 const events:any[]=[],client=new AlpacaMarketData({keys:new MemoryKeys(),WebSocketImpl:FakeSocket,emit:(e:any)=>events.push(e),random:()=>1,fetchImpl:vi.fn()});
 try{
  await client.subscribe({symbols:['AAPL']});await flush();const socket=FakeSocket.all[0];socket.open();socket.message([{T:'success',msg:'connected'}]);
  // A second chart opens while the session is still authenticating: the subscribe after auth carries both symbols.
  await client.subscribe({symbols:['AAPL','MSFT']});
  socket.message([{T:'success',msg:'authenticated'}]);
  expect(socket.sent.at(-1)).toEqual({action:'subscribe',bars:['AAPL','MSFT'],updatedBars:['AAPL','MSFT'],dailyBars:['AAPL','MSFT'],trades:['AAPL','MSFT']});
  await client.subscribe({symbols:['AAPL','MSFT','NVDA']});
  expect(socket.sent.at(-1)).toEqual({action:'subscribe',bars:['NVDA'],updatedBars:['NVDA'],dailyBars:['NVDA'],trades:['NVDA']});
  await client.subscribe({symbols:['AAPL','NVDA']});
  expect(socket.sent.at(-1)).toEqual({action:'unsubscribe',bars:['MSFT'],updatedBars:['MSFT'],dailyBars:['MSFT'],trades:['MSFT']});
  // A message still in flight for the removed symbol is dropped; the shared stream stays up.
  socket.message([{T:'t',S:'MSFT',i:1,x:'V',p:10,s:1,t:'2026-10-20T14:59:30Z',z:'C'}]);
  expect(socket.closed).toBe(false);expect(FakeSocket.all).toHaveLength(1);expect(client.status().symbols).toEqual(['AAPL','NVDA']);
 }finally{client.close();}
});
