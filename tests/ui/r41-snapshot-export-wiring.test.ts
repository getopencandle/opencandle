import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');
it('toolbar, copy and active context exports share the composed current-overlay path',()=>{
 expect(app.match(/overlay:chartSnapshotOverlay\(\)/g)).toHaveLength(4);expect(app).toContain("assertSnapshot();paintChartSnapshotScene(ctx,scene,frame)");expect(app).toContain("requireSnapshotScene(binding,'legend')");expect(app).toContain("requireSnapshotScene(binding,'events')");
});
// approved 2026-10-29: live chart screenshots allowed for personal use. Image save and copy no longer refuse live data;
// both still render through the composed current-overlay path with the source dataset id.
it('image exports render live charts like demo charts (approved 2026-10-29)',()=>{
 const start=app.indexOf("if(action==='png-save'){"),save=app.slice(start,app.indexOf('\n   }',start));expect(save).not.toContain('isLiveDatasetId(');expect(save).toContain('exportChartImage(');
 const toolbar=app.slice(app.indexOf('async function exportImage(){'),app.indexOf('function installStoredWorkspace'));expect(toolbar.slice(0,toolbar.indexOf('exportChartImage('))).not.toContain('isLiveDatasetId(');expect(app).toMatch(/copyChartImage\(\{render:[^\n]+datasetId:dataset\.provenance\.datasetId/);expect(app).toMatch(/copyChartImage\(\{render:[^\n]+datasetId:snapshot\.input\.source\.datasetId/);
});
it('hidden event marks and legend settings gate expected publication without creating export fetches',()=>{
 const helper=app.slice(app.indexOf('function chartSnapshotOverlay(){'),app.indexOf('async function exportImage(){'));expect(helper).toContain('barMarksVisibility.hiddenFor(cellId)');expect(helper).toContain('legendVisible&&');expect(helper).not.toMatch(/fetch\(|loadChartEvents\(|\.load\(/);expect(app).toContain('<SnapshotLegendPublisher host={legendRef} binding={snapshotBinding}/>');expect(app).toContain('<ChartEventMarkers snapshot={snapshotBinding??undefined}');
});
