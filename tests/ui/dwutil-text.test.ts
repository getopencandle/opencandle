// No em dashes and no internal ids in user-visible text across the new components and models (own files plus any other sub-lane files already present).
import {existsSync,readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const FILES=['src/chart/drawing-utility-state.ts','src/chart/indicator-hide-overlay.ts','src/chart/drawing-zoom.ts','src/chart/drawing-displacement.ts','src/chart/drawing-clipboard.ts','src/chart/drawing-linked-plan.ts','src/chart/indicator-snap-targets.ts','src/ui/DrawingUtilityBlock.tsx','src/ui/ZoomRegionOverlay.tsx','src/ui/drawing-utility.css'];
const present=FILES.filter(file=>existsSync(file));
const literals=(source:string)=>[...source.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map(m=>m[1]??m[2]??m[3]??'');
const INTERNAL=/DWUTIL|DWB\d|INDUI|INDREST|\bDW\.[A-Z]+|LV-VELA|COMPAT-\d|\bSDT#|\bVDF#|\bSDD2?#|\bVDD#|\bSOT#|\bDD-\d|\bSA-\d/;
describe(' user-visible text',()=>{
 it('the core files exist',()=>{for(const file of FILES.slice(0,5).concat(FILES.slice(7,9)))expect(present).toContain(file);});
 for(const file of present)it(file+': no em dash or en dash anywhere',()=>{expect(readFileSync(file,'utf8')).not.toMatch(/[—–]/);});
 for(const file of present.filter(f=>!f.endsWith('.css')))it(file+': no internal id in a text literal',()=>{
  const bad=literals(readFileSync(file,'utf8')).filter(text=>/\s/.test(text.trim())&&INTERNAL.test(text));expect(bad).toEqual([]);
 });
});
