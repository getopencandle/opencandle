import {expect,it,vi} from 'vitest';
import type {Vela} from '@luxalgo/vela';
import {createIndicatorPort} from '../../src/chart/indicator-port';
it('releases the first native listener when second subscription acquisition fails',()=>{
 const off=vi.fn(),chart={on:vi.fn((event:string)=>{if(event==='indicator:removed')return off;throw Error('Second native subscription failed');})};
 expect(()=>createIndicatorPort(chart as unknown as Vela)).toThrow('Second native subscription failed');expect(off).toHaveBeenCalledOnce();
});
it('preserves acquisition and listener-release failures rather than masking either diagnostic',()=>{
 const off=vi.fn(()=>{throw Error('First listener release failed');}),chart={on:vi.fn((event:string)=>{if(event==='indicator:removed')return off;throw Error('Second native subscription failed');})};
 let observed:unknown;try{createIndicatorPort(chart as unknown as Vela);}catch(error){observed=error;}
 expect(off).toHaveBeenCalledOnce();expect(observed).toBeInstanceOf(AggregateError);expect((observed as AggregateError).errors.map(String).join(' ')).toContain('Second native subscription failed');expect((observed as AggregateError).errors.map(String).join(' ')).toContain('First listener release failed');
});
