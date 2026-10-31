import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';

// LOCK/UNLOCK gap (spec 3.6): the selected-drawing edit bar Lock must go through
// drawingManager.set (one owned history step), not the native-only chart.drawings.lock.
// The handler text is extracted from App.tsx and executed against stubs, so the assertion is on
// the real shipped expression. This test is expected to fail until root applies the App.tsx diff
// in (it is the failing-first proof).
const source=readFileSync('src/ui/App.tsx','utf8').replace(/\r\n/g,'\n');
function extractLock(){
 const start=source.indexOf('<DrawingEditBar '),lock=source.indexOf('onLock={',start),end=source.indexOf('} onDuplicate=',lock);
 if(start<0||lock<0||end<0)throw Error('Edit bar Lock handler boundary changed');
 return source.slice(lock+'onLock={'.length,end);
}
it('the edit bar Lock routes through the drawing manager and never the native-only lock',()=>{
 const handler=extractLock(),nativeLock=vi.fn(),managerSet=vi.fn();
 const chart={drawings:{lock:nativeLock},drawingManager:{set:managerSet}},drawings=[{id:'line-a',locked:false}],selectedDrawing='line-a';
 const run=new Function('chart','drawings','selectedDrawing','drawingAction',`return (${handler});`)(chart,drawings,selectedDrawing,(action:()=>void)=>action());
 run();
 expect(nativeLock).not.toHaveBeenCalled();
 expect(managerSet).toHaveBeenCalledTimes(1);
 expect(managerSet).toHaveBeenCalledWith(['line-a'],{locked:true});
});
it('toggling an already locked drawing unlocks that row only',()=>{
 const handler=extractLock(),managerSet=vi.fn();
 const chart={drawings:{lock:vi.fn()},drawingManager:{set:managerSet}},drawings=[{id:'line-a',locked:true},{id:'line-b',locked:false}];
 new Function('chart','drawings','selectedDrawing','drawingAction',`return (${handler});`)(chart,drawings,'line-a',(action:()=>void)=>action())();
 expect(managerSet).toHaveBeenCalledWith(['line-a'],{locked:false});
});
