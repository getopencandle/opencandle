import {expect,it,vi} from 'vitest';
import {seasonalityIntradayFrontier,seasonalityIntradayFrontierCost,type SeasonalityFrontierRequest,type SeasonalityFrontierPage} from '../../src/domain/seasonality-intraday-frontier';
const s=(value:string)=>Date.parse(value)/1000;
const row=(time:string)=>({time:s(time),label:'SYNTHETIC time-only frontier'});
const from=s('2023-03-01T05:00:00Z');
function input(times:string[],options:Partial<SeasonalityFrontierRequest>={}):SeasonalityFrontierRequest{
 const firstLoadedTime=s(times.at(-1)!),requestFrom=from,requestThrough=firstLoadedTime;
 return{resolution:'1m',session:'regular',firstLoadedTime,requestFrom,requestThrough,pages:[{from:requestFrom,through:requestThrough,requestPageToken:null,nextPageToken:null,rows:times.map(row)}],...options};
}
it('counts actual sparse selected minute bars without filling missing minutes or days',()=>{
 const value=seasonalityIntradayFrontier(input(['2023-03-01T14:30:00Z','2023-03-01T14:32:00Z','2023-03-03T14:30:00Z']));
 expect(value).toEqual({status:'ready',firstObservedTime:s('2023-03-01T14:30:00Z'),firstLoadedTime:s('2023-03-03T14:30:00Z'),prefixBars:2,sourceRows:3,selectedBars:3});
});
it('hourly folds count distinct genuine target opens and preserve sparse gaps',()=>{
 const value=seasonalityIntradayFrontier(input(['2023-03-01T14:30:00Z','2023-03-01T14:45:00Z','2023-03-01T15:00:00Z','2023-03-01T15:30:00Z','2023-03-02T14:30:00Z'],{resolution:'60m'}));
 expect(value).toEqual({status:'ready',firstObservedTime:s('2023-03-01T14:30:00Z'),firstLoadedTime:s('2023-03-02T14:30:00Z'),prefixBars:2,sourceRows:5,selectedBars:3});
});
it('regular filtering occurs on actual folded target opens, with pre/post excluded',()=>{
 const value=seasonalityIntradayFrontier(input(['2023-03-01T14:00:00Z','2023-03-01T14:15:00Z','2023-03-01T14:30:00Z','2023-03-01T20:30:00Z','2023-03-01T21:00:00Z','2023-03-02T14:30:00Z'],{resolution:'60m'}));
 expect(value.status).toBe('ready');if(value.status!=='ready')throw Error('SYNTHETIC expected frontier');expect(value.prefixBars).toBe(2);expect(value.selectedBars).toBe(3);expect(value.firstObservedTime).toBe(s('2023-03-01T14:30:00Z'));
});
it('extended retains actual overnight supplied rows rather than inventing a session filter',()=>{
 const value=seasonalityIntradayFrontier(input(['2023-03-01T05:05:00Z','2023-03-01T09:00:00Z','2023-03-01T14:30:00Z'],{session:'extended'}));
 expect(value.status).toBe('ready');if(value.status!=='ready')throw Error('SYNTHETIC expected frontier');expect(value.firstObservedTime).toBe(s('2023-03-01T05:05:00Z'));expect(value.prefixBars).toBe(2);
});
it('DST/weekend holes remain holes and the first loaded bar itself is excluded from prefix count',()=>{
 const value=seasonalityIntradayFrontier(input(['2023-03-10T20:30:00Z','2023-03-13T13:30:00Z'],{resolution:'60m'}));
 expect(value.status).toBe('ready');if(value.status!=='ready')throw Error('SYNTHETIC expected frontier');expect(value.prefixBars).toBe(1);expect(value.selectedBars).toBe(2);
});
it('an early-close short final hour contributes exactly one observed bucket',()=>{
 const requestFrom=s('2023-11-01T04:00:00Z'),firstLoadedTime=s('2023-11-27T14:30:00Z'),value=seasonalityIntradayFrontier(input([],{resolution:'60m',requestFrom,requestThrough:firstLoadedTime,firstLoadedTime,pages:[{from:requestFrom,through:firstLoadedTime,requestPageToken:null,nextPageToken:null,rows:['2023-11-24T17:30:00Z','2023-11-24T17:45:00Z','2023-11-27T14:30:00Z'].map(row)}]}));
 expect(value.status).toBe('ready');if(value.status!=='ready')throw Error('SYNTHETIC expected frontier');expect(value.prefixBars).toBe(1);expect(value.selectedBars).toBe(2);
});
it('complete coherent pages are one strict chronological response, not a maximum-window union',()=>{
 const a=input(['2023-03-01T14:30:00Z','2023-03-01T14:31:00Z']),pages:SeasonalityFrontierPage[]=[{from,through:a.requestThrough,requestPageToken:null,nextPageToken:'SYNTHETIC-next',rows:[row('2023-03-01T14:30:00Z')]},{from,through:a.requestThrough,requestPageToken:'SYNTHETIC-next',nextPageToken:null,rows:[row('2023-03-01T14:31:00Z')]}];
 expect(seasonalityIntradayFrontier({...a,pages})).toMatchObject({status:'ready',prefixBars:1});
 expect(seasonalityIntradayFrontier({...a,pages:[pages[0]]})).toEqual({status:'incomplete',reason:'pagination'});
 expect(seasonalityIntradayFrontier({...a,pages:[pages[0],{...pages[1],from:from+60}]})).toEqual({status:'refused',reason:'coherence'});
 expect(seasonalityIntradayFrontier({...a,pages:[pages[0],{...pages[1],requestPageToken:'WRONG'}]})).toEqual({status:'refused',reason:'coherence'});
});
it('missing observed first loaded bar and empty selection are incomplete, never invented frontiers',()=>{
 const a=input(['2023-03-01T14:30:00Z']);expect(seasonalityIntradayFrontier({...a,firstLoadedTime:a.firstLoadedTime+60,requestThrough:a.firstLoadedTime+60,pages:[{...a.pages[0],through:a.firstLoadedTime+60}]})).toEqual({status:'incomplete',reason:'first-loaded-missing'});
 const first=s('2023-03-01T09:00:00Z');expect(seasonalityIntradayFrontier(input(['2023-03-01T09:00:00Z'],{firstLoadedTime:first}))).toEqual({status:'incomplete',reason:'empty-selection'});
});
it('no OHLC or volume getter is touched by the time-only operation',()=>{
 const reads=vi.fn(()=>{throw Error('SYNTHETIC price read forbidden');}),a=input(['2023-03-01T14:30:00Z']);for(const field of ['open','high','low','close','volume'])Object.defineProperty(a.pages[0].rows[0],field,{get:reads});expect(seasonalityIntradayFrontier(a)).toMatchObject({status:'ready',prefixBars:0});expect(reads).not.toHaveBeenCalled();
});
it('duplicates, reverse order, accessor times, page overflow and future source rows refuse',()=>{
 const a=input(['2023-03-01T14:30:00Z','2023-03-01T14:31:00Z']);
 for(const rows of [[row('2023-03-01T14:30:00Z'),row('2023-03-01T14:30:00Z')],[row('2023-03-01T14:31:00Z'),row('2023-03-01T14:30:00Z')],[row('2023-03-01T14:32:00Z')],new Array(10001)])expect(seasonalityIntradayFrontier({...a,pages:[{...a.pages[0],rows}]}).status).toBe('refused');
 const reads=vi.fn();expect(seasonalityIntradayFrontier({...a,pages:[{...a.pages[0],rows:[Object.defineProperty({},'time',{get:reads})]}]}).status).toBe('refused');expect(reads).not.toHaveBeenCalled();
});
it('unknown calendar/range and daily intervals cannot masquerade as intraday frontiers',()=>{
 const a=input(['2023-03-01T14:30:00Z']);for(const patch of [{resolution:'1D'},{resolution:'1s'},{requestFrom:a.requestFrom+60},{firstLoadedTime:s('2029-03-01T14:30:00Z'),requestThrough:s('2029-03-01T14:30:00Z')}])expect(seasonalityIntradayFrontier({...a,...patch}).status).toBe('refused');
});
it('explicit helper fees stay under unchanged caps while response ownership is charged separately',()=>{
 expect(seasonalityIntradayFrontierCost(30000)).toEqual({operations:512*30000+8192*31+32768,numericSlots:4096});expect(seasonalityIntradayFrontierCost(30000).operations).toBeLessThan(20000000);expect(()=>seasonalityIntradayFrontierCost(30001)).toThrow();
});
it('literal nonadvancing and repeated pagination tokens refuse despite chronological data',()=>{
 const a=input(['2023-03-01T14:30:00Z','2023-03-01T14:31:00Z','2023-03-01T14:32:00Z']),rows=a.pages[0].rows;
 for(const tokens of [[null,'A','A','A','A',null],[null,'A','A','B','B','A'],[null,'A','A','B','A',null]] as const){
  const pages:SeasonalityFrontierPage[]=Array.from({length:3},(_,index)=>({from:a.requestFrom,through:a.requestThrough,requestPageToken:tokens[2*index],nextPageToken:tokens[2*index+1],rows:[rows[index]]}));
  expect(seasonalityIntradayFrontier({...a,pages})).toEqual({status:'refused',reason:'coherence'});
 }
});
