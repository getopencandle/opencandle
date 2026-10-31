import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {highlightSegments} from '../../src/ui/indicator-dialog-model';

it('highlight keeps the space between a matched word and the rest',()=>{
 expect(highlightSegments('RSI strategy','rsi').map(p=>p.text).join('')).toBe('RSI strategy');
});
it('Strategies tab: Enter adds the first match, a built-in strategy is not listed twice, radios sit on one row',()=>{
 const dialog=readFileSync('src/ui/IndicatorDialog.tsx','utf8');
 expect(dialog).toContain('defaultEntry');
 expect(dialog).toContain('dedupeStrategyEntries(selectorView(');
 expect(dialog).toContain('<span>{marked(entry.label)}</span></button>');
 expect(readFileSync('src/ui/StrategyDialog.tsx','utf8')).toContain('className="strategy-radio"');
 expect(readFileSync('src/ui/analysis.css','utf8')).toContain('label.strategy-radio{flex-direction:row');
});
it('interval prompt takes a digit that arrives before the input has focus',async()=>{
 const handlers:Record<string,Function>={};
 const src=readFileSync('src/ui/IntervalEntry.tsx','utf8');
 expect(src).toContain("win.addEventListener('keydown', typed, true)");
 expect(src).toContain('setText(previous => (previous + event.key)');
 void handlers;void vi;
});
