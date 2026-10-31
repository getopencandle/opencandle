export interface ContextFocusTarget{isConnected:boolean;focus:()=>void}
/** Focus restoration belongs to the exact still-current menu, never its later replacement. */
export function createContextMenuFocus(port:{current:()=>boolean;chart:()=>ContextFocusTarget|null;menu:()=>ContextFocusTarget|null;ownsFocus:()=>boolean}){
 return{beforeAction(){if(!port.current())throw Error('Context focus owner retired before action');const chart=port.chart();if(!chart?.isConnected)throw Error('Context chart focus target is unavailable');chart.focus();},failed(){if(!port.current()||!port.ownsFocus())return;const menu=port.menu();if(menu?.isConnected)menu.focus();},dismiss(reason:'escape'|'outside'|'retired'|'accepted'){if(reason!=='escape'||!port.current()||!port.ownsFocus())return;const chart=port.chart();if(chart?.isConnected)chart.focus();}};
}
export function contextMenuKeyAction(key:string,composing:boolean):'ignore'|'dismiss'|'navigate'|'default'{if(composing)return 'ignore';if(key==='Escape')return 'dismiss';if(['ArrowDown','ArrowUp','Home','End'].includes(key))return 'navigate';return 'default';}
