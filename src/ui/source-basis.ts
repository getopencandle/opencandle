import type {BarDataset} from '../domain/types';
import {rawCellSessionDataset} from '../chart/cell-session';
import {uniqueSuppliedDataset} from '../chart/source-resolution';
/** Linked symbol changes preserve the explicitly selected provider and price basis. */
export function linkedDatasetAtInterval(sources:readonly BarDataset[],selected:BarDataset,interval:string):BarDataset{
 selected=rawCellSessionDataset(selected);sources=sources.map(rawCellSessionDataset);
 const compatible=sources.filter(row=>row.instrument.id===selected.instrument.id&&row.instrument.exchange===selected.instrument.exchange&&row.instrument.currency===selected.instrument.currency&&row.provenance.providerId===selected.provenance.providerId&&row.provenance.fixture===selected.provenance.fixture&&row.provenance.adjustment===selected.provenance.adjustment&&row.provenance.session===selected.provenance.session&&row.provenance.timezone===selected.provenance.timezone&&row.provenance.coverage===selected.provenance.coverage&&!('derivation'in row)&&!('derivation'in selected)&&row.provenance.providerId!=='lv-local-aggregation');
 return uniqueSuppliedDataset(compatible,selected.instrument.symbol,interval,{instrumentId:selected.instrument.id,fixture:selected.provenance.fixture});
}
