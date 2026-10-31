import {it,expect} from 'vitest';
import {csvCell} from '../../src/ui/FundamentalsDialog';
it('protects text cells from formula injection while retaining negative numerical facts',()=>{expect(csvCell(' =SUM(1,2)')).toBe('"\' =SUM(1,2)"');expect(csvCell('@HYPERLINK()')).toBe('"\'@HYPERLINK()"');expect(csvCell(-12.5)).toBe('"-12.5"');expect(csvCell('A "quoted" issuer')).toBe('"A ""quoted"" issuer"');});
