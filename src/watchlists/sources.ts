import type {BarDataset} from '../domain/types';
import {parseInterval} from '../domain/intervals';
export function originalDailySource(dataset:BarDataset):boolean{try{return parseInterval(dataset.resolution).id==='1D'&&dataset.provenance.providerId!=='lv-local-aggregation'&&!('derivation'in dataset);}catch{return false;}}
export function compatibleDailySource(primary:BarDataset,daily:BarDataset):boolean{
 return originalDailySource(daily)&&daily.instrument.id===primary.instrument.id&&daily.instrument.exchange===primary.instrument.exchange&&daily.instrument.currency===primary.instrument.currency&&daily.provenance.providerId===primary.provenance.providerId&&daily.provenance.fixture===primary.provenance.fixture&&daily.provenance.session===primary.provenance.session&&daily.provenance.adjustment===primary.provenance.adjustment&&daily.provenance.timezone===primary.provenance.timezone;
}
