import {afterEach,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {setDemoDataMode,type DemoDataMode} from '../../src/domain/demo-mode';
import {prepareWorkspaceData} from '../../src/ui/workspace-transfer';
import {shownImport,workspaceDatasets} from '../../src/ui/workspace-grid';
import {compactDerivedImports} from '../../src/ui/workspace-derived-imports';

// A workspace saved by an earlier build (a demo GME cell with a 1W interval derived from the demo
// series, written as a derived-interval recipe, plus a live Alpaca GME chart record and a demo-source watchlist) went to the
// "Saved workspace needs recovery" screen in the 'off' mode: the recipe's demo source was a bar-less placeholder, so the 1W could
// not be rebuilt and prepareWorkspaceData threw. Fixture: the owner's file with ids anonymised (it holds no keys).
afterEach(()=>setDemoDataMode('legacy'));
const fixture=()=>JSON.parse(readFileSync(new URL('../fixtures/workspaces/recovery-diag-1030-demo-1w-recipe.json',import.meta.url),'utf8')) as Record<string,unknown>;

it.each<DemoDataMode>(['off','example','legacy'])('a saved demo 1W recipe loads in the %s mode',mode=>{
 setDemoDataMode(mode);
 const data=fixture();
 expect((data.derivedImports as unknown[]).length).toBe(1);
 const loaded=prepareWorkspaceData(data);
 const weekly=loaded.workspace.imports.filter(row=>row.resolution==='1W');
 expect(weekly).toHaveLength(1);
 expect(weekly[0]!.instrument.symbol).toBe('GME');
 // The live chart record and the cell survive unchanged.
 const cellId=Object.keys((data.liveCharts as Record<string,unknown>))[0]!;
 expect((loaded.data.liveCharts as Record<string,{providerId:string}>)[cellId]!.providerId).toBe('alpaca-iex');
 expect(loaded.workspace.grid!.cells[cellId]).toBeDefined();
 // A later save writes the same recipe back (nothing is lost or turned into stored bars).
 const again=compactDerivedImports(loaded.workspace.imports);
 expect(again.kept.filter(row=>row.resolution==='1W')).toHaveLength(0);
 expect(again.recipes).toHaveLength(1);
 expect(again.recipes[0]!.target).toBe('1W');
 // Where generated prices are hidden, the rebuilt import is shown as a bar-less placeholder.
 if(mode==='off')expect(shownImport(weekly[0]!).bars).toHaveLength(0);
 else expect(shownImport(weekly[0]!).bars.length).toBeGreaterThan(0);
 expect(()=>workspaceDatasets(loaded.workspace)).not.toThrow();
});
