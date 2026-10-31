import {expect,it} from 'vitest';
import {statsPainterHarness,statsRecord} from './trendline-stats-painter-harness';
import {TRENDLINE_MARKERS_DEFAULTS} from '../../src/chart/trendline-stats-data';

// distance and angle live in props.lvTrendlineMarkers; the stats member keeps its closed seven-key shape.
const withExtras=(settings:Record<string,boolean>,extras:{distance?:boolean;angle?:boolean})=>{const row=statsRecord(settings as never);row.props={...row.props,lvTrendlineMarkers:{...TRENDLINE_MARKERS_DEFAULTS,...extras}};return row;};

// Runs the real stats painter on the shared SYNTHETIC native harness. distance, angle.
const text=(commands:any[])=>commands.filter(command=>command.op==='fillText'&&/^(Price|Change|Bars|Time|Distance|Angle):/.test(command.values[0])).map(command=>command.values[0] as string);

it('distance prints bars and price as a pair and angle prints screen degrees, both behind their own flags',async()=>{
 const row=withExtras({alwaysShow:true},{distance:true,angle:true}),f=await statsPainterHarness([row]);
 try{
  const lines=text(f.top.commands);
  expect(lines.find(line=>line.startsWith('Distance:'))).toBe('Distance: 2 bars, 100.00');
  const angle=lines.find(line=>line.startsWith('Angle:'))!;
  expect(angle).toMatch(/^Angle: -?\d+(\.\d+)? deg$/);
  expect(f.notices).toEqual([]);
 }finally{f.cleanup();}
});

it('the angle is recomputed from the projection when the viewport changes, while distance is not',async()=>{
 const row=withExtras({alwaysShow:true},{distance:true,angle:true}),f=await statsPainterHarness([row]);
 try{
  const first=text(f.top.commands),angleOf=(lines:string[])=>Number(lines.find(line=>line.startsWith('Angle:'))!.replace(/[^0-9.\-]/g,''));
  f.coords.setViewport({...f.coords.getViewport(),barSpacing:50});
  f.top.commands.length=0;f.render();
  const second=text(f.top.commands);
  expect(angleOf(second)).not.toBe(angleOf(first));
  expect(second.find(line=>line.startsWith('Distance:'))).toBe(first.find(line=>line.startsWith('Distance:')));
 }finally{f.cleanup();}
});

it('a trendline with neither flag set prints neither line (legacy seven-key member)',async()=>{
 const row=statsRecord({priceRange:true,alwaysShow:true}),f=await statsPainterHarness([row]);
 try{expect(text(f.top.commands).some(line=>/^(Distance|Angle):/.test(line))).toBe(false);}finally{f.cleanup();}
});
