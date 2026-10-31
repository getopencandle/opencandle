// Price scale plus button: model only. Hovering the main price scale shows "+" at the pointer
// price, just inside the plot against the scale edge; its menu adds an alert, opens a paper limit or stop order at that price, or draws a horizontal line there.
// The order side follows the reference rule: above the last price a limit sells and a stop buys; at or below it a limit
// buys and a stop sells. Wording is OpenCandle's own. Paper trading uses virtual money only.

export type PricePlusAction='alert'|'buy-limit'|'sell-limit'|'buy-stop'|'sell-stop'|'hline';
export interface PricePlusItem{id:PricePlusAction;label:string;disabled?:string}
/** What a host receives for an action that leaves the chart (alert, paper order). */
export interface PricePlusRequest{action:'alert'|'order';side?:'buy'|'sell';orderType?:'limit'|'stop';price:number;client:{x:number;y:number};paneId:string}
/** Button width and height in px. Small, inside the plot against the scale edge, so it never covers a scale label. */
export const PLUS_BUTTON_PX=14;

export const PLUS_UNBOUND='This chart is not connected to alerts and paper trading.';
export const PLUS_NO_LINE='This chart cannot draw a horizontal line here.';

/** Menu rows in display order. `last` null (no bars): the order rows assume the price is above the market. */
/** `paperRefusal` (a derived symbol) disables the two paper order rows with that reason; alerts and lines stay. */
export function pricePlusMenu(input:{price:number;text:string;last:number|null;symbol:string|null;host:boolean;line:boolean;paperRefusal?:string|null}):PricePlusItem[]{
 const above=input.last===null||input.price>input.last,on=input.symbol?' '+input.symbol:'';
 const away=input.host?{}:{disabled:PLUS_UNBOUND};
 const limit:PricePlusAction=above?'sell-limit':'buy-limit',stop:PricePlusAction=above?'buy-stop':'sell-stop';
 const trade=input.host&&input.paperRefusal?{disabled:input.paperRefusal}:away;
 const word=(action:PricePlusAction)=>action.startsWith('buy')?'buy':'sell';
 return[
  {id:'alert',label:`Add alert${on} at ${input.text}`,...away},
  {id:limit,label:`Paper ${word(limit)} limit${on} at ${input.text}`,...trade},
  {id:stop,label:`Paper ${word(stop)} stop${on} at ${input.text}`,...trade},
  {id:'hline',label:`Draw horizontal line at ${input.text}`,...input.line?{}:{disabled:PLUS_NO_LINE}},
 ];
}
/** The host request for a menu row (null for the horizontal line, which the chart draws itself). */
export function pricePlusRequest(action:PricePlusAction,price:number,client:{x:number;y:number},paneId:string):PricePlusRequest|null{
 if(action==='hline')return null;
 if(action==='alert')return{action:'alert',price,client:{...client},paneId};
 const [side,orderType]=action.split('-') as ['buy'|'sell','limit'|'stop'];
 return{action:'order',side,orderType,price,client:{...client},paneId};
}

/** What the view shows; the port owns this state. */
export interface PricePlusViewProps{
 /** Button position inside the chart host (px). */
 left:number;top:number;
 /** Side of the main price scale the button sits on; the menu opens toward the plot. */
 side?:'left'|'right';
 /** The axis price text beside the button's tooltip. */
 text:string;
 /** Open menu rows, or null while closed. */
 items:readonly PricePlusItem[]|null;
 status:string;
 onOpen():void;
 onActivate(action:PricePlusAction):void;
}
export interface PricePlusMount{render(props:PricePlusViewProps|null):void;contains(target:EventTarget|null):boolean;dispose():void}
