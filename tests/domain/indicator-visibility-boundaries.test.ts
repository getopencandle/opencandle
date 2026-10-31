import {expect,it} from 'vitest';
import {restoreScriptBindings} from '../../src/ui/script-library';
import {createScriptPort,renderScriptPlots} from '../../src/chart/script-port';
import {createComparisonPort,validateComparisonSettings,type ComparisonSettings} from '../../src/chart/compare-port';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultIndicatorPresentation} from '../../src/chart/indicator-settings';

const visibility={schemaVersion:1,mode:'include',intervals:['1D'],ranges:[]};
const presentation={...defaultIndicatorPresentation('sma'),visibility};
const style={visible:true,color:'#123456',width:1,lineStyle:'solid',kind:'line',priceScale:true,legend:true,dataWindow:true} as const;
const binding={id:'script',name:'Script',source:'ctx.plot("close",ctx.bar.close);',pane:'price',documentId:'document',version:1,visible:true,plots:{value:style}};

it('rejects built-in-only interval presentation at script binding and plot recovery boundaries',()=>{
 expect(restoreScriptBindings([binding])).toHaveLength(1);
 for(const extra of [{visibility},{presentation},{visibility:undefined},{presentation:null}]){
  expect(()=>restoreScriptBindings([{...binding,...extra}])).toThrow(/built-in|unsupported/i);
  expect(()=>restoreScriptBindings([{...binding,plots:{value:{...style,...extra}}}])).toThrow(/built-in|unsupported/i);
 }
 let reads=0;const hostile={...binding,get visibility(){reads++;return visibility;}};expect(()=>restoreScriptBindings([hostile])).toThrow(/built-in|unsupported/i);expect(reads).toBe(0);
});

it('rejects script native creation before mutation instead of ignoring built-in settings',()=>{
 let calls=0;const port=createScriptPort({addNativeIndicator(){calls++;throw Error('Unexpected native mutation');}} as any);
 try{for(const extra of [{visibility},{presentation}]){
  expect(()=>port.add({plots:[]},extra as any)).toThrow(/built-in|unsupported/i);
  expect(()=>renderScriptPlots('script',[{id:'value',title:'Value',color:'#123456',values:[{time:1,value:2}]}],{value:{...style,...extra}},1)).toThrow(/unsupported/i);
 }expect(calls).toBe(0);}finally{port.dispose();}
});

it('rejects comparison settings, add and restore before native mutation',()=>{
 const dataset=fixtureDataset('GME',3),base:ComparisonSettings={id:'comparison',dataset,mode:'absolute',color:'#123456',width:1,visible:true,baseline:'first-loaded-match'};validateComparisonSettings(base);
 let calls=0;const port=createComparisonPort({addNativeIndicator(){calls++;throw Error('Unexpected native mutation');}} as any);
 try{for(const extra of [{visibility},{presentation},{visibility:undefined},{presentation:null}]){
  expect(()=>validateComparisonSettings({...base,...extra})).toThrow(/built-in|unsupported/i);
  expect(()=>port.add(dataset,{id:'comparison',...extra})).toThrow(/built-in|unsupported/i);
  expect(()=>port.restore([{...base,...extra}])).toThrow(/built-in|unsupported/i);
 }let reads=0;const hostile={...base,get presentation(){reads++;return presentation;}};expect(()=>validateComparisonSettings(hostile)).toThrow(/built-in|unsupported/i);expect(reads).toBe(0);expect(calls).toBe(0);}finally{port.dispose();}
});
