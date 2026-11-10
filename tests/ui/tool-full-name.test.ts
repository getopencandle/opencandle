import {expect,it} from 'vitest';
import {aboutHeading,fullToolName} from '../../src/ui/tool-reference';

it('spells out the abbreviations of a tool name once',()=>{
 expect(fullToolName('MACD')).toBe('MACD (Moving Average Convergence Divergence)');
 expect(fullToolName('Stochastic RSI')).toBe('Stochastic RSI (Relative Strength Index)');
 expect(fullToolName('Session VWAPs')).toBe('Session VWAPs (Volume Weighted Average Price)');
 expect(fullToolName('P/E bands')).toBe('P/E bands (Price to Earnings)');
 expect(fullToolName('Relative Strength Index')).toBe('Relative Strength Index');
 expect(fullToolName('Mass index')).toBe('Mass index');
});
it('heads an About view with the shown label and the full name',()=>{
 expect(aboutHeading('Relative Strength Index','RSI')).toBe('RSI (Relative Strength Index)');
 expect(aboutHeading('MACD','MACD')).toBe('MACD (Moving Average Convergence Divergence)');
 expect(aboutHeading('Volume','Volume')).toBe('Volume');
 expect(aboutHeading('Relative Strength Index')).toBe('Relative Strength Index');
});
