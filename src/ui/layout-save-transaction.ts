export interface LayoutSaveLease {isCurrent():boolean;resume():void}
export class SavedLayoutUnavailable extends Error {readonly saved=true;constructor(message:string){super('Saved locally, but the chart workspace needs recovery. '+message);this.name='SavedLayoutUnavailable';}}
/** One disk receipt owns publication. A later renderer failure cannot undo a successful write. */
export async function commitLayoutReceipt<T>(port:{assertCurrent():void;suspend():LayoutSaveLease;write():Promise<T>;acceptReceipt(receipt:T):void;publish():void}):Promise<T>{
 port.assertCurrent();const lease=port.suspend();let accepted=false,receipt:T|undefined,writeError:unknown,hasWriteError=false;
 try{port.assertCurrent();if(!lease.isCurrent())throw new Error('The chart hold changed before saving.');receipt=await port.write();accepted=true;port.acceptReceipt(receipt);}catch(error){writeError=error;hasWriteError=true;}
 const errors:unknown[]=[];try{lease.resume();}catch(error){errors.push(error);}
 if(accepted){try{port.publish();}catch(error){errors.push(error);}if(hasWriteError)errors.unshift(writeError);if(errors.length)throw new SavedLayoutUnavailable(errors.map(String).join(' '));return receipt!;}
 if(errors.length)throw new AggregateError([...(hasWriteError?[writeError]:[]),...errors],'Local save failed and the previous chart could not fully resume.');
 if(hasWriteError)throw writeError;throw new Error('No local save receipt was accepted.');
}
