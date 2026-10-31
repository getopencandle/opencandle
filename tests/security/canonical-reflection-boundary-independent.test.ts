import {expect,it} from 'vitest';
import {LosslessDrawingDocument} from '../../src/chart/contracts';

// Explicit architecture limitation, not a supported mutation or security acceptance
// test. User imports and LVScript do not receive this same-realm object capability.
it('documents that arbitrary reflection can mutate TypeScript-private live data outside the public-mutator lease contract',()=>{
 const document=new LosslessDrawingDocument();document.load({version:1,drawings:[{id:'SYNTHETIC-line',type:'trendline',style:{lineColor:'red'}}]});
 const expected=document.all(),lease=document.prepareOwnedEditBatch(expected,[{...expected[0],style:{lineColor:'blue'}}]);lease.stage();
 const live=Object.getOwnPropertyDescriptor(document,'document')!.value;
 live.drawings[0].style.lineColor='REFLECTIVE-INTRUSION';
 expect(document.all()[0].style).toEqual({lineColor:'REFLECTIVE-INTRUSION'});
 // No public mutation entry advanced the private epoch. This deliberately proves
 // why bounded lease acceptance cannot claim protection against arbitrary reflection.
 expect(()=>lease.rollback()).not.toThrow();expect(document.all()[0].style).toEqual({lineColor:'red'});
});
