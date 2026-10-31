import {scriptPresentationFixture,syntheticResult} from './script-presentation';
import {derivedCalculation} from '../../src/chart/calculation-bars';
import {buildDerivedAxis} from '../../src/chart/derived/derived-axis';
import {sourceContextForDataset} from '../../src/chart/source-context';
import type {Bar} from '../../src/domain/types';
/** Genuine pure construction and axis builder; actual adapter-host closure/runtime/port use only synthetic native maps. */
export function scriptAxisFixture(options:{nonidentity?:boolean;duplicate?:boolean;projection?:boolean}={}){
 const style=options.duplicate?'renko':'linebreak',f=scriptPresentationFixture({style});
 let rows=f.input.bars.map(row=>({...row}));if(options.nonidentity)rows[2].time=400;
 f.dataset.resolution='1m';f.dataset.bars=rows;f.publish(rows,sourceContextForDataset(f.dataset));
 const settings=options.duplicate?{boxMethod:'Traditional',boxSize:2,atrLength:14,percentage:1,source:'close',wicks:false}:{lines:3};
 const result=derivedCalculation(rows,style,{settings,lastBarOpen:options.projection===true});if(!result.ok)throw Error(result.diagnostic.message);
 const axis=buildDerivedAxis(result.value,60),memo={raw:f.input.bars,style,key:'synthetic actual construction',result,axis};f.produced.setDerived(memo);
 f.core.bars=axis.feed.map(row=>({...row,time:row.time*1000}));
 const consumed:Bar[]=result.value.confirmed.map(({time,open,high,low,close,volume})=>({time,open,high,low,close,volume}));
 return{f,memo,axis,consumed,context:()=>({...f.context(),bars:consumed}),complete(){const times=[...new Set(consumed.map(row=>row.time))];f.complete(0,syntheticResult(times.map((time,index)=>[time,7+index*4])));}};
}
