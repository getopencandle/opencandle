// Each layout tab keeps its own chart Undo for the session.
import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {switchLayoutHistory,forgetLayoutHistory,forgetLayoutHistories,keptLayoutHistories,KEPT_LAYOUT_HISTORIES} from '../../src/ui/layout-history-stash';
import {createWorkspaceHistory} from '../../src/ui/workspace-history';

const make=()=>createWorkspaceHistory<Record<string,unknown>>();
it('switching tabs keeps the left layout history and returns the opened layout its own',()=>{
 const ref={current:make()};ref.current.record({grid:{layout:{id:'A'}},n:1},null);const a=ref.current;
 switchLayoutHistory(ref,'A','B',make);expect(ref.current).not.toBe(a);expect(ref.current.status().undo).toBe(0);
 ref.current.record({grid:{layout:{id:'B'}},n:2},null);const b=ref.current;
 switchLayoutHistory(ref,'B','A',make);expect(ref.current).toBe(a);expect(ref.current.status().undo).toBe(1);expect(keptLayoutHistories(ref)).toEqual(['B']);
 switchLayoutHistory(ref,'A','B',make);expect(ref.current).toBe(b);
 // Reopening the open layout starts over, as before.
 switchLayoutHistory(ref,'B','B',make);expect(ref.current).toBe(b);expect(b.status().undo).toBe(0);
 forgetLayoutHistory(ref,'A');expect(keptLayoutHistories(ref)).toEqual([]);
 for(let n=0;n<KEPT_LAYOUT_HISTORIES+3;n++)switchLayoutHistory(ref,'L'+n,'L'+(n+1),make);expect(keptLayoutHistories(ref)).toHaveLength(KEPT_LAYOUT_HISTORIES);
 forgetLayoutHistories(ref);expect(keptLayoutHistories(ref)).toEqual([]);
});
it('App opens a layout through the per-layout history and says Undo was cleared only when the same layout is reopened',()=>{
 const app=readFileSync('src/ui/App.tsx','utf8');
 expect(app).toContain('switchLayoutHistory(history,leavingLayout,id,()=>createWorkspaceHistory<Workspace>());');
 expect(app).toContain("(leavingLayout===id?(replayRan?'. Chart Undo was cleared and replay ended.':'. Chart Undo was cleared.'):(replayRan?'. Replay ended.':'.'))");
 expect(app).toContain('forgetLayoutHistory(history,action.id);');expect(app).toContain('forgetLayoutHistories(history);');
});
