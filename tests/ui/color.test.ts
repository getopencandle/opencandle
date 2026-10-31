import {describe,it,expect} from 'vitest';
import {colorParts,colorFromPicker} from '../../src/ui/color';
describe('theme alpha preservation',()=>{
 it('expands short hexadecimal with exact alpha',()=>{expect(colorParts('#3a8c')).toEqual({hex:'#33aa88',alpha:0.8,supported:true});});
 it('keeps eight-digit channels and alpha',()=>{const parsed=colorParts('#12345680');expect(parsed.hex).toBe('#123456');expect(parsed.alpha).toBeCloseTo(128/255,12);expect(colorFromPicker(parsed.hex,parsed.alpha)).toBe('rgba(18, 52, 86, 0.5019607843137255)');});
 it('does not silently turn unsupported CSS into an editable black picker',()=>{expect(colorParts('hsl(120 50% 20%)').supported).toBe(false);expect(colorParts('rgba(256,0,0,1)').supported).toBe(false);});
 it('retains independent alpha while changing RGB',()=>{expect(colorFromPicker('#ff0000',0.35)).toBe('rgba(255, 0, 0, 0.35)');});
});
