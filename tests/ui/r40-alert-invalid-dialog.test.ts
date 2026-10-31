import {expect,it} from 'vitest';
import {all,saved,setup,text,mountControlledComponent} from '../helpers/alert-dialog-harness';
import {AlertsDock,type AlertsDockProps} from '../../src/ui/AlertsDock';
import {DELETED_ALERT_DRAWING_NOTE} from '../../src/domain/alert-drawing-status';

// SYNTHETIC controlled component checks. Browser focus, renderer and packaged GUI evidence remain separate.
it('the manager announces a deleted drawing as Invalid and Undo restores its saved row status',()=>{
 const alert=saved('SYNTHETIC-missing-drawing'),ui=setup([alert]);
 ui.props.invalidDrawings=new Map([[alert.definition.id,DELETED_ALERT_DRAWING_NOTE]]);ui.settle();
 expect(text(ui.row(alert.definition.id))).toContain('Invalid');
 expect(text(ui.row(alert.definition.id))).toContain(DELETED_ALERT_DRAWING_NOTE);
 expect(ui.row(alert.definition.id).props['aria-label']).toContain('Invalid');
 ui.props.invalidDrawings=new Map();ui.settle();
 expect(text(ui.row(alert.definition.id))).toContain('Active');expect(text(ui.row(alert.definition.id))).not.toContain(DELETED_ALERT_DRAWING_NOTE);
 expect(alert.status).toBe('active');expect(ui.publish).not.toHaveBeenCalled();
});

it('the dock shows the same invalid marker and returns to the saved status after a document is restored',()=>{
 const alert=saved('SYNTHETIC-dock-drawing');
 const props:AlertsDockProps={alerts:[alert],activeInstrumentId:alert.definition.instrumentId,unwatched:new Map(),invalidDrawings:new Map([[alert.definition.id,DELETED_ALERT_DRAWING_NOTE]]),formatTime:String,now:()=>100,onAlertsChange:()=>true,onCreate:()=>{},onEdit:()=>{}};
 const ui=mountControlledComponent(()=>AlertsDock(props));ui.settle();
 expect(text(ui.render())).toContain('Invalid');expect(text(ui.render())).toContain(DELETED_ALERT_DRAWING_NOTE);
 props.invalidDrawings=new Map();ui.settle();
 expect(text(ui.render())).toContain('Active');expect(text(ui.render())).not.toContain(DELETED_ALERT_DRAWING_NOTE);
 expect(all(ui.render(),node=>node.props['data-alert-id']===alert.definition.id).length).toBeLessThanOrEqual(1);
});
