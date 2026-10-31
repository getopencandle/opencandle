// Decision 2026-10-28: "go with the standard the user expects": changing the symbol,
// the interval or the data source is navigation, like scrolling and zooming. It is never an undo step. Ctrl+Z / Ctrl+Y step
// through edits only, and an undo after a symbol change undoes the last real edit while the chart stays on the symbol the
// user is looking at. Drawings live per symbol (drawing scopes), so an undone edit on another symbol shows when the user
// returns to that symbol.
import {expect,it} from 'vitest';
import {patchWorkspace} from '../../src/ui/workspace-grid';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {fixtureDataset} from '../../src/domain/fixtures';
import {changedChartGrid,createWorkspaceHistory,historicalChartWorkspace,historyKeepsActiveSource} from '../../src/ui/workspace-history';
import {selectWorkspaceInterval} from '../../src/ui/workspace-intervals';
import {aggregateInterval,createIntervalMenuState} from '../../src/domain/intervals';

const doc=(...ids:string[])=>({version:1,drawings:ids.map(id=>({id,type:'trendline',paneId:'price',anchors:[{time:1000,price:12.125},{time:2000,price:30}],locked:false,visible:true,style:{lineColor:'#456789'}}))});
const ids=(state:{drawings:{drawings?:unknown}})=>((state.drawings.drawings??[]) as {id:string}[]).map(row=>row.id);
function start(){return patchWorkspace(createInitialWorkspace(),{drawings:doc('gme-1')});}

it('a symbol switch, a switch back and an interval switch record no undo step; an edit still does',()=>{
 const gme=start(),spy=patchWorkspace(gme,{symbol:'SPY'}),back=patchWorkspace(spy,{symbol:'GME'});
 expect(changedChartGrid(gme,spy)).toBe(false);expect(changedChartGrid(spy,back)).toBe(false);expect(changedChartGrid(gme,back)).toBe(false);
 const menu=createIntervalMenuState(),weekly=selectWorkspaceInterval(gme,aggregateInterval(fixtureDataset('GME',500),'1W',menu.policy).dataset,menu);
 expect(weekly.grid!.layout.cells[0].interval).toBe('1W');expect(changedChartGrid(gme,weekly)).toBe(false);
 expect(changedChartGrid(spy,patchWorkspace(spy,{drawings:doc('spy-1')}))).toBe(true);
 expect(changedChartGrid(gme,patchWorkspace(gme,{chartStyle:'line'}))).toBe(true);
 // A navigation commit that also edits (here: a drawing on the target symbol) is still recorded.
 const spyEdited=patchWorkspace(spy,{drawings:doc('spy-1')});expect(changedChartGrid(gme,spyEdited)).toBe(true);
});

it('undo after a symbol switch undoes the last edit, keeps the current symbol, and redo reapplies it',()=>{
 const history=createWorkspaceHistory<ReturnType<typeof start>>(),gme=start(),drawn=patchWorkspace(gme,{drawings:doc('gme-1','gme-2')});
 history.record(gme,null);// the edit
 const spy=patchWorkspace(drawn,{symbol:'SPY'});expect(changedChartGrid(drawn,spy)).toBe(false);// no record
 const entry=history.undo(spy,null)!;expect(historyKeepsActiveSource(spy,entry.workspace)).toBe(true);
 const undone=historicalChartWorkspace(spy,entry.workspace);
 expect(undone.symbol).toBe('SPY');expect(ids(undone)).toEqual([]);
 expect(ids(patchWorkspace(undone,{symbol:'GME'}))).toEqual(['gme-1']);// the undone drawing is gone on GME
 const again=history.redo(undone,null)!,redone=historicalChartWorkspace(undone,again.workspace);
 expect(redone.symbol).toBe('SPY');expect(ids(patchWorkspace(redone,{symbol:'GME'}))).toEqual(['gme-1','gme-2']);
 expect(history.status()).toMatchObject({undo:1,redo:0});
});

it('undo of an edit made on the current symbol after navigating away and back restores that symbol exactly',()=>{
 const history=createWorkspaceHistory<ReturnType<typeof start>>(),gme=start(),spy=patchWorkspace(gme,{symbol:'SPY'}),spyDrawn=patchWorkspace(spy,{drawings:doc('spy-1')});
 history.record(spy,null);const gmeAgain=patchWorkspace(spyDrawn,{symbol:'GME'}),spyAgain=patchWorkspace(gmeAgain,{symbol:'SPY'});
 expect(changedChartGrid(spyDrawn,spyAgain)).toBe(false);
 const entry=history.undo(spyAgain,null)!;expect(historyKeepsActiveSource(spyAgain,entry.workspace)).toBe(false);// same source: stored entry as before
 const undone=historicalChartWorkspace(spyAgain,entry.workspace);expect(undone.symbol).toBe('SPY');expect(ids(undone)).toEqual([]);expect(ids(patchWorkspace(undone,{symbol:'GME'}))).toEqual(['gme-1']);
});

it('undo after an interval switch keeps the interval and the current time scale',()=>{
 const gme=start(),drawn=patchWorkspace(gme,{drawings:doc('gme-1','gme-2')}),menu=createIntervalMenuState();
 const weekly=selectWorkspaceInterval(drawn,aggregateInterval(fixtureDataset('GME',500),'1W',menu.policy).dataset,menu),id=weekly.grid!.layout.activeCellId;
 weekly.grid!.cells[id].viewport={from:10,to:90};
 const undone=historicalChartWorkspace(weekly,gme);
 expect(undone.grid!.layout.cells[0].interval).toBe('1W');expect(undone.grid!.cells[id].datasetId).toBe(weekly.grid!.cells[id].datasetId);
 expect(undone.grid!.cells[id].viewport).toEqual({from:10,to:90});expect(ids(undone)).toEqual(['gme-1']);
});
