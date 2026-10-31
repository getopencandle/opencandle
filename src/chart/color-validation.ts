/** Portable supported CSS-color subset. The same parser runs in Node and the browser. */
export function supportedColor(value:unknown):value is string{
 if(typeof value!=='string'||!value.trim()||value.length>200)return false;const text=value.trim();
 if(/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(text)||['transparent','black','white','red','green','blue','yellow','orange','gray','grey','cyan','magenta','purple','navy','teal'].includes(text.toLowerCase()))return true;
 const match=/^(rgb|rgba|hsl|hsla)\((.*)\)$/i.exec(text);if(!match)return false;const kind=match[1].toLowerCase(),body=match[2].trim();let parts:string[];
 if(body.includes(',')){if(body.includes('/'))return false;parts=body.split(',').map(part=>part.trim());if(parts.length!==(kind.endsWith('a')?4:3))return false;}
 else{const sections=body.split('/');if(sections.length>2)return false;parts=sections[0].trim().split(/\s+/);if(parts.length!==3)return false;if(sections.length===2)parts.push(sections[1].trim());}
 const number=(part:string)=>/^[+-]?(?:\d+\.?\d*|\.\d+)%?$/.test(part)?Number(part.replace('%','')):NaN;
 if(!parts.every(part=>Number.isFinite(number(part))))return false;
 for(let index=0;index<3;index++){const part=parts[index],value=number(part);if(kind.startsWith('hsl')){if(index===0){if(part.endsWith('%'))return false;}else if(!part.endsWith('%')||value<0||value>100)return false;}else if(value<0||value>(part.endsWith('%')?100:255))return false;}
 if(body.includes(',')&&kind.startsWith('rgb')&&new Set(parts.slice(0,3).map(part=>part.endsWith('%'))).size!==1)return false;
 if(parts.length===4){const alpha=number(parts[3]);if(alpha<0||alpha>(parts[3].endsWith('%')?100:1))return false;}
 return true;
}
