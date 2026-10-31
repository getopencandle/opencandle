import {expect,it} from 'vitest';
import {parseColorValue,colorWithRGB,colorWithOpacity,colorRGBHex} from '../../src/ui/color-value';

it('converts independent literal hex, named, percentage and HSL examples',()=>{
 expect(parseColorValue('#3a8c')).toEqual({red:51,green:170,blue:136,alpha:.8});
 expect(parseColorValue('#12345680')).toEqual({red:18,green:52,blue:86,alpha:128/255});
 expect(parseColorValue('transparent')).toEqual({red:0,green:0,blue:0,alpha:0});
 expect(parseColorValue('red')).toEqual({red:255,green:0,blue:0,alpha:1});
 expect(parseColorValue('rgb(100% 0% 50% / 25%)')).toEqual({red:255,green:0,blue:127.5,alpha:.25});
 expect(parseColorValue('hsl(120 100% 25% / 0.4)')).toEqual({red:0,green:127.5,blue:0,alpha:.4});
 expect(parseColorValue('hsla(-240,100%,25%,40%)')).toEqual({red:0,green:127.5,blue:0,alpha:.4});
 expect(parseColorValue('hsl(222 0% 50%)')).toEqual({red:127.5,green:127.5,blue:127.5,alpha:1});
});
it('preserves alpha across deliberate RGB changes and fractional channels across opacity edits',()=>{
 const chosen=colorWithRGB('#12345680','#ff0000');expect(chosen).toBe('rgba(255,0,0,0.5019607843137255)');
 expect(parseColorValue(chosen)?.alpha).toBe(128/255);
 expect(colorWithOpacity('rgb(100% 0% 50% / 25%)',40)).toBe('rgba(255,0,127.5,0.4)');
 expect(colorWithOpacity('rgba(1.25,2.5,3.75,1)',0)).toBe('rgba(1.25,2.5,3.75,0)');
 expect(colorRGBHex(parseColorValue('rgb(100% 0% 50%)')!)).toBe('#ff0080');
});
it('does not silently replace invalid, automatic or unsupported colors with black',()=>{
 for(const value of ['', 'not-a-color','var(--secret)','url(https://example.invalid/a)','rgba(1,2,3,2)','rgb(1,2,300)','hsl(3 120% 40%)','rgba(1,2,3,1e-3)','x'.repeat(201)])expect(parseColorValue(value)).toBeNull();
 expect(()=>colorWithRGB('','#ffffff')).toThrow();
 expect(()=>colorWithOpacity('bad',50)).toThrow();
 expect(colorWithRGB('','#ffffff',true)).toBe('rgba(255,255,255,1)');
 expect(colorWithRGB('transparent','#ffffff')).toBe('rgba(255,255,255,0)');
});
it('guards untrusted helper inputs without coercion and rejects invalid control numbers',()=>{
 let reads=0;const value={get toString(){reads++;throw Error('getter');}};
 expect(parseColorValue(value)).toBeNull();expect(reads).toBe(0);
 for(const n of [NaN,Infinity,-1,101])expect(()=>colorWithOpacity('red',n)).toThrow();
 expect(()=>colorWithOpacity('red',Number.MIN_VALUE)).toThrow();
 expect(()=>colorWithRGB('red','#12')).toThrow();
});
it('preserves tiny decimal alpha without fixed precision or exponent syntax',()=>{
 const tiny='rgba(1,2,3,0.0000000000000000001)',changed=colorWithRGB(tiny,'#112233');
 expect(changed).toBe('rgba(17,34,51,0.0000000000000000001)');
 expect(parseColorValue(changed)?.alpha).toBe(1e-19);
});
