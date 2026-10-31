import type {ChartSettingsDocument} from '../chart/chart-settings-document';

// Chart settings > Trading > One-click trading and the paper account's One-click
// setting are one switch. The account's value is the switch (it is what the chart buttons, the position and order
// lines, Shift+B/S and the price scale + row read). The chart settings row shows it, and an Ok that changes the row sets the
// account. The document copy (trading.oneClick) follows, so a saved chart settings template still records the choice.

/** The document as the Chart settings dialog shows it: its One-click row reads the account's setting. No account (a layout
 * window, which has no paper account): the document as saved. */
export function documentWithAccountOneClick(document:ChartSettingsDocument,accountOneClick:boolean|null|undefined):ChartSettingsDocument{
 if(typeof accountOneClick!=='boolean'||document.trading.oneClick===accountOneClick)return document;
 return{...document,trading:{...document.trading,oneClick:accountOneClick}};
}
/** The account One-click value an Ok asks for, or null when it leaves the switch as it is (no document in the change, no
 * account, or the same value). */
export function oneClickChangeOf(document:ChartSettingsDocument|null|undefined,accountOneClick:boolean|null|undefined):boolean|null{
 if(!document||typeof accountOneClick!=='boolean')return null;
 const next=document.trading?.oneClick;
 return typeof next==='boolean'&&next!==accountOneClick?next:null;
}
/** The status line after the switch changes (the Paper panel's wording). */
export function oneClickStatus(on:boolean):string{return on?'Virtual actions now skip confirmation.':'Virtual action confirmations enabled.';}
