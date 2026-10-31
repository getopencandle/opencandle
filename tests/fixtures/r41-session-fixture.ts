import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';
import {createMultiChartState,type MultiChartState} from '../../src/ui/MultiChartGrid';
import {defaultTheme} from '../../src/ui/themes';
export function sessionFixture(symbol='GME',resolution='1m'):BarDataset{
 const seed=fixtureDataset(symbol,4),times=['2024-06-03T13:00:00Z','2024-06-03T13:30:00Z','2024-06-03T13:31:00Z','2024-06-03T20:00:00Z'];
 return {...seed,resolution,instrument:{...seed.instrument,timezone:'America/New_York'},bars:seed.bars.map((bar,index)=>({...bar,time:Date.parse(times[index])/1000})),provenance:{...seed.provenance,providerId:'synthetic-session',providerName:'SYNTHETIC session fixture',datasetId:'synthetic-session:'+symbol+':'+resolution,session:'all',timezone:'America/New_York',coverage:'SYNTHETIC session test bars'}};
}
export function sessionGrid(gme=sessionFixture(),spy=sessionFixture('SPY')):MultiChartState{
 const peer=createMultiChartState(spy,{appearance:defaultTheme.appearance,session:'regular'});const grid=createMultiChartState(gme,{appearance:defaultTheme.appearance,session:'extended'}),id=grid.layout.activeCellId;grid.presetId='two-columns';grid.layout.cells=[{...grid.layout.cells[0],id:'gme'},{...grid.layout.cells[0],id:'spy',symbol:'SPY'}];grid.cells={gme:grid.cells[id],spy:peer.cells[peer.layout.activeCellId]};grid.layout.activeCellId='gme';return grid;
}
