import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {MEASURE_LEAF} from '../../src/ui/drawing-toolbar-model';

// .UTILITY.MEASURE (SDT#utility.measure): tooltip "Measure", hint
// "Shift + Click on the chart". The button keeps the native measure mode. Failing-first: the
// hint is absent today; root applies
const toolbar=readFileSync('src/ui/DrawingToolbar.tsx','utf8').replace(/\r\n/g,'\n');
it('the Measure leaf keeps the label and the toolbar button shows the Shift + Click hint',()=>{
 expect(MEASURE_LEAF.label).toBe('Measure');
 const line=toolbar.split('\n').find(row=>row.includes('MEASURE_LEAF')&&row.includes('<button'));
 if(!line)throw Error('Measure button boundary changed');
 const tooltip=/title=\{([^}]*)\}/.exec(line)?.[1]??'';
 expect(tooltip.includes('MEASURE_LEAF.hint')||tooltip.includes('Shift + Click on the chart')).toBe(true);
});
it('the model exposes the hint text from the fact',()=>{
 expect((MEASURE_LEAF as {hint?:string}).hint).toBe('Shift + Click on the chart');
});
