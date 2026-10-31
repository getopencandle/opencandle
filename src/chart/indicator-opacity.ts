import {supportedColor} from './color-validation';

/** Original portable CSS subset conversion; canonical saved colors are never rewritten. */
export function indicatorColorOpacity(color:string,opacity=100):string{
 if(!supportedColor(color)||!Number.isFinite(opacity)||opacity<0||opacity>100)throw new Error('Invalid indicator color or opacity.');
 if(opacity===100)return color;
 const names:Record<string,number[]>={transparent:[0,0,0,0],black:[0,0,0],white:[255,255,255],red:[255,0,0],green:[0,128,0],blue:[0,0,255],yellow:[255,255,0],orange:[255,165,0],gray:[128,128,128],grey:[128,128,128],cyan:[0,255,255],magenta:[255,0,255],purple:[128,0,128],navy:[0,0,128],teal:[0,128,128]};
 const text=color.trim().toLowerCase();let rgba:number[];
 if(text.startsWith('#')){let digits=text.slice(1);if(digits.length<=4)digits=[...digits].map(char=>char+char).join('');rgba=[0,2,4].map(index=>parseInt(digits.slice(index,index+2),16));rgba.push(digits.length===8?parseInt(digits.slice(6,8),16)/255:1);}
 else if(Object.hasOwn(names,text))rgba=[...names[text]];
 else{
  const match=/^(rgba?|hsla?)\((.*)\)$/.exec(text)!;
  const parts=match[2].includes(',')?match[2].split(',').map(value=>value.trim()):match[2].replace('/', ' ').trim().split(/\s+/);
  const number=(value:string)=>Number(value.replace('%',''));
  const alpha=parts.length===4?number(parts[3])/(parts[3].endsWith('%')?100:1):1;
  if(match[1].startsWith('rgb'))rgba=[...parts.slice(0,3).map(value=>value.endsWith('%')?number(value)/100*255:number(value)),alpha];
  else{const hue=((number(parts[0])%360)+360)%360/60,s=number(parts[1])/100,l=number(parts[2])/100,c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(hue%2-1)),m=l-c/2;
   const rgb=hue<1?[c,x,0]:hue<2?[x,c,0]:hue<3?[0,c,x]:hue<4?[0,x,c]:hue<5?[x,0,c]:[c,0,x];rgba=[...rgb.map(value=>(value+m)*255),alpha];}
 }
 const originalAlpha=rgba[3]??1,alpha=originalAlpha*opacity/100;
 if(originalAlpha>0&&opacity>0&&alpha===0)throw new Error('Indicator opacity is too small to represent without losing positive alpha.');
 // Same plain-decimal Number-roundtrip policy as ui/color-value.ts. The portable
 // CSS subset excludes exponent notation, and saved colors are never rewritten.
 const scalar=(value:number)=>{if(!Number.isFinite(value))throw new Error('Indicator color component must be finite.');if(value===0)return '0';const text=String(value);if(!/[eE]/.test(text))return text;const [mantissa,exponent]=text.toLowerCase().split('e'),digits=mantissa.replace('.',''),place=(mantissa.indexOf('.')<0?mantissa.length:mantissa.indexOf('.'))+Number(exponent);return place<=0?'0.'+'0'.repeat(-place)+digits:place>=digits.length?digits+'0'.repeat(place-digits.length):digits.slice(0,place)+'.'+digits.slice(place);};
 const result=`rgba(${rgba.slice(0,3).map(value=>scalar(Math.max(0,Math.min(255,value)))).join(',')},${scalar(alpha)})`;
 if(!supportedColor(result))throw new Error('Indicator color cannot be represented within the portable color limit.');
 return result;
}
