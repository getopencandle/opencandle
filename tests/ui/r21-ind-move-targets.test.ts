import {describe,expect,it} from 'vitest';
import {indicatorMoveChoices,existingPaneTarget,NEW_PANE_MOVES,EXISTING_PANE_MOVES} from '../../src/ui/indicator-move-targets';

// The Move to submenu for one indicator. New pane above / below follow
// the recorded facts and the recorded facts (Move to)
// the existing-pane entries are our own choice (the indicator Move to submenu was not observed:
// the recorded facts unknowns). SYNTHETIC pane lists, no renderer.
const host=(panes:{id:string;kind?:string;indicators:string[]}[])=>({chart:{panes:{list:()=>panes.map(pane=>({...pane,indicators:pane.indicators.map(id=>({id}))}))}}});
const views=[{rendererId:'n-sma',paneId:'price'},{rendererId:'n-rsi',paneId:'lv-pane-rsi'},{rendererId:'n-macd',paneId:'lv-pane-macd'}];
const three=host([{id:'price',kind:'price',indicators:['n-sma']},{id:'r-1',kind:'study',indicators:['n-rsi']},{id:'r-2',kind:'study',indicators:['n-macd']}]);

describe(' Move to choices',()=>{
 it('the cited new-pane entries come first, in fact order',()=>{
  expect(NEW_PANE_MOVES.map(row=>row.label)).toEqual(['New pane above','New pane below']);
  expect(EXISTING_PANE_MOVES.map(row=>row.label)).toEqual(['Existing pane above','Existing pane below']);
  expect(indicatorMoveChoices(three,'n-rsi',views).map(row=>row.id)).toEqual(['above','below','existing-above','existing-below']);
 });
 it('a chart with one pane, or an unreadable pane list, offers only the new-pane entries',()=>{
  expect(indicatorMoveChoices(host([{id:'price',kind:'price',indicators:['n-sma']}]),'n-sma',views).map(row=>row.label)).toEqual(['New pane above','New pane below']);
  expect(indicatorMoveChoices({chart:null},'n-sma',views).map(row=>row.id)).toEqual(['above','below']);
  expect(indicatorMoveChoices({chart:{panes:{list:()=>{throw Error('gone');}}}},'n-sma',views).map(row=>row.id)).toEqual(['above','below']);
 });
 it('the top and bottom panes disable the missing neighbour with a reason; the middle pane can go both ways',()=>{
  const top=indicatorMoveChoices(three,'n-sma',views),middle=indicatorMoveChoices(three,'n-rsi',views),bottom=indicatorMoveChoices(three,'n-macd',views);
  expect(top.find(row=>row.id==='existing-above')?.disabled).toMatch(/no pane above/);expect(top.find(row=>row.id==='existing-below')?.disabled).toBeUndefined();
  expect(middle.filter(row=>row.disabled)).toEqual([]);
  expect(bottom.find(row=>row.id==='existing-below')?.disabled).toMatch(/no pane below/);expect(bottom.find(row=>row.id==='existing-above')?.disabled).toBeUndefined();
  for(const list of [top,middle,bottom])for(const row of list.filter(item=>item.id==='above'||item.id==='below'))expect(row.disabled).toBeUndefined();
 });
 it('targets resolve to the price pane or the neighbour pane logical id',()=>{
  expect(existingPaneTarget(three,'n-rsi',views,'existing-above')).toBe('price');
  expect(existingPaneTarget(three,'n-rsi',views,'existing-below')).toEqual({pane:'lv-pane-macd'});
  expect(existingPaneTarget(three,'n-sma',views,'existing-below')).toEqual({pane:'lv-pane-rsi'});
  expect(existingPaneTarget(three,'n-macd',views,'existing-above')).toEqual({pane:'lv-pane-rsi'});
 });
 it('a pane without a OpenCandle built-in (scripts or comparisons only) is refused, never guessed',()=>{
  const mixed=host([{id:'price',kind:'price',indicators:['n-sma']},{id:'r-script',kind:'study',indicators:['n-script']},{id:'r-2',kind:'study',indicators:['n-macd']}]);
  const choices=indicatorMoveChoices(mixed,'n-macd',views);
  expect(choices.find(row=>row.id==='existing-above')?.disabled).toMatch(/scripts or comparisons/);
  expect(()=>existingPaneTarget(mixed,'n-macd',views,'existing-above')).toThrow(/scripts or comparisons/);
  expect(()=>existingPaneTarget(three,'n-sma',views,'existing-above')).toThrow(/no pane above/);
  expect(()=>existingPaneTarget(three,'n-gone',views,'existing-below')).toThrow(/pane is unavailable/);
 });
 it('a pane list without kinds still treats the pane named price as the price pane',()=>{
  const bare=host([{id:'price',indicators:['n-sma']},{id:'r-1',indicators:['n-rsi']}]);
  expect(existingPaneTarget(bare,'n-rsi',views,'existing-above')).toBe('price');
 });
});
