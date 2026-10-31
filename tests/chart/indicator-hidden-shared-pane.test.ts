import {afterEach,expect,it} from 'vitest';
import {hiddenIndicatorHarness} from './hidden-indicator-harness';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';

// r17 (exe indicators flow, restart-keeps-the-removed-instance-removed): a hidden indicator that shares a separate pane is
// restored into that pane, and the NEXT save keeps its logical pane, so a second reload does not split the shared pane.
// SYNTHETIC harness (tests/chart/hidden-indicator-harness.ts): actual pinned core, indicator port and pane registry.
let cleanup:Array<()=>void>=[];
afterEach(()=>{for(const dispose of cleanup)dispose();cleanup=[];});
const grouping=(h:Awaited<ReturnType<typeof hiddenIndicatorHarness>>)=>{const kindOf=new Map(h.port.list().map(row=>[row.rendererId,row.kind]));return h.inventory().panes.map(pane=>pane.owners.map(owner=>kindOf.get(owner.rendererId)).sort());};

it('a hidden owner of a shared separate pane keeps its saved logical pane across two reloads',async()=>{
 const h=await hiddenIndicatorHarness();cleanup.push(h.dispose);
 const sma=await h.add('sma',factoryIndicatorDefault('sma')),rsi=await h.add('rsi',factoryIndicatorDefault('rsi')),macd=await h.add('macd',factoryIndicatorDefault('macd')),bb=await h.add('bb',factoryIndicatorDefault('bb'));
 h.port.move(sma,{newPane:true});await h.settle();h.port.move(rsi,{pane:h.row(macd).paneId!});await h.settle();h.port.move(bb,{pane:h.row(sma).paneId!});await h.settle();
 h.port.update(sma,{visible:false});await h.settle();
 const expected=[[],['bb','sma'],['macd','rsi']];
 const first=h.port.serialize();
 const reload1=await hiddenIndicatorHarness();cleanup.push(reload1.dispose);reload1.port.restore(first);await reload1.settle();
 expect(grouping(reload1)).toEqual(expected);
 const second=reload1.port.serialize(),pane=(rows:typeof second,kind:string)=>rows.find(row=>row.kind===kind)!.paneId;
 expect(pane(second,'sma')).toBe(pane(second,'bb'));expect(pane(second,'sma')).toBe(pane(first,'sma'));
 const reload2=await hiddenIndicatorHarness();cleanup.push(reload2.dispose);reload2.port.restore(second);await reload2.settle();
 expect(grouping(reload2)).toEqual(expected);
});
