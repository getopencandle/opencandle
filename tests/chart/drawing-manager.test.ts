import {it,expect} from 'vitest';
import {createDrawing,deserializeDrawing,type DrawingTypeKey} from '@luxalgo/vela';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {createDrawingManager,templateProperties,type DrawingManagerHost} from '../../src/chart/drawing-manager';
import {patchDrawingProperties} from '../../src/chart/drawing-port';
import {createDrawingTemplateBatches} from '../../src/chart/drawing-template-batch';
const drawing=(id:string,type:DrawingTypeKey='trendline')=>createDrawing(type,{id,paneId:'price',anchors:[{time:1000,price:10},{time:2000,price:20}],style:{lineColor:'#123456',lineWidth:2,lineStyle:'solid'}})!.serialize();
function harness(){const known=new Set(['trendline','hline']),document=new LosslessDrawingDocument();document.load({version:1,foreign:{retained:true},drawings:[{...drawing('a'),future:{x:1}},drawing('b'),{id:'opaque',type:'future-tool',payload:{opaque:[1,2]}}]});let native=document.all().filter(row=>known.has(String(row.type))),commands=0,selected:string[]=[];const sync=()=>document.mergeRenderable(native,known,false);
 const host:DrawingManagerHost={read:()=>document.serialize(),write:next=>document.load(next),known:type=>known.has(type),update:updates=>{for(const {id,patch} of updates){const index=native.findIndex(row=>row.id===id);native[index]=deserializeDrawing(patch)!.serialize() as unknown as Record<string,unknown>;}sync();},remove:ids=>{native=native.filter(row=>!ids.includes(String(row.id)));sync();},select:ids=>{selected=ids;},front:id=>{native=native.map(row=>row.id===id?{...row,z:10}:row);sync();},back:id=>{native=native.map(row=>row.id===id?{...row,z:-10}:row);sync();},changed:()=>{},transaction:operation=>{const before=document.serialize(),old=structuredClone(native);try{const result=operation();commands++;return result;}catch(e){document.load(before);native=old;throw e;}}};
 host.templateBatches=createDrawingTemplateBatches({captureOwner:()=>()=>{},assertMutable:()=>{},readDocument:()=>document.serialize(),captureNative:()=>{throw Error('This unit fixture permits only pure no-op template admission');},prepareEdit:(previous,next)=>document.prepareOwnedEditBatch(previous,next),begin(){throw Error('No native work permitted in this fixture');},end(){},update(){throw Error('No native work permitted in this fixture');},quarantine(){throw Error('No native work permitted in this fixture');}});
 return{port:createDrawingManager(host),document,commands:()=>commands,selected:()=>selected,host};
}
it('groups use stable IDs, retain opaque records, transfer flat membership and ungroup without deleting drawings',()=>{
 const {port,document,commands}=harness(),first=port.group(['a','opaque'],'First'),second=port.group(['a','b'],'Second');expect(port.state().groups.find(row=>row.id===first)?.memberIds).toEqual(['opaque']);expect(port.state().groups.find(row=>row.id===second)?.memberIds).toEqual(['a','b']);port.renameGroup(second,'Renamed');port.ungroup(first);expect(port.state().groups).toHaveLength(1);expect(document.all()).toHaveLength(3);expect(commands()).toBe(4);expect(document.serialize().foreign).toEqual({retained:true});
 const selection=port.select(['a','opaque']);expect(selection).toEqual({selectedIds:['a'],unavailableIds:['opaque']});
});
it('position style templates exclude financial inputs and geometry setters while retaining fill styling',()=>{
 const source=createDrawing('position',{id:'source',paneId:'price',anchors:[{time:1000,price:100},{time:2000,price:90},{time:2000,price:120}],props:{accountBalance:10000,riskPercent:1,profitColor:'#12ab34'}})!.serialize(),target=createDrawing('position',{id:'target',paneId:'price',anchors:[{time:3000,price:200},{time:4000,price:190},{time:4000,price:230}],props:{accountBalance:5000,riskPercent:2}})!.serialize(),properties=templateProperties(source);
 for(const path of ['entryPrice','stopPrice','targetPrice','direction','quantity','accountBalance','riskPercent','locked','visible'])expect(Object.hasOwn(properties,path)).toBe(false);
 const applied=patchDrawingProperties(target,properties);expect(applied.anchors).toEqual(target.anchors);expect(applied.props).toEqual(expect.objectContaining({accountBalance:5000,riskPercent:2,profitColor:'#12ab34'}));
});
it('bulk lock/hide/delete commit once and preserve opaque payload and unrelated future metadata',()=>{
 const {port,document,commands}=harness();port.set(['a','opaque'],{locked:true,visible:false});expect(commands()).toBe(1);expect(document.all().find(row=>row.id==='opaque')).toEqual({id:'opaque',type:'future-tool',payload:{opaque:[1,2]},locked:true,visible:false});expect(document.all().find(row=>row.id==='a')?.future).toEqual({x:1});
 const group=port.group(['a','b'],'Group');port.remove(['a','opaque']);expect(port.state().groups.find(row=>row.id===group)?.memberIds).toEqual(['b']);expect(document.all().map(row=>row.id)).toEqual(['b']);
});
it('templates preserve coordinates, identity and lock while applying only validated same-tool properties',()=>{
 const {port,document}=harness(),before=document.all().find(row=>row.id==='b')!,id=port.saveTemplate('a','Trend look');expect(Object.keys(port.state().templates[0].properties)).not.toContain('locked');expect(Object.keys(port.state().templates[0].properties)).not.toContain('anchors');port.applyTemplate(['b'],id);const after=document.all().find(row=>row.id==='b')!;expect(after.id).toBe('b');expect(after.anchors).toEqual(before.anchors);expect(after.locked).toEqual(before.locked);expect(()=>port.applyTemplate(['opaque'],id)).toThrow('same supported drawing type');expect(templateProperties(drawing('template'))['anchors']).toBeUndefined();
});
it('invalid template or partially failing bulk rendering leaves the previous authoritative document unchanged',()=>{
 const {port,document,host}=harness(),id=port.saveTemplate('a','Valid');const corrupted=document.serialize() as any;corrupted.lvDrawingManager.templates[0].properties['style.imaginary']=true;document.load(corrupted);const before=document.serialize();expect(()=>port.applyTemplate(['a'],id)).toThrow('not supported');expect(document.serialize()).toEqual(before);
 host.update=()=>{throw new Error('Renderer failed');};expect(()=>port.set(['a','b'],{locked:true})).toThrow('Renderer failed');expect(document.serialize()).toEqual(before);
});
it('unknown manager schema is retained and rejects edits rather than silently dropping future data',()=>{
 const {port,document}=harness(),snapshot=document.serialize();document.load({...snapshot,lvDrawingManager:{schemaVersion:99,future:{opaque:true}}});const before=document.serialize();expect(()=>port.group(['a'],'Group')).toThrow('schema is unavailable');expect(document.serialize()).toEqual(before);expect(()=>port.order(['opaque'],'front')).toThrow('no available render ordering');
});
it('native deletion reconciliation prunes removed memberships before model removal and retains empty folders',()=>{
 const {port,document,host}=harness(),id=port.group(['a','b'],'Native group');port.reconcileRemoved(['a','b']);host.remove(['a','b']);expect(port.state().groups.find(row=>row.id===id)?.memberIds).toEqual([]);expect(document.all().map(row=>row.id)).toEqual(['opaque']);
});
it('known-schema overlapping, duplicate and orphan group memberships report unavailable and preserve payload',()=>{
 for(const members of [['a','a'],['missing']]){const {port,document}=harness();document.load({...document.serialize(),lvDrawingManager:{schemaVersion:1,groups:[{id:'g',name:'Bad',memberIds:members}],templates:[]}});const before=document.serialize();expect(()=>port.state()).toThrow('membership has been retained');expect(document.serialize()).toEqual(before);}
 const {port,document}=harness();document.load({...document.serialize(),lvDrawingManager:{schemaVersion:1,groups:[{id:'g1',name:'One',memberIds:['a']},{id:'g2',name:'Two',memberIds:['a']}],templates:[]}});expect(()=>port.state()).toThrow('membership has been retained');
});
it('individual object rename persists metadata without changing tool, coordinates, style or opaque payload',()=>{
 const {port,document,commands}=harness(),before=document.all().find(row=>row.id==='a')!;port.renameDrawing('a','  Opening trend  ');expect(document.all().find(row=>row.id==='a')).toEqual({...before,lvName:'Opening trend'});port.renameDrawing('opaque','Future object');expect(port.list().find(row=>row.id==='opaque')?.payload).toEqual({opaque:[1,2]});expect(commands()).toBe(2);const snapshot=document.serialize();expect(()=>port.renameDrawing('a','  ')).toThrow('Enter a name');expect(document.serialize()).toEqual(snapshot);
});
