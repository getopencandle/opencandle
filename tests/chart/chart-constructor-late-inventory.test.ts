import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it} from 'vitest';
import {Vela} from '@luxalgo/vela';
import {attemptEveryCleanup} from '../../src/chart/chart-retirement';

/** Runs the actual old/new pre-setup and catch bodies; an old source has no owner wrapper, rather than a missing import. */
it('a later constructor fault drains the actual registered inventory before native destruction and preserves the initial fault',()=>{
 const source=readFileSync(process.env.LV_CONSTRUCTOR_SOURCE_ROOT?resolve(process.env.LV_CONSTRUCTOR_SOURCE_ROOT,'src/chart/adapter.ts'):new URL('../../src/chart/adapter.ts',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const begin=source.indexOf('  const chart = new Vela('),lineEnd=source.indexOf('\n',begin),boundary=source.indexOf('  // OpenCandle draws its own per-pane legend',lineEnd);
 const declaration=source.match(/^  let disposed = false(?:,destroyStarted=false)?;$/m)?.[0];
 const catchStart=source.lastIndexOf('  } catch(error) {'),catchEnd=source.indexOf('    throw error;',catchStart);
 if(begin<0||lineEnd<0||boundary<0||!declaration||catchStart<0||catchEnd<0)throw Error('Actual constructor lifetime boundary changed.');
 const preSetup=source.slice(lineEnd+1,boundary).replace(declaration+'\n','');
 const releaseStart=source.indexOf('  let chartResourcesReleased=false;'),releaseEnd=source.indexOf('  // Saved drawing tool defaults (Save as default)',Math.max(0,releaseStart));
 const registeredRelease=releaseStart<0?'':source.slice(releaseStart,releaseEnd);
 if(releaseStart>=0&&releaseEnd<releaseStart)throw Error('Actual registered inventory boundary changed.');
 const failure=source.slice(catchStart+'  } catch(error) {'.length,catchEnd)+'throw error;';
 const code=stripTypeScriptTypes(`function construct(chart,trace,attemptEveryCleanup){
 ${declaration}
 ${preSetup}
 const unsubscribes=[()=>trace.push('session:'+disposed),()=>trace.push('scale:'+disposed)];
 ${registeredRelease}
 const dwb3Consumers={dispose(){}},retireDrawingWorkspaceBinding=()=>{},vwapPrefixSource=null,fullModels=null,statsSource=null,statsPainter=null,fibTrendLine=null,inlineEditor=null,inlineGeometry=null,nativeDrawingReset=null,drawingCommands=null,trendlineAnnotation=null,indicatorDisplay=null,disposeAppearancePainters=null;
 return{fail(error){${failure}},remaining:()=>unsubscribes.length,disposed:()=>disposed};
 }`,{mode:'transform'});
 const trace:string[]=[],orchestrator={destroy(){trace.push('native');}},chart=Object.create(Vela.prototype);
 Object.defineProperty(chart,'orchestrator',{value:orchestrator});
 const lifetime=new Function(code+';return construct;')()(chart,trace,attemptEveryCleanup),fault=Error('SYNTHETIC late constructor failure');
 expect(()=>lifetime.fail(fault)).toThrow(fault);
 expect(trace).toEqual(['session:true','scale:true','native']);
 expect(lifetime.remaining()).toBe(0);expect(lifetime.disposed()).toBe(true);
});
