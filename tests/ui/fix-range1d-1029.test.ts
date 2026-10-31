import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
// A live bottom range that switches the feed (1D opens 1m) while the routine background autosave holds the
// storage lock was queued by deferSwitch, and the range click then cleared pendingRange (queuedSwitch was set). The switch ran
// after the save with no range, so the 1m chart kept the carried 1D bar spacing: 3 one-minute bars. The range is now pinned
// to the new feed by a callback that runs when the switch itself runs. deferSwitch and applyLiveInterval are taken from
// App.tsx (signatures untyped) and run against fakes.
const app=readFileSync('src/ui/App.tsx','utf8').replace(/\r\n/g,'\n');
function fn(name:string,next:string){const start=app.indexOf(' function '+name+'(');const end=app.indexOf(next,start);if(start<0||end<0)throw Error(name);return app.slice(start,end);}
const DEFER_END='return true;'+String.fromCharCode(10)+' }',deferStart=app.indexOf(' function deferSwitch('),deferEnd=app.indexOf(DEFER_END,deferStart)+DEFER_END.length;
const deferBody=app.slice(deferStart,deferEnd);
const live=fn('applyLiveInterval',' function switchInterval(');
const range=fn('rangeFromBottomToolbar',' function toggleIntervalMenu(');
// Only the two signatures carry types; they are replaced with untyped ones.
const untyped=(text:string,name:string,params:string,signatureEnd:string)=>{const at=text.indexOf('function '+name+'('),end=text.indexOf(signatureEnd,at);if(at<0||end<0)throw Error(name);return text.slice(0,at)+'function '+name+'('+params+'){'+text.slice(end+signatureEnd.length);};
const js=[untyped(deferBody,'deferSwitch','label,run,settle','):boolean{'),untyped(live,'applyLiveInterval','interval,intervals,opened','=>void){'),'return {deferSwitch,applyLiveInterval};'].join(String.fromCharCode(10));
const make=new Function('h',`const {storageMutation,queuedSwitch,afterStorageWrite,setMessage,dataset,isLiveDatasetId,openLive,current,commit,leaveRangeStyle,switchers}=h;${js}`) as (h:any)=>{deferSwitch:Function;applyLiveInterval:(interval:string,intervals:unknown,opened?:()=>void)=>boolean};
function harness(busy:boolean){
 const waiters:Array<()=>void>=[],messages:string[]=[],h:any={storageMutation:{current:busy},queuedSwitch:{current:null},afterStorageWrite:(run:()=>void)=>waiters.push(run),setMessage:(m:string)=>messages.push(m),
  dataset:{provenance:{datasetId:'live:coinbase-public:BTC-USD:1D',providerId:'coinbase-public'},instrument:{symbol:'BTC-USD'}},isLiveDatasetId:(id:string)=>id.startsWith('live:'),
  current:{current:{sourceId:'live:coinbase-public:BTC-USD:1D',intervals:{}}},commit:vi.fn(()=>true),leaveRangeStyle:()=>({}),switchers:{current:null}};
 h.openLive=vi.fn((_p:string,_s:string,interval:string)=>{h.current.current.sourceId='live:coinbase-public:BTC-USD:'+interval;return true;});
 const fns=make(h);h.switchers.current=fns;
 const endSave=()=>{h.storageMutation.current=false;for(const run of waiters.splice(0))run();};
 return {h,fns,messages,endSave};
}
it('the extracted App functions keep the contract this test relies on',()=>{
 expect(deferBody).toContain('queuedSwitch.current=token;');expect(live).toContain('opened?:()=>void');
 expect(live).toContain('switchers.current.applyLiveInterval(interval,intervals,opened)');expect(live).toContain('opened?.();return true;}');
 expect(range).toContain('applyLiveInterval(interval,current.current.intervals,()=>{const id=current.current.sourceId;pendingRange.current=typeof id===\'string\'?{preset,interval,datasetId:id}:null;});');
 expect(range).not.toContain('!queuedSwitch.current?{preset');
});
it('no save running: the feed opens and the range is pinned to it at once',()=>{
 const {h,fns}=harness(false),opened=vi.fn(()=>h.current.current.sourceId);
 expect(fns.applyLiveInterval('1m',{},opened)).toBe(true);
 expect(opened).toHaveBeenCalledTimes(1);expect(opened.mock.results[0].value).toBe('live:coinbase-public:BTC-USD:1m');
});
it('a switch queued behind the background save pins the range to the NEW feed when the switch runs (was dropped)',()=>{
 const {h,fns,messages,endSave}=harness(true),seen:string[]=[];
 expect(fns.applyLiveInterval('1m',{},()=>seen.push(h.current.current.sourceId))).toBe(true);
 expect(h.openLive).not.toHaveBeenCalled();expect(seen).toEqual([]);expect(messages.at(-1)).toMatch(/once the background save finishes/);
 endSave();
 expect(h.openLive).toHaveBeenCalledTimes(1);expect(seen).toEqual(['live:coinbase-public:BTC-USD:1m']);expect(messages.at(-1)).toBe('Switched to BTC-USD 1m.');
});
it('a queued switch replaced by a newer one never pins the older range',()=>{
 const {h,fns,endSave}=harness(true),first=vi.fn(),second=vi.fn(()=>h.current.current.sourceId);
 fns.applyLiveInterval('1m',{},first);fns.applyLiveInterval('5m',{},second);endSave();
 expect(first).not.toHaveBeenCalled();expect(second).toHaveBeenCalledTimes(1);expect(second.mock.results[0].value).toBe('live:coinbase-public:BTC-USD:5m');
});
it('a feed that fails to open never pins the range',()=>{
 const {h,fns}=harness(false),opened=vi.fn();h.openLive.mockImplementation(()=>false);
 expect(fns.applyLiveInterval('1m',{},opened)).toBe(false);expect(opened).not.toHaveBeenCalled();
});
