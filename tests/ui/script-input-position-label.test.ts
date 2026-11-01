// OpenCandle 0.8.2: a table position input (the Daily ATR example's Panel position, default bottom_right) reads as a
// position in the legend and in the Settings choices ("Bottom right"), never as the raw token. The stored value is unchanged.
import {describe,expect,it} from 'vitest';
import {formatScriptLegendInputs,scriptInputValueText} from '../../src/ui/script-legend-inputs';
import {scriptExamples} from '../../src/ui/ScriptPanel';

describe('table position inputs read as positions',()=>{
 it('every table position token has a readable label; other values pass through',()=>{
  expect(['top_left','top_center','top_right','middle_left','middle_center','middle_right','bottom_left','bottom_center','bottom_right'].map(scriptInputValueText))
   .toEqual(['Top left','Top center','Top right','Middle left','Middle center','Middle right','Bottom left','Bottom center','Bottom right']);
  for(const value of ['hlc3','Bottom right','bottom_right_x','snake_case_value','',' bottom_right'])expect(scriptInputValueText(value)).toBe(value);
 });
 it('the Daily ATR legend shows its length and "Bottom right"',()=>{
  expect(scriptExamples['Daily ATR panel']).toContain("default: 'bottom_right'");
  const description={source:scriptExamples['Daily ATR panel'],savedInputs:null,parts:[{id:'length',type:'int',value:14},{id:'position',type:'string',value:'bottom_right'}]};
  const text=formatScriptLegendInputs(description)!;expect(text).toBe('14 Bottom right');expect(text).not.toContain('_');
  expect(formatScriptLegendInputs({...description,parts:[{id:'position',type:'string',value:'middle_left'}]})).toBe('Middle left');
 });
});
