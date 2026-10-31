import {expect,it} from 'vitest';
import {historyStartInView} from '../../src/ui/live-registry';

// The "No more data" state shows only while the oldest loaded bar is in view. Pure check, no DOM.
it('the start of history is in view when the left edge is at or before the oldest bar',()=>{
 expect(historyStartInView({from:100,to:900},100)).toBe(true);
 expect(historyStartInView({from:50,to:900},100)).toBe(true);
 expect(historyStartInView({from:101,to:900},100)).toBe(false);
 expect(historyStartInView(null,100)).toBe(false);
 expect(historyStartInView({from:50,to:900},null)).toBe(false);
});
