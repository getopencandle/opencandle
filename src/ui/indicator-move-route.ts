// R4: the tail of App.applyIndicatorMove after the indicator port's own move.
// The new-pane-above lift (pane-actions finishNewPaneAbove) runs first, then the saved-capture confirmation ALWAYS runs, and only
// then is a failed lift reported. A lift that ran but did not leave the pane on top therefore never skips
// confirmAnalysisCapture: the move itself was accepted, so its saved chart cell must still be confirmed.
export interface IndicatorMoveTail {
 /** True when "New pane above" started from the price pane (studyOnPricePane read before the move). */
 raise:boolean;
 /** The lift after the port move; called only when raise is true. */
 lift:()=>{ok:boolean;message?:string};
 /** Saved-capture confirmation for the accepted move (App: confirmAnalysisCapture). */
 confirm:()=>boolean;
 /** Reports a failed lift without throwing. */
 report:(message:string)=>void;
}
export const INDICATOR_MOVE_UNSAVED='The accepted indicator edit has no saved chart cell. Reopen the chart before editing.';
export const INDICATOR_LIFT_FAILED='The indicator moved to a new pane, but the pane stayed below the price pane.';

export function finishIndicatorMove(tail:IndicatorMoveTail):{lifted:boolean}{
 let lifted:{ok:boolean;message?:string}={ok:true};
 if(tail.raise){try{lifted=tail.lift();}catch(error){lifted={ok:false,message:error instanceof Error?error.message:String(error)};}}
 if(!tail.confirm())throw Error(INDICATOR_MOVE_UNSAVED);
 if(!lifted.ok)tail.report(INDICATOR_LIFT_FAILED+(lifted.message?' '+lifted.message:''));
 return{lifted:tail.raise&&lifted.ok};
}
