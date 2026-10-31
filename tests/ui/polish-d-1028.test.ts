// Pure helpers behind the polish (toast action, alert source wording, cache sizes, axis collisions).
import {describe,expect,it} from 'vitest';
import {statusToastAction,noAlpacaKeyMessage} from '../../src/ui/startup-open';
import {priceSourceLabel} from '../../src/ui/technical-alert-catalog';
import {formatCacheSize} from '../../src/domain/live-cache';
import {collidingTickLabels} from '../../src/chart/appearance-painters';

describe('POLISH-D-1028',()=>{
 it('a status that points to Settings > Data sources offers Open settings; others offer nothing',()=>{
  expect(statusToastAction(noAlpacaKeyMessage('GME, SPY'))).toEqual({label:'Open settings',tab:'datasources'});
  expect(statusToastAction('Opened GME, 1D.')).toBeNull();
 });
 it('alert price sources read like the product: symbol, then the field',()=>{
  expect(priceSourceLabel('GME','close')).toBe('GME, Close');
  expect(priceSourceLabel('SPY','hlc3',' (Heikin Ashi)')).toBe('SPY, HLC3 (Heikin Ashi)');
 });
 it('cache sizes are short and human',()=>{
  expect(formatCacheSize(200*1024*1024)).toBe('200 MB');
  expect(formatCacheSize(2.5*1024*1024*1024)).toBe('2.5 GB');
  expect(formatCacheSize(1023*1024*1024)).toBe('1023 MB');
 });
 it('only tick labels that meet the last price chip box are hidden',()=>{
  const ticks=[{price:24,label:'24.00'},{price:22,label:'22.00'},{price:20,label:'20.00'},{price:30,label:'30.00'}];
  const priceToY=(price:number)=>(30-price)*20; // 30 at y=0 (inside the 6px top skip), 22 at y=160, 20 at y=200
  // Chip centred at y=164 (22.22 rounded), 8px above, 8px below; 12px font gives 7px half label height.
  expect(collidingTickLabels(ticks,priceToY,{top:0,height:400},164,8,12).map(row=>row.label)).toEqual(['22.00']);
  // A taller chip (countdown row) reaches the next tick only when the box really meets it.
  expect(collidingTickLabels(ticks,priceToY,{top:0,height:400},164,24,12).map(row=>row.label)).toEqual(['22.00']);
  expect(collidingTickLabels(ticks,priceToY,{top:0,height:400},180,24,12).map(row=>row.label)).toEqual(['20.00']);
  expect(collidingTickLabels(ticks,priceToY,{top:0,height:400},175,24,12).map(row=>row.label)).toEqual(['22.00','20.00']);
  expect(collidingTickLabels(ticks,priceToY,{top:0,height:400},100,8,12)).toEqual([]);
 });
});
