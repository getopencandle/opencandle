import {describe,expect,it} from 'vitest';
import {notesTargetForContext,type NotesContextSnapshot} from '../../src/watchlists/notes';

// APP.WATCH.NOTES.SERIES: a comparison series menu targets that series, never whichever chart is active.
const snapshot:NotesContextSnapshot={instrument:{exchange:'NYSE',symbol:'GME'},fixture:false,comparisons:[{id:'cmp-1',exchange:'NASDAQ',symbol:'SPY',synthetic:false},{id:'cmp-2',exchange:'SYNTHETIC',symbol:'QQQ',synthetic:true}]};
describe('notesTargetForContext',()=>{
 it('maps a comparison series to its own market and everything else to the main instrument',()=>{
  expect(notesTargetForContext({kind:'series',owner:{kind:'comparison',id:'cmp-1'}},snapshot)).toEqual({exchange:'NASDAQ',symbol:'SPY',synthetic:false});
  expect(notesTargetForContext({kind:'series',owner:{kind:'comparison',id:'cmp-2'}},snapshot)).toEqual({exchange:'SYNTHETIC',symbol:'QQQ',synthetic:true});
  const main={exchange:'NYSE',symbol:'GME',synthetic:false};
  for(const target of [{kind:'series',owner:'main'},{kind:'series',owner:{kind:'built',id:'rsi'}},{kind:'series',owner:{kind:'script',id:'s'}},{kind:'drawing'},{kind:'chart'},{kind:'price-axis'},{kind:'time-axis'},{kind:'corner'}] as const)expect(notesTargetForContext(target,snapshot)).toEqual(main);
 });
 it('refuses a comparison whose market is missing or ambiguous instead of falling back to the main instrument',()=>{
  expect(()=>notesTargetForContext({kind:'series',owner:{kind:'comparison',id:'gone'}},snapshot)).toThrow('comparison series market');
  expect(()=>notesTargetForContext({kind:'series',owner:{kind:'comparison',id:'cmp-1'}},{...snapshot,comparisons:[...snapshot.comparisons,snapshot.comparisons[0]]})).toThrow('comparison series market');
  expect(()=>notesTargetForContext({kind:'series',owner:{kind:'comparison',id:'bad'}},{...snapshot,comparisons:[{id:'bad',exchange:'nyse',symbol:'x y',synthetic:false}]})).toThrow();
 });
});
