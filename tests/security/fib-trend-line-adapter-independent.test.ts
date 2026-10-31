import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it} from 'vitest';

function fixture(){
 const text=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n');
 const start=text.indexOf('  if(rendererHolder.current){\n    try{fibTrendLine=installFibTrendLine'),end=text.indexOf('  if(rendererHolder.current)statsSource=',start);
 const setter=text.match(/setExecutionIdentity:\(identity:string\)=>\{[^\n]+\},/);
 const retire=text.match(/  const retireVwapSource=\(\)=>\{[^\n]+\};/);
 const retireStatistics=text.match(/  const retireStatisticsSource=\(\)=>\{[^\n]+\};/);
 if(start<0||end<0||!setter||!retire||!retireStatistics)throw Error('Review actual baseline installer and execution setter boundaries.');
 const code=`let host;const rendererHolder={current:{}},chart={},document={},captureFibTrendLineNativeOwner=()=>{},captureNativeInlineLayoutOwner=()=>{},installFibTrendLine=(_r,_c,h)=>{host=h;return{};};
 let fibTrendLine=null,currentSource={},currentBars=[],requestedStyle='candles',statsSourceEpoch={},currentExecutionIdentity='A',disposed=false,analysisUnavailable='',vwapSourceEpoch={};
 const indicators={invalidateVwap(){},recompute(){}},unavailable=()=>{};
 ${retireStatistics[0]}
 ${retire[0]}
 ${text.slice(start,end)}
 const controller={${setter[0]}};return{capture:()=>host.captureOwner(),set:controller.setExecutionIdentity};`;
 return new Function('return '+stripTypeScriptTypes('(function(){'+code+'})',{mode:'strip'}))()();
}
it('an observed old baseline source lease stays retired across actual execution A to B to A',()=>{
 const api=fixture();
 const old=api.capture();old();api.set('B');expect(old).toThrow();api.set('A');
 expect(old).toThrow();
 const fresh=api.capture();expect(fresh).not.toThrow();
});
it('the actual same-execution setter remains a source-lease no-op',()=>{
 const api=fixture(),proof=api.capture();api.set('A');expect(proof).not.toThrow();
});
it('a failed changed-execution attempt retires the old baseline source before rejection',()=>{
 const api=fixture(),proof=api.capture();expect(()=>api.set('')).toThrow('identity is invalid');expect(proof).toThrow();
});
