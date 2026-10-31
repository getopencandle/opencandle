import {expect,it} from 'vitest';
import {friendlyError,errorDetails} from '../../src/ui/user-error';
const INTERNAL='Chart tree input or configuration is not settled: 918c3f51-1dd5-4de9-b604-a7c0d932290e.';
const PUBLIC='The chart is not settled yet. Wait a moment and try again.';
it('keeps a current chart readiness refusal actionable without exposing its private cell identifier',()=>{
 expect(friendlyError(new Error(INTERNAL))).toBe(PUBLIC);
 expect(friendlyError(INTERNAL)).toBe(PUBLIC);
 expect(friendlyError('Error: '+INTERNAL)).toBe(PUBLIC);
});
it('keeps the same private identifier out of the status tooltip',()=>{
 expect(errorDetails(new Error(INTERNAL))).toBe(PUBLIC);
 expect(errorDetails(INTERNAL)).toBe(PUBLIC);
 expect(errorDetails('Error: '+INTERNAL)).toBe(PUBLIC);
});
it('does not modify the original thrown failure or classify unrelated readable messages as chart readiness',()=>{
 const cause=new Error(INTERNAL);friendlyError(cause);errorDetails(cause);expect(cause.message).toBe(INTERNAL);
 expect(friendlyError('Enter a name of 1 to 200 characters')).toBe('Enter a name of 1 to 200 characters.');
 expect(errorDetails(new RangeError('Enter a name of 1 to 200 characters'))).toBe('RangeError: Enter a name of 1 to 200 characters');
 expect(friendlyError('Chart tree input or configuration is not settledness')).toBe('Chart tree input or configuration is not settledness.');
});
