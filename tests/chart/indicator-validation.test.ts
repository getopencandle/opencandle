import {expect,it} from 'vitest';
import {validateIndicatorSnapshots,validateIndicatorSettings,indicatorEstimatedWork,INDICATOR_WORK_LIMIT} from '../../src/chart/indicator-settings';
import {defaultPlotStyle,evaluateDomainIndicator,renderIndicatorSeries} from '../../src/chart/indicator-port';
const valid=()=>({id:'one',kind:'sma',inputs:{length:3,source:'close'},plots:{sma:defaultPlotStyle('sma','sma',0)},offset:0,visible:true,paneId:'price'});
it('accepts portable settings and rejects unsupported input, plot, styling and ownership fields',()=>{
 expect(()=>validateIndicatorSnapshots([valid()])).not.toThrow();
 const invalid=[{...valid(),extra:true},{...valid(),inputs:{length:2,source:'plot:other'}},{...valid(),plots:{wrong:defaultPlotStyle('sma','sma',0)}},{...valid(),paneId:'\n'}, {...valid(),offset:100001}];
 for(const record of invalid)expect(()=>validateIndicatorSnapshots([record])).toThrow();
 for(const patch of [{color:'url(https://example.invalid)'},{color:'rgba(1,2,3,4)'},{width:Infinity},{width:21},{dataWindow:1},{legend:undefined},{extra:true}])expect(()=>validateIndicatorSnapshots([{...valid(),plots:{sma:{...defaultPlotStyle('sma','sma',0),...patch}}}])).toThrow();
 expect(()=>validateIndicatorSettings({...valid(),paneId:undefined})).toThrow();
 expect(()=>validateIndicatorSnapshots([valid(),valid()])).toThrow(/Duplicate/);
});
it('work estimate includes literal window loops and rejects excess before reading bar data',()=>{
 // The earlier 482500/212200 literals predate bounded deviation fallback and the two SMA legs.
 expect(indicatorEstimatedWork('bb',1000,{length:100,basisType:'WMA'})).toBe(662700);
 expect(indicatorEstimatedWork('stochastic',1000,{length:100})).toBe(340200);
 expect(indicatorEstimatedWork('atr',1000,{length:100,smoothing:'WMA'})).toBe(122100);
 const inaccessible=new Proxy(new Array(100000),{get(target,key,receiver){if(key==='length')return target.length;throw new Error('BAR DATA MUST NOT BE READ');}});
 for(const kind of ['bb','stochastic','atr'] as const){const result=evaluateDomainIndicator(kind,inaccessible,{length:50000,...(kind==='atr'?{smoothing:'WMA'}:{})});expect(result.series).toEqual([]);expect(result.diagnostics[0]).toContain('operation limit');}
 expect(indicatorEstimatedWork('sma',100000,{length:100000})).toBeLessThan(INDICATOR_WORK_LIMIT);
});
it('rejects offsets outside supported dates without emitting invalid timestamps',()=>{
 const bar={time:253402300799,open:1,high:1,low:1,close:1,volume:1};
 const result=evaluateDomainIndicator('sma',[bar],{length:1});
 expect(()=>renderIndicatorSeries('one','sma',result,[bar],{},1)).toThrow(/time coordinates/);
 expect(()=>renderIndicatorSeries('one','sma',result,[bar],{},100001)).toThrow(/offset/);
 expect((renderIndicatorSeries('one','sma',result,[bar],{},0)[0] as any).points).toEqual([{time:253402300799000,value:1}]);
});
