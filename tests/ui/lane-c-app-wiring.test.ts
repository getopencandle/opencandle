import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
// applied to App.tsx (root-owned wiring). Source pins over the App text: the drawing
// components themselves are covered by tests/ui/lane-c-drawings.test.ts. Not executable UI evidence.
const app=readFileSync('src/ui/App.tsx','utf8');

describe('LANE-C App diff',()=>{
 it('the floating edit bar keeps Text color (no textColor filter)',()=>{
  expect(app).not.toContain("filter(button=>button.id!=='textColor')");
  expect(app).toMatch(/bulkPropertyBar\(\[row,row\] as never\)\.buttons;/);
 });
 it('Add alert from a drawing: one entry used by the menu, the edit bar and Alt+A',()=>{
  expect(app).toMatch(/function openDrawingAlert\(id:string\)\{const creation=replayAlertCreation\(replaySessionRef\.current,'ordinary'\);if\(!creation\.allowed\)\{setMessage\(creation\.reason\);return;\}setAlertCreateRequest\(\{sourceId:'drawing:'\+id\}\);setDialog\('alerts'\);\}/);
  expect(app).toMatch(/'drawing-alert':\(snapshot:ChartMenuSnapshot\)=>/);
  expect(app).toContain('onAlert={()=>openDrawingAlert(selectedDrawing)}');
  // Alt+A with one drawing selected goes to the drawing, stopped before the price scale port's own Alt+A.
  expect(app).toMatch(/key==='a'&&loaded\)\{e\.preventDefault\(\);if\(keyboardCommands\.current\.drawingAlert\(\)\)\{e\.stopPropagation\(\);return;\}openAlertCreate\(\);\}/);
  expect(app).toMatch(/const drawingAlert=\(\)=>\{if\(!selectedDrawing\|\|selectedDrawingIds\.length>=2\)return false;openDrawingAlert\(selectedDrawing\);return true;\}/);
 });
 it('visual order: Bring forward and Send backward are wired',()=>{
  expect(app).toContain("'drawing-forward':drawingContextRun((controller,ids)=>{controller.drawingManager.order(ids,'forward');})");
  expect(app).toContain("'drawing-backward':drawingContextRun((controller,ids)=>{controller.drawingManager.order(ids,'backward');})");
 });
 it('Copy row: copies into the LV drawing clipboard, Ctrl+V pastes',()=>{
  expect(app).toMatch(/'drawing-copy':drawingContextRun\(\(controller,ids\)=>\{controller\.copyDrawings\(ids\);setMessage\(/);
  // Ctrl+C / Ctrl+V outside the chart canvas still route to the same clipboard (the canvas router owns them inside).
  // retarget: Ctrl+X (cut) sits between the copy and paste branches; copy and paste are unchanged.
  expect(app).toContain("if(key==='c')chart.drawingUtility.copySelection();else if(key==='x'){");
  expect(app).toContain("else chart.drawingUtility.paste();captureDrawings();");
 });
 it('drawing dialog shows coordinates in the chart time zone',()=>{
  expect(app).toMatch(/<DrawingDialog [^\n]*?timeZone=\{workspace\.chartOptions\.timezone\}/);
 });
});
