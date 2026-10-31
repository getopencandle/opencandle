import {expect,it} from 'vitest';
import {parseColorValue,colorWithRGB,colorWithOpacity,colorRGBHex} from '../../src/ui/color-value';
import {supportedColor} from '../../src/chart/color-validation';

it('uses independent HSL sector and wrapped-hue literal channel values',()=>{
 for(const [hue,rgb] of [[0,[255,0,0]],[60,[255,255,0]],[120,[0,255,0]],[180,[0,255,255]],[240,[0,0,255]],[300,[255,0,255]],[-60,[255,0,255]],[780,[255,255,0]]] as const){
  expect(parseColorValue(`hsl(${hue} 100% 50% / 12.5%)`)).toEqual({red:rgb[0],green:rgb[1],blue:rgb[2],alpha:.125});
 }
 expect(parseColorValue('green')).toEqual({red:0,green:128,blue:0,alpha:1});
 expect(parseColorValue('HsLa(42,0%,25%,0.25)')).toEqual({red:63.75,green:63.75,blue:63.75,alpha:.25});
});

it('keeps original alpha exact through repeated explicit RGB edits without percentage quantization',()=>{
 for(const alpha of ['0','0.5019607843137255','0.12345678901234568','0.0000000000000000001']){
  let next=`rgba(1.25,2.5,3.75,${alpha})`;
  for(const hex of ['#abcdef','#000000','#ffffff','#123456']){
   next=colorWithRGB(next,hex);expect(supportedColor(next)).toBe(true);expect(parseColorValue(next)!.alpha).toBe(Number(alpha));
  }
 }
 expect(parseColorValue(colorWithRGB('#12345680','#654321'))!.alpha).toBe(128/255);
});

it('opacity-only changes preserve decimal and percentage channels rather than the displayed RGB approximation',()=>{
 const original='rgb(10.5% 20.25% 30.125% / 12.5%)';
 const parsed=parseColorValue(original)!;expect(parsed.red).toBeCloseTo(26.775,12);expect(parsed.green).toBeCloseTo(51.6375,12);expect(parsed.blue).toBeCloseTo(76.81875,12);
 expect(colorRGBHex(parsed)).toBe('#1b344d');
 for(const percent of [0,.001,12.3456789012345,100]){
  const output=colorWithOpacity(original,percent);expect(supportedColor(output)).toBe(true);
  expect(parseColorValue(output)).toEqual({...parsed,alpha:percent/100});
 }
});

it('has no receiver-opacity side effect and keeps opaque replacement distinct from transparent RGB selection',()=>{
 const receiver={color:'#12345680',opacity:40,highOpacity:.25};
 const result=colorWithRGB(receiver.color,'#abcdef');expect(parseColorValue(result)!.alpha).toBe(128/255);
 expect(receiver).toEqual({color:'#12345680',opacity:40,highOpacity:.25});
 expect(parseColorValue(colorWithRGB('transparent','#ffffff'))).toEqual({red:255,green:255,blue:255,alpha:0});
 expect(()=>colorWithOpacity('',50)).toThrow();expect(()=>colorWithRGB('','#ffffff')).toThrow();
 expect(parseColorValue(colorWithRGB('','#ffffff',true))).toEqual({red:255,green:255,blue:255,alpha:1});
});

it('rejects hostile untrusted strings and values before invoking coercion or getter code',()=>{
 let reads=0;const hostile={get toString(){reads++;throw Error('must not read');},get valueOf(){reads++;throw Error('must not read');}};
 for(const invalid of [undefined,null,hostile,['red'],new String('red'),'url(javascript:alert(1))','var(--x)','currentColor','rgb(1,20%,3)','rgb(256 0 0)','hsl(20 50 50%)','rgba(1,2,3,-.1)','rgb(1 2 3 / 101%)','rgb(1 2 3 / 1e-5)','x'.repeat(201)]){
  expect(parseColorValue(invalid)).toBeNull();expect(()=>colorWithOpacity(invalid,50)).toThrow();expect(()=>colorWithRGB(invalid,'#123456')).toThrow();
 }
 expect(reads).toBe(0);
});

it('validates control inputs rather than silently clamping or accepting browser-only syntax',()=>{
 for(const value of [NaN,Infinity,-Infinity,-.001,100.001,Number.MIN_VALUE])expect(()=>colorWithOpacity('red',value)).toThrow();
 for(const hex of ['#fff','#12345678','#12 456','rgb(1,2,3)','ffffff'])expect(()=>colorWithRGB('red',hex)).toThrow();
 expect(parseColorValue(colorWithOpacity('rgba(1,2,3,0)',100))!.alpha).toBe(1);
});
