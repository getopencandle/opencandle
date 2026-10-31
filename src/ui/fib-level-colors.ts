import {supportedColor} from '../chart/color-validation';
import {fibTrendLineDraftColor,withFibTrendLineDraftColor,type FibTrendLineState} from '../chart/fib-trend-line-data';

interface LevelEditor {type:string;levels:readonly {color:string}[]|null;fibTrendLine?:FibTrendLineState}

/** Empty means a mixed presentation, never a value to save. */
export function fibLevelColor(editor:LevelEditor,values:Record<string,unknown>):string|undefined{
 if(editor.type!=='fibretracement'||!editor.levels)return undefined;
 const colors=editor.levels.map((level,index)=>Object.hasOwn(values,'levels.'+index+'.color')?values['levels.'+index+'.color']:level.color);
 if(editor.fibTrendLine){const color=fibTrendLineDraftColor(editor.fibTrendLine,values);if(color===undefined)return;colors.push(color);}
 if(!colors.length)return undefined;
 const first=colors[0];return supportedColor(first)&&colors.every(color=>color===first)?first:'';
}

/** One draft update includes every retained level and recognized baseline color. */
export function fibLevelColorValues(editor:LevelEditor,values:Record<string,unknown>,color:string):Record<string,unknown>{
 if(editor.type!=='fibretracement'||!editor.levels||!editor.levels.length&&!editor.fibTrendLine)throw Error('Common color is available only for Fibonacci retracement.');
 if(!supportedColor(color))throw Error('Choose a supported color for all levels.');
 const next={...(editor.fibTrendLine?withFibTrendLineDraftColor(editor.fibTrendLine,values,color):values)};
 for(let index=0;index<editor.levels.length;index++)next['levels.'+index+'.color']=color;
 return next;
}
