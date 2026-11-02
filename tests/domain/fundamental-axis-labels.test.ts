import {describe,expect,it} from 'vitest';
import {formatFundamentalAxisValue} from '../../src/domain/indicators-ext/fundamentals-catalog';
import {withIndicatorTickPrecision} from '../../src/chart/indicator-precision-native';

const cap={metric:'mcap'};
describe('fundamentals price-scale labels',()=>{
 it('use one compact unit for the whole visible range',()=>{
  const low=4.8e12,high=5.2e12,labels=[4.8e12,5.0e12,5.2e12].map(v=>formatFundamentalAxisValue(v,'fundamental',cap,low,high));
  expect(labels).toEqual(['4.8T','5.0T','5.2T']);
  expect(formatFundamentalAxisValue(5029.59e9,'fundamental',cap,4.8e12,5.2e12)).toBe('5.0T');
 });
 it('keeps the unit of the range maximum so a low tick is not re-unit',()=>{
  expect(formatFundamentalAxisValue(500e9,'fundamental',cap,0,2e12)).toBe('0.5T');
 });
 it('uses percent and x suffixes for ratio metrics',()=>{
  
  expect(formatFundamentalAxisValue(28.4,'fundamental',{metric:'pe'},20,40).endsWith('x')).toBe(true);
 });
 it('the tick painter uses the axis label when one is supplied',()=>{
  const drawn:string[]=[];
  const coords={priceToY:(price:number)=>100-price/1e11};
  const ctx={fillText(label:string){drawn.push(label);}} as unknown as CanvasRenderingContext2D;
  const axis={scale:{},bounds:{},x:5,maxWidth:60,precision:0,signed:false,suffix:'',transform:(v:number)=>v,label:(v:number)=>formatFundamentalAxisValue(v,'fundamental',cap,4.8e12,5.2e12),assertCurrent(){}};
  withIndicatorTickPrecision(ctx,coords as never,[axis],()=>{},(context,coordinates)=>{
   const y=(coordinates as any).priceToY(5.0e12,axis.scale,axis.bounds);
   (context as any).fillText('5000B',5,y,60);
  });
  expect(drawn).toEqual(['5.0T']);
 });
});
