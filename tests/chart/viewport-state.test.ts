import {it,expect} from 'vitest';
import {createViewportCapture,linkedViewportIds} from '../../src/chart/viewport-state';
import {createLayoutSnapshot} from '../../src/chart/layout-port';
import {validateViewport} from '../../src/chart/inspection';
it('passive native resize/first paint/restore do not create persistence or undo commands',()=>{
 const saved:any[]=[];let callback=()=>{},live={from:1,to:3};const capture=createViewportCapture({read:()=>({...live}),commit:range=>saved.push(range),schedule:fn=>{callback=fn;return 1 as any;},cancel:()=>{}});
 // The gesture now moves the viewport; a gesture that leaves it unchanged commits nothing (tests/chart/bugfix-k-viewport-empty-gesture.test.ts).
 capture.changed();expect(saved).toEqual([]);capture.begin();live={from:1,to:4};capture.changed();capture.finish();callback();expect(saved).toEqual([{from:1,to:4}]);capture.changed();expect(saved).toHaveLength(1);capture.stop();
});
it('explicit navigation commands persist exact increasing second boundaries and disposed captures stay inert',()=>{
 const saved:any[]=[];const capture=createViewportCapture({read:()=>({from:123.125,to:456.25}),commit:range=>saved.push(range)});capture.command();expect(saved).toEqual([{from:123.125,to:456.25}]);capture.stop();capture.command();expect(saved).toHaveLength(1);
 expect(()=>validateViewport({from:NaN,to:1})).toThrow();expect(()=>validateViewport({from:2,to:2})).toThrow();expect(()=>validateViewport({from:2,to:1})).toThrow();
});
it('linked viewport persistence groups only declared time/date-range targets',()=>{
 const layout=createLayoutSnapshot(3,{cellIds:['a','b','c']});layout.cells[2].group='other';expect(linkedViewportIds(layout,'a')).toEqual(['a']);layout.sync.time=true;expect(linkedViewportIds(layout,'a')).toEqual(['a','b']);layout.sync.time=false;layout.sync.dateRange=true;expect(linkedViewportIds(layout,'a')).toEqual(['a','b']);expect(()=>linkedViewportIds(layout,'missing')).toThrow();
});
