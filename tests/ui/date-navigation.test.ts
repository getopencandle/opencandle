import {expect,it} from 'vitest';
import {utcDateInput} from '../../src/ui/DateNavigationDialog';
it('uses UTC regardless of host timezone and rejects normalized invalid dates',()=>{expect(utcDateInput('2024-02-29T12:30')).toBe(1709209800);expect(()=>utcDateInput('2025-02-29T12:30')).toThrow('exist');expect(()=>utcDateInput('2024-01-01T24:00')).toThrow('exist');expect(()=>utcDateInput('not-a-date')).toThrow('valid');});
