import {describe,expect,it} from 'vitest';
import {BARS_PATTERN_BAR_CAP,BARS_PATTERN_MEMBER,decodeBars,encodeBars,makeBarsPatternMember,patchBarsPatternMember,readBarsPattern,columnsToBars,type BarsPatternSource,type PatternBar} from '../../src/chart/lv-types/bars-pattern-data';

// Bars pattern stored payload. SYNTHETIC values only.
const source=(over:Partial<BarsPatternSource>={}):BarsPatternSource=>({instrumentId:'SYNTHETIC:X',symbol:'X',fixture:true,datasetKey:'["SYNTHETIC:X","p","d","1D"]',revision:'r1',sourceKey:null,resolution:'1D',placedResolution:'1D',spanStart:0,spanEnd:10*86400,refPrice:100,derived:false,trimmed:false,...over});
const bars:PatternBar[]=[
 {time:0,open:100,high:101.5,low:99,close:100.25},
 {time:86400,open:-0,high:1e-12,low:-3.5e-7,close:-0},
 {time:2*86400,open:0.1+0.2,high:1e21,low:-1e21,close:123456.789012345},
];
const member=()=>makeBarsPatternMember(source(),bars);
const props=(value:unknown)=>({mode:0,[BARS_PATTERN_MEMBER]:value});

describe('Bars pattern payload (cols-v1)',()=>{
 it('round-trips exactly: shortest decimals, -0 and tiny values',()=>{
  const encoded=encodeBars(bars),decoded=decodeBars(encoded);
  expect(typeof decoded).not.toBe('string');
  const back=columnsToBars(decoded as Exclude<typeof decoded,string>);
  expect(back).toEqual(bars);
  expect(Object.is(back[1].open,-0)).toBe(true);expect(Object.is(back[1].close,-0)).toBe(true);
  expect(back[2].open).toBe(0.1+0.2);expect(back[1].high).toBe(1e-12);
  expect(encoded.data.split(';')).toHaveLength(5);
  const read=readBarsPattern(props(member()));
  expect(read.state).toBe('supported');
  expect(JSON.parse(JSON.stringify(member()))).toEqual(member());
 });
 it('the strict reader marks bad payloads unavailable (never repaired)',()=>{
  const good=member();
  const cases:Record<string,unknown>={
   'count mismatch':{...good,bars:{...good.bars,count:2}},
   NaN:{...good,bars:{...good.bars,data:good.bars.data.replace('100.25','NaN')}},
   'non-ascending times':makeBad(b=>{b[1]={...b[1],time:0};}),
   'OHLC inconsistency':makeBad(b=>{b[0]={...b[0],low:200};}),
   'out-of-span time':{...good,source:{...good.source,spanEnd:86400}},
   'unknown schema':{...good,schemaVersion:2},
   'unknown field':{...good,extra:true},
   'unknown encoding':{...good,bars:{...good.bars,encoding:'rows'}},
   'over the cap':{...good,bars:{...good.bars,count:BARS_PATTERN_BAR_CAP+1}},
   'bad source':{...good,source:{...good.source,refPrice:'x'}},
  };
  for(const [name,value] of Object.entries(cases))expect(readBarsPattern(props(value)).state,name).toBe('unavailable');
  expect(readBarsPattern(undefined)).toEqual({state:'absent'});expect(readBarsPattern({mode:0})).toEqual({state:'absent'});
  function makeBad(edit:(rows:PatternBar[])=>void){const rows=bars.map(bar=>({...bar}));edit(rows);return{...good,bars:encodeBars(rows)};}
 });
 it('a whole-member patch no-op returns the identical props; a change replaces the member',()=>{
  const before=props(member());
  expect(patchBarsPatternMember(before,member())).toBe(before);
  const other=makeBarsPatternMember(source({resolution:'1m'}),bars);
  const after=patchBarsPatternMember(before,other);
  expect(after).not.toBe(before);expect(after[BARS_PATTERN_MEMBER]).toBe(other);expect(after.mode).toBe(0);
 });
 it('an unbound placement source is valid; a bound one needs resolution and fixture flag',()=>{
  const unbound=source({instrumentId:null,symbol:null,fixture:null,datasetKey:null,revision:null,resolution:null,placedResolution:null});
  expect(readBarsPattern(props(makeBarsPatternMember(unbound,bars))).state).toBe('supported');
  expect(()=>makeBarsPatternMember(source({resolution:null}),bars)).toThrow();
  expect(()=>makeBarsPatternMember(source(),[])).toThrow();
 });
});
