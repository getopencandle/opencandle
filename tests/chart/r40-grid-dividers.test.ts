import {describe,expect,it,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {dividerPlacement,dividerSegments,equalTracks,paintedTracks,trackTemplateStyle,type LayoutTracks} from '../../src/chart/layout-tracks';
import {GridDividers,dividerDragAt,dividerKeyStep,dividerReset,publishGridTracks} from '../../src/ui/GridDividers';
import {createMultiChartState,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {defaultTheme} from '../../src/ui/themes';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {restoreWorkspace} from '../../src/ui/workspace-validation';

// Resizable dividers between the charts of a layout. Hand-worked fractions;
// SYNTHETIC fixture dataset only.
const two:LayoutTracks={schemaVersion:1,columns:[0.7,0.3],rows:[1]};

describe('divider pieces',()=>{
 it('an even grid has one full-length divider per inner track border',()=>{
  expect(dividerSegments('four')).toEqual([{axis:'columns',index:0,from:0,to:2},{axis:'rows',index:0,from:0,to:2}]);
  expect(dividerSegments('three-columns')).toEqual([{axis:'columns',index:0,from:0,to:1},{axis:'columns',index:1,from:0,to:1}]);
  expect(dividerSegments('single')).toEqual([]);
 });
 it('an uneven grid has a divider only where two different charts meet',()=>{
  // 1 large left, 2 small right: the column border runs the full height; the row border only on the right.
  expect(dividerSegments('one-plus-two')).toEqual([{axis:'columns',index:0,from:0,to:2},{axis:'rows',index:0,from:1,to:2}]);
  // 2 small above 1 wide: the column border only on the top row.
  expect(dividerSegments('two-plus-one')).toEqual([{axis:'columns',index:0,from:0,to:1},{axis:'rows',index:0,from:0,to:2}]);
  // 2 above 3 on six tracks: borders at track 1|2 (bottom), 2|3 (top), 3|4 (bottom) and the full row border.
  expect(dividerSegments('two-plus-three')).toEqual([{axis:'columns',index:1,from:1,to:2},{axis:'columns',index:2,from:0,to:1},{axis:'columns',index:3,from:1,to:2},{axis:'rows',index:0,from:0,to:6}]);
 });
 it('places each piece in percent of the grid',()=>{
  const tracks:LayoutTracks={schemaVersion:1,columns:[0.6,0.4],rows:[0.25,0.75]};
  expect(dividerPlacement(tracks,{axis:'columns',index:0,from:0,to:2})).toEqual({at:60,start:0,length:100});
  expect(dividerPlacement(tracks,{axis:'rows',index:0,from:1,to:2})).toEqual({at:25,start:60,length:40});
 });
});

describe('painted tracks',()=>{
 it('equal or absent tracks add no style; a resized grid adds both templates',()=>{
  expect(trackTemplateStyle({presetId:'two-columns'})).toEqual({});
  expect(trackTemplateStyle({presetId:'two-columns',tracks:equalTracks('two-columns')})).toEqual({});
  expect(trackTemplateStyle({presetId:'two-columns',tracks:two})).toEqual({gridTemplateColumns:'minmax(0,0.7fr) minmax(0,0.3fr)',gridTemplateRows:'repeat(1,minmax(0,1fr))'});
 });
 it('a stale or malformed block paints the equal grid instead of a broken one',()=>{
  expect(trackTemplateStyle({presetId:'four',tracks:two})).toEqual({});
  expect(trackTemplateStyle({presetId:'two-columns',tracks:{schemaVersion:1,columns:[0.95,0.05],rows:[1]}})).toEqual({});
  expect(paintedTracks({presetId:'two-columns',tracks:'x'})).toEqual(equalTracks('two-columns'));
 });
});

describe('divider gestures',()=>{
 const segment={axis:'columns' as const,index:0,from:0,to:1};
 it('a drag moves the border by the pointer distance over the grid size, clamped at 0.1',()=>{
  expect(dividerDragAt(equalTracks('two-columns'),segment,200,1000).columns).toEqual([0.7,0.3]);
  expect(dividerDragAt(equalTracks('two-columns'),segment,-900,1000).columns).toEqual([0.1,0.9]);
  expect(dividerDragAt(equalTracks('two-columns'),segment,50,0)).toEqual(equalTracks('two-columns'));
 });
 it('arrow keys step 5 percent on the matching axis only; other keys are ignored',()=>{
  expect(dividerKeyStep(two,'two-columns',segment,'ArrowLeft')?.tracks?.columns).toEqual([0.65,0.35]);
  expect(dividerKeyStep(two,'two-columns',segment,'ArrowUp')).toBeNull();
  expect(dividerKeyStep(equalTracks('two-columns'),'two-columns',segment,'ArrowRight')?.tracks?.columns).toEqual([0.55,0.45]);
 });
 it('a double-click returns the pair to equal sizes and drops the stored block',()=>{
  expect(dividerReset(two,'two-columns',segment)).toBeUndefined();
  const three:LayoutTracks={schemaVersion:1,columns:[0.5,0.2,0.3],rows:[1]};
  expect(dividerReset(three,'three-columns',{axis:'columns',index:0,from:0,to:1})?.columns).toEqual([0.35,0.35,0.3]);
 });
 it('renders one keyboard-reachable separator per piece with plain labels',()=>{
  const html=renderToStaticMarkup(React.createElement(GridDividers,{presetId:'one-plus-two',tracks:undefined,onCommit:()=>{}}));
  expect(html.match(/role="separator"/g)).toHaveLength(2);expect(html).toContain('aria-label="Resize chart columns"');expect(html).toContain('aria-label="Resize chart rows"');
  expect(html).toContain('tabindex="0"');expect(html).toContain('left:calc(50% - 3px)');expect(html).not.toMatch(/[–—]/);
  expect(renderToStaticMarkup(React.createElement(GridDividers,{presetId:'single',onCommit:()=>{}}))).toBe('');
 });
});

describe('tracks on the grid state',()=>{
 const initial=()=>resizeMultiChartState(createMultiChartState(fixtureDataset('GME',3),{appearance:defaultTheme.appearance,themeId:defaultTheme.id}),'two-columns');
 it('a commit publishes through the grid publication path; equal tracks delete the key',()=>{
  const previous=initial(),notify=vi.fn(()=>true),accepted=vi.fn();
  expect(publishGridTracks({previous,tracks:two,notify,accepted,rejected:()=>{}})).toBe(true);
  const next=(notify.mock.calls[0] as unknown[])[0] as typeof previous;expect(next.tracks).toEqual(two);expect(next.layout).toBe(previous.layout);expect(accepted).toHaveBeenCalledWith(next);
  const back=vi.fn(()=>true);publishGridTracks({previous:next,tracks:undefined,notify:back,accepted:()=>{},rejected:()=>{}});
  expect(Object.hasOwn((back.mock.calls[0] as unknown[])[0] as object,'tracks')).toBe(false);
 });
 it('an unchanged commit and a staging grid publish nothing',()=>{
  const previous=initial(),notify=vi.fn(()=>true);
  publishGridTracks({previous,tracks:undefined,notify,accepted:()=>{},rejected:()=>{}});publishGridTracks({previous,tracks:two,staging:true,notify,accepted:()=>{},rejected:()=>{}});
  expect(notify).not.toHaveBeenCalled();
 });
 it('a layout change drops the tracks, so a preset with the same track counts starts equal',()=>{
  const sized={...resizeMultiChartState(initial(),'one-plus-two'),tracks:{schemaVersion:1 as const,columns:[0.7,0.3],rows:[0.5,0.5]}};
  const four=resizeMultiChartState(sized,'four');expect(Object.hasOwn(four,'tracks')).toBe(false);
  expect(Object.hasOwn(resizeMultiChartState(initial(),'four'),'tracks')).toBe(false);
 });
 it('a saved workspace keeps its tracks through restore',()=>{
  const defaults=createInitialWorkspace(),saved=JSON.parse(JSON.stringify(createInitialWorkspace()));
  saved.grid=JSON.parse(JSON.stringify({...saved.grid,tracks:{schemaVersion:1,columns:[1],rows:[1]}}));
  const restored=restoreWorkspace(saved,defaults) as unknown as {grid:Record<string,unknown>};
  expect(restored.grid.tracks).toEqual({schemaVersion:1,columns:[1],rows:[1]});
 });
});
