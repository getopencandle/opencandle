import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it} from 'vitest';
import {attemptEveryCleanup} from '../../src/chart/chart-retirement';

function setup(){
 const text=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n'),trace:string[]=[];let prefixRetired=false,prefixRetiredBeforeBridge=false;
 const item=(name:string)=>({dispose(){if(name==='bridge')prefixRetiredBeforeBridge=prefixRetired;trace.push(name);}});
 const injected={dwb3Consumers:{dispose(){}},attemptEveryCleanup,retireDrawingWorkspaceBinding:()=>{},vwapPrefixSource:{dispose(){prefixRetired=true;}},fullModels:item('bridge'),statsSource:item('stats-source'),statsPainter:item('stats-painter'),fibTrendLine:item('fib-baseline'),inlineEditor:item('editor'),inlineGeometry:item('geometry'),nativeDrawingReset:item('reset'),drawingCommands:item('commands'),trendlineAnnotation:item('annotation'),indicatorDisplay:item('display'),disposeAppearancePainters:()=>trace.push('appearance'),chart:{destroy(){trace.push('chart');}}};
 const prelude=`const {dwb3Consumers,attemptEveryCleanup,retireDrawingWorkspaceBinding,vwapPrefixSource,fullModels,statsSource,statsPainter,fibTrendLine,inlineEditor,inlineGeometry,nativeDrawingReset,drawingCommands,trendlineAnnotation,indicatorDisplay,disposeAppearancePainters,chart}=injected;`;
 const run=(body:string)=>new Function('return '+stripTypeScriptTypes('(function(injected){'+prelude+body+'})',{mode:'strip'}))()(injected);
 return{text,trace,run,prefixRetiredBeforeBridge:()=>prefixRetiredBeforeBridge};
}

it('actual adapter retirement revokes the full-model bridge before external editor cleanup',()=>{
 const x=setup(),start=x.text.indexOf('  disposeChart=()=>{'),end=x.text.indexOf(';return {controller,dispose:disposeChart};',start);if(start<0||end<0)throw Error('Review current adapter disposal extraction.');
 x.run(`let disposed=false,disposeChart;const navigationSubscribers=new Set(),drawingSubscribers=new Set(),availabilitySubscribers=new Set(),unsubscribes=[],contextMenus=null,rendererDrawingPort=null,originalDrawingSync=null,drawingPreferences={dispose(){}},indicators={dispose(){}},scripts={dispose(){}},comparisons={dispose(){}},container={style:{}},originalBackground='';${x.text.slice(start,end+1)}disposeChart();`);
 expect(x.trace[0]).toBe('bridge');expect(x.trace.indexOf('stats-source')).toBe(1);expect(x.trace.indexOf('stats-painter')).toBe(2);expect(x.trace.indexOf('stats-source')).toBeLessThan(x.trace.indexOf('stats-painter'));expect(x.trace.indexOf('stats-painter')).toBeLessThan(x.trace.indexOf('editor'));expect(x.trace.indexOf('editor')).toBeLessThan(x.trace.indexOf('geometry'));expect(x.trace.indexOf('geometry')).toBeLessThan(x.trace.indexOf('annotation'));
 expect(x.prefixRetiredBeforeBridge()).toBe(true);
 expect(x.trace.indexOf('fib-baseline')).toBe(3);expect(x.trace.indexOf('stats-painter')).toBeLessThan(x.trace.indexOf('fib-baseline'));expect(x.trace.indexOf('fib-baseline')).toBeLessThan(x.trace.indexOf('editor'));expect(x.trace.indexOf('fib-baseline')).toBeLessThan(x.trace.indexOf('annotation'));
});

it('actual failed-constructor cleanup revokes the bridge before external editor cleanup',()=>{
 const x=setup(),start=x.text.lastIndexOf('  } catch(error) {'),end=x.text.indexOf('    throw error;',start);if(start<0||end<0)throw Error('Review current constructor cleanup extraction.');
 expect(()=>x.run(`const error=Error('SYNTHETIC original constructor fault');${x.text.slice(start+'  } catch(error) {'.length,end)}throw error;`)).toThrow('SYNTHETIC original constructor fault');
 expect(x.trace[0]).toBe('bridge');expect(x.trace.indexOf('stats-source')).toBe(1);expect(x.trace.indexOf('stats-painter')).toBe(2);expect(x.trace.indexOf('stats-source')).toBeLessThan(x.trace.indexOf('stats-painter'));expect(x.trace.indexOf('stats-painter')).toBeLessThan(x.trace.indexOf('editor'));expect(x.trace.indexOf('editor')).toBeLessThan(x.trace.indexOf('geometry'));
 expect(x.prefixRetiredBeforeBridge()).toBe(true);
 expect(x.trace.indexOf('fib-baseline')).toBe(3);expect(x.trace.indexOf('stats-painter')).toBeLessThan(x.trace.indexOf('fib-baseline'));expect(x.trace.indexOf('fib-baseline')).toBeLessThan(x.trace.indexOf('editor'));expect(x.trace.indexOf('fib-baseline')).toBeLessThan(x.trace.indexOf('annotation'));
});
