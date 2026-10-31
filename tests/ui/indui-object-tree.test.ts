import {describe,expect,it,vi} from 'vitest';
import {pinToScaleMenu,pinToScalePlacement} from '../../src/ui/object-tree-model';
import {INDICATOR_SCALE_PLACEMENT_MENU,INDICATOR_SCALE_GAPS} from '../../src/chart/indicator-scale';
import {removeObjectsAsOneStep} from '../../src/ui/object-tree-removal';

// object tree evidence: ASSIGN_SCALE row action over the placement menu (read-only import) and the
// FX-F5 one-publication multi-removal contract. SYNTHETIC ports; no GUI claim.
describe('Pin to scale row action (SLI#more.pinToScale)',()=>{
 it('offers the reference placements in menu order, then LV own scale, marking the current one',()=>{
  const items=pinToScaleMenu('shared',{left:true,none:true});
  expect(items.map(item=>item.label)).toEqual([...INDICATOR_SCALE_PLACEMENT_MENU.map(row=>row.label),'Pin to new right scale']);// Renamed from "Separate right scale" to mirror the captured "Pin to new left scale"
  expect(items.map(item=>item.id)).toEqual(['pin-shared','pin-left','pin-none','pin-own']);
  expect(items.map(item=>item.checked===true)).toEqual([true,false,false,false]);
  expect(items.every(item=>!item.disabled)).toBe(true);
  expect(pinToScaleMenu('own',{left:true,none:true}).find(item=>item.checked)?.id).toBe('pin-own');
 });
 it('left and none stay in place but disabled with the renderer gap as the reason when unsupported',()=>{
  const items=pinToScaleMenu('shared',{left:false,none:false});
  expect(items.find(item=>item.id==='pin-left')).toMatchObject({disabled:true,title:INDICATOR_SCALE_GAPS.left});
  expect(items.find(item=>item.id==='pin-none')).toMatchObject({disabled:true,title:INDICATOR_SCALE_GAPS.none});
  expect(items.find(item=>item.id==='pin-shared')?.disabled).toBeUndefined();
  expect(items.find(item=>item.id==='pin-own')?.disabled).toBeUndefined();
 });
 it('an unmounted indicator (no current placement) disables every placement',()=>{
  const items=pinToScaleMenu(null,{left:true,none:true});
  expect(items.every(item=>item.disabled===true&&!!item.title)).toBe(true);
 });
 it('maps item ids back to placements and rejects anything else',()=>{
  expect(['pin-shared','pin-left','pin-none','pin-own'].map(pinToScalePlacement)).toEqual(['shared','left','none','own']);
  expect(()=>pinToScalePlacement('pin-other')).toThrow(/placement/i);
 });
});

describe('FX-F5 multi-removal is one publication',()=>{
 it('holds publication around every removal and releases once',()=>{
  const trace:string[]=[],port={beginExternalTransaction:vi.fn(()=>{trace.push('hold');return{release:(publish:boolean)=>{trace.push('release:'+publish);}};}),remove:vi.fn((id:string)=>{trace.push('remove:'+id);})};
  removeObjectsAsOneStep(port,['a','b','c'],()=>trace.push('drawings'));
  expect(trace).toEqual(['hold','remove:a','remove:b','remove:c','drawings','release:true']);
  expect(port.beginExternalTransaction).toHaveBeenCalledTimes(1);
 });
});
