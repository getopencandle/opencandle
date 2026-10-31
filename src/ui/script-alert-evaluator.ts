import {sourceContextForDataset} from '../chart/source-context';
import {cellSessionDormant} from '../chart/cell-session';
import {scriptRequestBase} from './script-requests';
import type {BarDataset} from '../domain/types';
import type {TechnicalScriptOutputs,TechnicalScriptRequest} from '../domain/technical-alerts';
import {executeScriptOnBars} from './script-jobs';

/**
 * Script alert sources run in the same restricted worker as chart scripts (no network, DOM or Node), on
 * the observed prefix only. Requests resolve against the app's loaded data for this alert's dataset; synthetic
 * datasets stay labelled synthetic in the run provenance.
 */
export interface TechnicalScriptEvaluator {evaluate(request:TechnicalScriptRequest):Promise<TechnicalScriptOutputs>}
export function createTechnicalScriptEvaluator(options:{dataset:BarDataset;sessionOverride?:'regular'|'extended';execute?:typeof executeScriptOnBars}):TechnicalScriptEvaluator{
 const {dataset}=options,execute=options.execute??executeScriptOnBars;
 // The chart cell's session choice applies only when this dataset is that session's view (its declared session
 // matches). A dormant choice (1D and longer, or not an intraday US equity) leaves the source as supplied, so the request base
 // has no session either. Before, every alert on such a chart failed with "request proof does not match its source basis".
 const source=sourceContextForDataset(dataset),session=source.sessionOverride??(options.sessionOverride&&dataset.provenance.session===options.sessionOverride&&!cellSessionDormant(dataset)?options.sessionOverride:undefined);
 const base=scriptRequestBase({...source,...(session?{sessionOverride:session}:{})},'candles');
 const identity=JSON.stringify(['script-alert',dataset.provenance.datasetId,dataset.provenance.revision,dataset.resolution,source.basisIdentity]);
 return Object.freeze({async evaluate(request:TechnicalScriptRequest):Promise<TechnicalScriptOutputs>{
  if(request.signal.aborted||request.cancelled())throw new DOMException('Script alert calculation was cancelled.','AbortError');
  const {result,barIds}=await execute({source:request.source,bars:request.bars,identity,fixture:dataset.provenance.fixture,signal:request.signal,inputs:request.inputs,request:{base}});
  return{plots:result.plots.map(plot=>({id:plot.id,values:plot.values})),conditions:(result.conditions??[]).map(row=>({title:row.title,values:row.values})),alerts:result.alerts,orders:result.orders??[],barIds};
 }});
}
