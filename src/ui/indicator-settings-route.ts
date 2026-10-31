// One route to one indicator's settings: the legend title, its Settings button, More > Settings and the object tree row all
// open the compact window (live preview, Ok and Cancel) on that instance. Add indicator and the toolbar button open the full dialog.
export interface IndicatorSettingsFocus {authority:object;id:string;tab?:string;compact:true}
export function indicatorSettingsFocus(authority:object,id:string,tab?:string):IndicatorSettingsFocus{
 return{authority,id,...(tab?{tab}:{}),compact:true};
}
