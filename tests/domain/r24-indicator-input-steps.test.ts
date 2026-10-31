import {describe,expect,it} from 'vitest';
import {INDICATOR_KINDS,indicatorInputSchema} from '../../src/chart/indicator-settings';
import {CATALOG_INDICATORS} from '../../src/domain/indicator-catalog';

// The settings dialog renders each numeric input with its schema min and step (step="any" only for
// band multipliers and floats without a step, IndicatorDialog.tsx). HTML constraint validation then rejects any value that
// is not min + k x step, and a form with an invalid control does not submit. ALMA sigma and Zig zag deviation had min
// 0.001 with step 0.1, so their own defaults (6 and 5) failed the step check and Settings Ok did nothing. Every default
// must sit on its step grid, and inside its bounds.
const onGrid=(value:number,min:number,step:number)=>{const k=(value-min)/step;return Math.abs(k-Math.round(k))<=1e-9;};
/** The step attribute the dialog actually renders for a field (mirrors IndicatorDialog.tsx). */
const renderedStep=(field:{key:string;type:string;step?:number})=>field.key.startsWith('band')&&field.key.endsWith('Multiplier')||field.type==='float'&&field.step===undefined?'any':field.step;

describe('indicator input defaults pass the HTML step and range checks',()=>{
 it('every catalog numeric input with min and step: (defval - min) / step is an integer within 1e-9',()=>{
  const failures:string[]=[];
  for(const definition of CATALOG_INDICATORS)for(const input of definition.inputs){
   if(typeof input.defval!=='number'||input.min===undefined||input.step===undefined)continue;
   if(!onGrid(input.defval,input.min,input.step))failures.push(`${definition.id}.${input.key}: default ${input.defval}, min ${input.min}, step ${input.step}`);
   if(input.defval<input.min||input.max!==undefined&&input.defval>input.max)failures.push(`${definition.id}.${input.key}: default ${input.defval} outside ${input.min}..${input.max}`);
  }
  expect(failures).toEqual([]);
 });
 it('every rendered numeric settings field of every indicator kind (built-ins included) accepts its own default',()=>{
  const failures:string[]=[];let checked=0;
  for(const kind of INDICATOR_KINDS)for(const field of indicatorInputSchema(kind)){
   if(typeof field.defval!=='number'||field.options)continue;
   const step=renderedStep(field);if(step==='any'||step===undefined||field.min===undefined)continue;checked++;
   if(!onGrid(field.defval,field.min,step))failures.push(`${kind}.${field.key}: default ${field.defval}, min ${field.min}, step ${step}`);
  }
  expect(checked).toBeGreaterThan(50);expect(failures).toEqual([]);
 });
 it('ALMA sigma and Zig zag deviation keep their defaults and a step the dialog can reach them on',()=>{
  const field=(kind:string,key:string)=>CATALOG_INDICATORS.find(row=>row.id===kind)!.inputs.find(row=>row.key===key)!;
  expect(field('alma','sigma')).toMatchObject({defval:6,type:'float'});expect(field('zigzag','deviation')).toMatchObject({defval:5,type:'float'});
  for(const [kind,key] of [['alma','sigma'],['zigzag','deviation']] as const){const input=field(kind,key);expect(onGrid(input.defval as number,input.min!,input.step!),kind).toBe(true);expect(input.min!).toBeGreaterThan(0);}
 });
});
