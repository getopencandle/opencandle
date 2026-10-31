import {expect,it} from 'vitest';
import {fibLevelColor,fibLevelColorValues} from '../../src/ui/fib-level-colors';
import type {FibTrendLineState} from '../../src/chart/fib-trend-line-data';

const settings={schemaVersion:1 as const,enabled:false,color:'#2468ac',width:3,style:'dotted' as const};
const editor=(state: FibTrendLineState={state:'legacy',settings},colors=['#2468ac','#2468ac'])=>({
 type:'fibretracement',levels:colors.map(color=>({color})),fibTrendLine:state,
});

it('includes a disabled explicit baseline in the mixed-color display',()=>{
 const value=editor({state:'supported',settings:{...settings,color:'#abcdef'}});
 expect(fibLevelColor(value,{})).toBe('');
});

it('uses effective legacy defaults and the current staged baseline color',()=>{
 const value=editor();
 expect(fibLevelColor(value,{})).toBe('#2468ac');
 expect(fibLevelColor(value,{'lvFibTrendLine.color':'#abcdef'})).toBe('');
 expect(fibLevelColor(value,{'lvFibTrendLine.color':'#abcdef','levels.0.color':'#abcdef','levels.1.color':'#abcdef'})).toBe('#abcdef');
});

it.each(['legacy','supported'] as const)('stages all colors together for %s disabled baseline without other changes',state=>{
 const value=editor({state,settings});
 const initial={'levels.0.enabled':false,'levels.0.ratio':-.5,'levels.1.label':'retained','lvFibTrendLine.enabled':false,'lvFibTrendLine.width':3,'lvFibTrendLine.style':'dotted',opaque:{saved:true}};
 const before=structuredClone(initial),color='rgba(10,20,30,0)';
 const changed=fibLevelColorValues(value,initial,color);
 expect(changed).toStrictEqual({...initial,'levels.0.color':color,'levels.1.color':color,'lvFibTrendLine.color':color});
 expect(initial).toStrictEqual(before);
});

it('does not add a legacy baseline color delta for its already effective value',()=>{
 const changed=fibLevelColorValues(editor(),{},'#2468ac');
 expect(changed).toStrictEqual({'levels.0.color':'#2468ac','levels.1.color':'#2468ac'});
 expect(Object.hasOwn(changed,'lvFibTrendLine.color')).toBe(false);
});

it('refuses the complete common-color action when baseline state is unknown',()=>{
 const value=editor({state:'unavailable',message:'Retained unknown baseline'}),initial={'levels.0.color':'#2468ac'};
 expect(fibLevelColor(value,initial)).toBeUndefined();
 expect(()=>fibLevelColorValues(value,initial,'#abcdef')).toThrow();
 expect(initial).toStrictEqual({'levels.0.color':'#2468ac'});
});

it('handles a recognized baseline when no level rows remain',()=>{
 const value=editor({state:'supported',settings},[]);
 expect(fibLevelColor(value,{})).toBe('#2468ac');
 expect(fibLevelColorValues(value,{},'#abcdef')).toStrictEqual({'lvFibTrendLine.color':'#abcdef'});
});

it('refuses invalid chosen colors before staging any field',()=>{
 const value=editor(),initial={'lvFibTrendLine.width':3};
 for(const color of ['','Mixed','rgba(1,2,3,Infinity)'])expect(()=>fibLevelColorValues(value,initial,color)).toThrow();
 expect(initial).toStrictEqual({'lvFibTrendLine.width':3});
});

it('does not expose common Fibonacci color on unrelated tools',()=>{
 const value={...editor(),type:'trendline'};
 expect(fibLevelColor(value,{})).toBeUndefined();
 expect(()=>fibLevelColorValues(value,{},'#abcdef')).toThrow();
});
