import {supportedColor} from '../chart/color-validation';

export interface ColorValue {red:number;green:number;blue:number;alpha:number}
const named:Record<string,readonly[number,number,number]>={black:[0,0,0],white:[255,255,255],red:[255,0,0],green:[0,128,0],blue:[0,0,255],yellow:[255,255,0],orange:[255,165,0],gray:[128,128,128],grey:[128,128,128],cyan:[0,255,255],magenta:[255,0,255],purple:[128,0,128],navy:[0,0,128],teal:[0,128,128]};
const value=(red:number,green:number,blue:number,alpha=1):ColorValue=>({red,green,blue,alpha});

/** Convert only the portable saved-color subset, without coercing untrusted input. */
export function parseColorValue(input:unknown):ColorValue|null{
 if(!supportedColor(input))return null;
 const text=input.trim().toLowerCase();
 if(text==='transparent')return value(0,0,0,0);
 if(Object.hasOwn(named,text))return value(...named[text]);
 if(text.startsWith('#')){const raw=text.slice(1),expanded=raw.length<=4?[...raw].map(c=>c+c).join(''):raw;return value(parseInt(expanded.slice(0,2),16),parseInt(expanded.slice(2,4),16),parseInt(expanded.slice(4,6),16),expanded.length===8?parseInt(expanded.slice(6,8),16)/255:1);}
 const match=/^(rgb|rgba|hsl|hsla)\((.*)\)$/.exec(text)!;
 const parts=match[2].includes(',')?match[2].split(',').map(s=>s.trim()):match[2].replace('/',' ').trim().split(/\s+/);
 const scalar=(part:string,max:number)=>part.endsWith('%')?Number(part.slice(0,-1))/100*max:Number(part);
 const alpha=parts.length===4?scalar(parts[3],1):1;
 if(match[1].startsWith('rgb'))return value(scalar(parts[0],255),scalar(parts[1],255),scalar(parts[2],255),alpha);
 const hue=((Number(parts[0])%360)+360)%360,saturation=Number(parts[1].slice(0,-1))/100,lightness=Number(parts[2].slice(0,-1))/100;
 const chroma=(1-Math.abs(2*lightness-1))*saturation,x=chroma*(1-Math.abs((hue/60)%2-1)),m=lightness-chroma/2;
 const channels=hue<60?[chroma,x,0]:hue<120?[x,chroma,0]:hue<180?[0,chroma,x]:hue<240?[0,x,chroma]:hue<300?[x,0,chroma]:[chroma,0,x];
 return value(...channels.map(c=>Math.max(0,Math.min(255,(c+m)*255))) as [number,number,number],alpha);
}

/** Plain decimal retains Number roundtrip precision; portable CSS excludes exponents. */
function decimal(n:number){
 if(!Number.isFinite(n))throw Error('Color component must be finite.');
 if(n===0)return'0';
 const text=String(n);if(!/[eE]/.test(text))return text;
 const [mantissa,exponent]=text.toLowerCase().split('e'),digits=mantissa.replace('.',''),place=(mantissa.indexOf('.')<0?mantissa.length:mantissa.indexOf('.'))+Number(exponent);
 return place<=0?'0.'+'0'.repeat(-place)+digits:place>=digits.length?digits+'0'.repeat(place-digits.length):digits.slice(0,place)+'.'+digits.slice(place);
}
function serialize(color:ColorValue){
 const result=`rgba(${decimal(color.red)},${decimal(color.green)},${decimal(color.blue)},${decimal(color.alpha)})`;
 if(!supportedColor(result))throw Error('This color cannot be represented within the saved color limit.');
 return result;
}
export function colorRGBHex(color:ColorValue){return'#'+[color.red,color.green,color.blue].map(n=>Math.round(n).toString(16).padStart(2,'0')).join('');}
export function colorWithRGB(original:unknown,hex:string,replaceInvalid=false){
 if(typeof hex!=='string'||!/^#[\da-f]{6}$/i.test(hex))throw Error('Choose a six-digit RGB color.');
 const rgb=parseColorValue(hex)!,before=parseColorValue(original);
 if(!before&&!replaceInvalid)throw Error('Enter a valid color before changing its RGB channels.');
 return serialize({...rgb,alpha:before?.alpha??1});
}
export function colorWithOpacity(original:unknown,percent:number){
 const before=parseColorValue(original);
 if(!before)throw Error('Enter a valid color before changing opacity.');
 if(typeof percent!=='number'||!Number.isFinite(percent)||percent<0||percent>100)throw Error('Opacity must be from 0 to 100.');
 const alpha=percent/100;
 if(percent>0&&alpha===0)throw Error('Opacity is too small to represent.');
 return serialize({...before,alpha});
}
