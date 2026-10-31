export interface DrawingCaptureConfirmationHost {
 assertCurrent():void;
 readSaved():unknown;
 readNative():unknown;
 refresh():void;
}
/** Confirms synchronous grid publication; a list refresh alone is not persistence. */
export function confirmDrawingPublication(host:DrawingCaptureConfirmationHost):boolean{
 host.assertCurrent();const saved=JSON.stringify(host.readSaved());host.assertCurrent();
 const native=JSON.stringify(host.readNative());host.assertCurrent();
 if(saved===undefined||saved!==native)return false;
 const finalSaved=JSON.stringify(host.readSaved());host.assertCurrent();
 if(finalSaved!==saved)return false;
 host.refresh();host.assertCurrent();return true;
}
