import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {drawingScopeBasis,drawingScopeKey,transitionDrawingScope,validateCellDrawingScopes,type DrawingScopedCell} from '../../src/ui/drawing-scopes';
const gme=fixtureDataset('GME',1),spy=fixtureDataset('SPY',1);
const drawing=(id='synthetic-line')=>({id,type:'trendline',paneId:'price',anchors:[{time:1704153600,price:100.005},{time:1704240000,price:101.25}],visible:false,locked:true,future:{labels:['Synthetic original']}});
const cell=()=>({drawings:{version:1,drawings:[drawing()]}});

it('rejects malformed coordinate enums without executing coercion hooks',()=>{
 let calls=0;for(const field of ['assetClass','adjustment']){const source=structuredClone(gme),hook={toString(){calls++;return field==='assetClass'?'stock':'raw';}};
 if(field==='assetClass')source.instrument.assetClass=hook as any;else source.provenance.adjustment=hook as any;
 expect(()=>drawingScopeBasis(source)).toThrow();}
 expect(calls).toBe(0);
});

it('scope preparation does not execute an unrelated own cell accessor during its generic copy',()=>{
 let reads=0;const original=cell();Object.defineProperty(original,'futureCellMetadata',{enumerable:true,get(){reads++;return {source:'Synthetic'};}});
 expect(()=>transitionDrawingScope(original,gme,spy)).toThrow();expect(reads).toBe(0);expect(original.drawings.drawings[0].id).toBe('synthetic-line');
});

it('rejects hidden, symbol, sparse and hook scope data before any getter executes',()=>{
 let reads=0;const valid=transitionDrawingScope(cell(),gme,spy),hidden=structuredClone(valid);Object.defineProperty(hidden.drawingScopes!.activeBasis,'symbol',{value:'SPY',enumerable:false});
 const symbol=structuredClone(valid);(symbol.drawingScopes!.activeBasis as any)[Symbol('extra')]=true;
 const sparse=structuredClone(valid);delete sparse.drawingScopes!.inactive[0];
 const accessor=structuredClone(valid);Object.defineProperty(accessor.drawingScopes!.inactive[0].document,'drawings',{enumerable:true,get(){reads++;return [];}});
 const hook=structuredClone(valid);(hook.drawings as any).toJSON=()=>{reads++;return {};};
 for(const candidate of [hidden,symbol,sparse,accessor,hook])expect(()=>validateCellDrawingScopes(candidate,spy)).toThrow();expect(reads).toBe(0);
});

it('metadata-only basis validation never reads bars and preserves exact qualified identities',()=>{
 let reads=0;const source=structuredClone(gme);Object.defineProperty(source,'bars',{enumerable:true,get(){reads++;throw Error('Future bars unavailable');}});
 expect(drawingScopeKey(drawingScopeBasis(source))).toBe(drawingScopeKey(drawingScopeBasis(gme)));expect(reads).toBe(0);
});

it('unknown adjustment uses exact provider and dataset identity while known compatible bases preserve literal anchors',()=>{
 const unknown=structuredClone(gme);unknown.provenance.adjustment='unknown';const changed=structuredClone(unknown);changed.provenance.providerId='different-public-provider';changed.provenance.datasetId='same-symbol-other-dataset';
 expect(drawingScopeKey(drawingScopeBasis(changed))).not.toBe(drawingScopeKey(drawingScopeBasis(unknown)));
 const changedScope=transitionDrawingScope(cell(),unknown,changed);expect(changedScope.drawings.drawings).toEqual([]);expect(transitionDrawingScope(changedScope,changed,unknown).drawings).toEqual(cell().drawings);
 const known=structuredClone(gme);known.provenance.providerId='different-public-provider';known.provenance.datasetId='other';known.provenance.session='extended';known.resolution='1m';
 const normalized=transitionDrawingScope(cell(),gme,gme);expect(transitionDrawingScope(normalized,gme,known)).toBe(normalized);expect(normalized.drawings.drawings[0].anchors[0].price).toBe(100.005);
});

it('128 opaque nonempty archives admit empty visits but reject an additional capture without eviction',()=>{
 const original:DrawingScopedCell={drawings:{version:1,drawings:[]},drawingScopes:{schemaVersion:1,activeBasis:drawingScopeBasis(gme),inactive:Array.from({length:128},(_,index)=>({basis:drawingScopeBasis(fixtureDataset('ARCHIVE'+index,0)),document:{version:1,drawings:[],opaque:{index,label:'Synthetic retained metadata'}}}))}};
 expect(validateCellDrawingScopes(original,gme)!.inactive).toHaveLength(128);const serialized=JSON.stringify(original),candidate={...original,drawings:{version:1,drawings:[drawing()]}};
 expect(()=>validateCellDrawingScopes(candidate,gme)).toThrow('too many saved drawing groups');expect(()=>transitionDrawingScope(candidate,gme,spy)).toThrow('too many saved drawing groups');expect(JSON.stringify(original)).toBe(serialized);
 const next=transitionDrawingScope(original,gme,spy);expect(next.drawingScopes!.inactive).toHaveLength(128);expect(next.drawings.drawings).toEqual([]);
});

it('shared template-only active state adds no geometry scope and preserves the latest library across returns',()=>{
 const template={id:'synthetic-template',name:'Synthetic style',type:'trendline',properties:{lineColor:'#123456'}};
 let current:any=transitionDrawingScope({...cell(),drawings:{version:1,drawings:[drawing()],lvDrawingManager:{schemaVersion:1,groups:[],templates:[template],future:{owner:'GME'}}}},gme,spy);
 current.drawings.lvDrawingManager.templates[0].name='Latest shared style';expect(current.drawingScopes.inactive[0].document.lvDrawingManager.templates).toEqual([]);
 current=transitionDrawingScope(current,spy,gme);expect(current.drawings.drawings).toEqual([drawing()]);expect(current.drawings.lvDrawingManager.templates[0].name).toBe('Latest shared style');expect(current.drawings.lvDrawingManager.future).toEqual({owner:'GME'});expect(current.drawingScopes.inactive).toEqual([]);
});

it('prototype-sensitive drawing IDs remain literal and detached with no cross-market copy',()=>{
 const original={drawings:{version:1,drawings:['__proto__','constructor','toString'].map(drawing)}};const serialized=JSON.stringify(original),next=transitionDrawingScope(original,gme,spy),restored=transitionDrawingScope(next,spy,gme);
 expect(next.drawings.drawings).toEqual([]);expect(restored.drawings).toEqual(original.drawings);expect(restored.drawings).not.toBe(original.drawings);expect(Object.getPrototypeOf(restored.drawings)).toBe(Object.prototype);
 (restored.drawings.drawings as any[])[0].anchors[0].price=999;expect(JSON.stringify(original)).toBe(serialized);
});
