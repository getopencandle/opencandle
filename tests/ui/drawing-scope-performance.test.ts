import {expect,it} from 'vitest';
import {writeFileSync} from 'node:fs';
import {fixtureDataset} from '../../src/domain/fixtures';
import {drawingScopeBasis,transitionDrawingScope,validateCellDrawingScopes,type DrawingScopedCell} from '../../src/ui/drawing-scopes';
const document=()=>({version:1,drawings:Array.from({length:100},(_,index)=>({id:'line-'+index,type:'trendline',paneId:'price',anchors:[{time:1000+index,price:10+index},{time:2000+index,price:20+index}],style:{lineColor:'#123456',lineWidth:2},locked:index%2===0,visible:true}))});
it('measures a full 128-market bank with 100 drawings per market without hiding responsiveness costs',()=>{
 const source=fixtureDataset('GME',1),next=fixtureDataset('SPY',1),cell:DrawingScopedCell={drawings:document(),drawingScopes:{schemaVersion:1,activeBasis:drawingScopeBasis(source),inactive:Array.from({length:127},(_,index)=>({basis:drawingScopeBasis(fixtureDataset('X'+index,1)),document:document()}))}},bytes=new TextEncoder().encode(JSON.stringify(cell)).length;
 const started=performance.now(),changed=transitionDrawingScope(cell,source,next),transitionMs=performance.now()-started,checkStart=performance.now();validateCellDrawingScopes(changed,next);const validationMs=performance.now()-checkStart;
 expect(changed.drawings.drawings).toEqual([]);expect(changed.drawingScopes.inactive).toHaveLength(128);expect((changed.drawingScopes.inactive.at(-1)!.document.drawings as unknown[])).toHaveLength(100);expect(cell.drawingScopes!.inactive).toHaveLength(127);
 writeFileSync('reports/performance-drawing-scopes.json',JSON.stringify({schemaVersion:1,recordedAt:new Date().toISOString(),workload:'one chart, 128 nonempty scopes, 100 synthetic trend lines per scope',bytes,transitionMs,validationMs,modelCeilingMs:1000,interactionBudgetMs:50,interactionBudgetMet:transitionMs<=50&&validationMs<=50,interfaceTested:false,limits:'Synchronous pure model preparation and validation only. Excludes parent cloning, history retention, complete workspace admission, native drawing adoption and disk save.'},null,2)+'\n');
 expect(transitionMs).toBeLessThan(1000);expect(validationMs).toBeLessThan(1000);
});
