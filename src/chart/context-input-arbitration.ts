export type ContextGestureDisposition='begin'|'flush'|'ignore';
export function contextGestureDisposition(kind:'pointer'|'wheel'|'key',menuOrigin:boolean,button=0,key='',shift=false):ContextGestureDisposition{
 if(menuOrigin)return 'ignore';
 if(kind==='pointer')return button===0?'begin':'flush';
 if(kind==='wheel')return 'begin';
 if(key==='ContextMenu'||key==='F10'&&shift)return 'flush';
 return ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown','+','-'].includes(key)?'begin':'ignore';
}
