import {expect,it,vi} from 'vitest';
import {alertDrawingNotesForOwner} from '../../src/ui/alert-drawing-note-cache';
import type {LocalAlert} from '../../src/domain/alerts';
const alert=()=>({definition:{id:'synthetic-alert',instrumentId:'SYNTHETIC:GME',condition:{kind:'position',position:{drawingId:'synthetic-line'}}}} as unknown as LocalAlert);
it('retains equal note identity while rereading current rows on every call',()=>{
 const owner={},alerts=[alert()],read=vi.fn(()=>[]),first=alertDrawingNotesForOwner(owner,alerts,read);expect(first.get('synthetic-alert')).toContain('Drawing deleted');expect(alertDrawingNotesForOwner(owner,alerts,read)).toBe(first);expect(read).toHaveBeenCalledTimes(2);expect(alertDrawingNotesForOwner({},alerts,read)).not.toBe(first);
});
it('tracks in-place Undo, Redo and restored-layout rows without relying on source identities',()=>{
 const owner={},alerts=[alert()],rows:{id:string}[]=[],read=()=>rows,removed=alertDrawingNotesForOwner(owner,alerts,read);rows.push({id:'synthetic-line'});const undone=alertDrawingNotesForOwner(owner,alerts,read);expect(undone.size).toBe(0);expect(undone).not.toBe(removed);rows.length=0;const redone=alertDrawingNotesForOwner(owner,alerts,read);expect(redone.has('synthetic-alert')).toBe(true);rows.push({id:'synthetic-line'});expect(alertDrawingNotesForOwner(owner,alerts,read).size).toBe(0);
});
it('changed or deleted conditions and unavailable readers refresh the result',()=>{
 const owner={},row=alert(),rows=[{id:'synthetic-line'}],read=()=>rows;expect(alertDrawingNotesForOwner(owner,[row],read).size).toBe(0);(row.definition.condition as any).position.drawingId='synthetic-other';expect(alertDrawingNotesForOwner(owner,[row],read).has('synthetic-alert')).toBe(true);expect(alertDrawingNotesForOwner(owner,[row],()=>null).size).toBe(0);expect(alertDrawingNotesForOwner(owner,[],read).size).toBe(0);(row.definition.condition as any)={kind:'greater',value:1};expect(alertDrawingNotesForOwner(owner,[row],read).size).toBe(0);
});
