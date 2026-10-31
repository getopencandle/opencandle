import React from 'react';
import {expect,it} from 'vitest';
import {groupActiveStudyPaneRows,scriptPanePlacements,sameScriptPanePlacements} from '../../src/ui/active-study-pane-rows';

it('combines builtin and script nodes into exactly one actual pane group without rerendering producers',()=>{
 const price=React.createElement('div',null,'Builtin price'),pane=React.createElement('div',null,'Builtin separate'),script=React.createElement('div',null,'Script separate');
 const value=groupActiveStudyPaneRows([{id:'price',paneId:'price',node:price},{id:'pane',paneId:'SYNTHETIC pane',node:pane}],[{id:'script',actualPaneId:'SYNTHETIC pane',node:script}]);
 expect(value.price.map(row=>row.node)).toEqual([price]);expect(value.panes).toHaveLength(1);expect(value.panes[0].paneId).toBe('SYNTHETIC pane');expect(value.panes[0].rows.map(row=>row.node)).toEqual([pane,script]);expect(value.unplaced).toEqual([]);
});
it('missing script placement is explicitly unavailable and never follows the legacy builtin null-to-price policy',()=>{
 const builtin=React.createElement('div',null,'Pending builtin'),script=React.createElement('div',null,'Pending script'),value=groupActiveStudyPaneRows([{id:'same',paneId:null,node:builtin}],[{id:'same',actualPaneId:null,node:script}]);expect(value.price).toEqual([{key:'builtin:same',node:builtin}]);expect(value.unplaced).toEqual([{key:'script:same',node:script}]);expect(value.panes).toEqual([]);expect(value.price[0].key).not.toBe(value.unplaced[0].key);
});
it('placement comparison ignores record identity/order and observes actual pane loss and recovery',()=>{
 const original=scriptPanePlacements([{id:'a',actualPaneId:'price'},{id:'b',actualPaneId:'SYNTHETIC pane'}]);expect(sameScriptPanePlacements(original,scriptPanePlacements([{id:'b',actualPaneId:'SYNTHETIC pane'},{id:'a',actualPaneId:'price'}]))).toBe(true);expect(sameScriptPanePlacements(original,scriptPanePlacements([{id:'a',actualPaneId:'price'},{id:'b',actualPaneId:null}]))).toBe(false);expect(sameScriptPanePlacements(original,new Map())).toBe(false);expect(sameScriptPanePlacements(new Map(),new Map())).toBe(true);
});
