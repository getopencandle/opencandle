import {expect,it} from 'vitest';
import {createDrawing,deserializeDrawing,type Drawing} from '@luxalgo/vela';
import '../../src/chart/fib-level-format-native';

type Fib=Drawing&{levels:{ratio:number;color:string;enabled:boolean;label?:string}[]};
function fib(label?:string,enabled=true):Fib{
 return createDrawing('fibretracement',{id:'SYNTHETIC native label',paneId:'price',createdAt:1,anchors:[{time:1000,price:100},{time:2000,price:200}],props:{levels:[{ratio:0,color:'#123456',enabled,...label===undefined?{}:{label}},{ratio:1,color:'#abcdef',enabled:true,label:'SYNTHETIC unchanged'}]}})! as Fib;
}
function unchangedAfterRefusal(model:Fib,patch:Record<string,unknown>){const before=model.serialize();expect(()=>model.applySettings(patch)).toThrow();expect(model.serialize()).toStrictEqual(before);}

it.each(['','A'.repeat(50),' '.repeat(50),'A'.repeat(49)+' ','\tSYNTHETIC','😀'.repeat(25)])('accepts a literal new label without normalization: %j',label=>{
 const model=fib('old');model.applySettings({'levels.0.label':label});expect(model.levels[0].label).toBe(label);expect(model.levels[1].label).toBe('SYNTHETIC unchanged');
});

it.each([undefined,null,1,false,{},'A'.repeat(51),'😀'.repeat(26),...['\r','\n','\u000b','\u000c','\u0085','\u2028','\u2029'].map(separator=>'a'+separator+'b')])('refuses invalid raw label %j before any earlier style mutation',value=>{
 const model=fib('old');unchangedAfterRefusal(model,{'style.lineColor':'#fedcba','levels.0.label':value});
});

it('validates the complete patch before a valid first label can change',()=>{
 const model=fib('old');unchangedAfterRefusal(model,{'levels.0.label':'valid first','levels.1.label':'B'.repeat(51),'levels.0.color':'#fedcba'});
});

it.each(['X'.repeat(51),'Y'.repeat(20000),'SYNTHETIC retained\nmultiline'])('retains an admitted old label on exact no-op and unrelated native settings',label=>{
 const model=fib(label),levels=model.levels,first=levels[0];
 model.applySettings({'levels.0.label':label});expect(model.levels).toBe(levels);expect(model.levels[0]).toBe(first);expect(model.levels[0].label).toBe(label);
 model.applySettings({'style.lineColor':'#fedcba','levels.0.color':'#654321','levels.0.enabled':false});expect(model.levels[0].label).toBe(label);expect(model.style.lineColor).toBe('#fedcba');expect(model.levels[0].color).toBe('#654321');expect(model.levels[0].enabled).toBe(false);
 const restored=deserializeDrawing(model.serialize()) as Fib;expect(restored.levels[0].label).toBe(label);model.applyProps({levels:[{ratio:0,color:'#123456',enabled:true,label}]});expect(model.levels[0].label).toBe(label);
});

it('allows repair and explicit clearing of old text but rejects a different invalid replacement',()=>{
 const model=fib('X'.repeat(51));model.applySettings({'levels.0.label':'short repair'});expect(model.levels[0].label).toBe('short repair');model.applySettings({'levels.0.label':''});expect(model.levels[0].label).toBe('');unchangedAfterRefusal(model,{'levels.0.label':'Z'.repeat(51)});
});

it('preserves absent label on the accepted undefined-prior to empty-string no-op',()=>{
 const model=fib();expect(Object.hasOwn(model.levels[0],'label')).toBe(false);model.applySettings({'levels.0.label':''});expect(Object.hasOwn(model.levels[0],'label')).toBe(false);
});

it('rejects label accessors and own undefined without evaluating a getter',()=>{
 const model=fib('old');let reads=0;const patch=Object.defineProperty({'style.lineColor':'#fedcba'},'levels.0.label',{enumerable:true,get(){reads++;return 'valid';}});
 unchangedAfterRefusal(model,patch);expect(reads).toBe(0);
 const raw={'levels.0.label':undefined};expect(Object.hasOwn(raw,'levels.0.label')).toBe(true);unchangedAfterRefusal(model,raw);
});

it('rejects a getter-bearing prior label without invoking it or changing other fields',()=>{
 const model=fib('old');let reads=0;Object.defineProperty(model.levels[0],'label',{configurable:true,enumerable:true,get(){reads++;return 'old';}});const color=model.style.lineColor;
 expect(()=>model.applySettings({'style.lineColor':'#fedcba','levels.0.label':'new'})).toThrow();expect(reads).toBe(0);expect(model.style.lineColor).toBe(color);
});

it.each(['levels','levels.0','levels.0.future','levels.0.label.extra','levels.length','levels.01.label','levels.-1.label','levels.200.label'])('refuses unsupported or bulk level path %s before changing the model',key=>{
 const model=fib('old');unchangedAfterRefusal(model,{'style.lineColor':'#fedcba',[key]:key==='levels'?[]:{label:'valid'}});
});

it('does not allow hidden levels or disabled custom-label display to bypass validation',()=>{
 const model=fib('old',false);model.applySettings({'lvFibText.enabled':false});unchangedAfterRefusal(model,{'levels.0.label':'hidden\ninvalid'});expect(model.levels[0].enabled).toBe(false);
});

it('requires the genuine registered model when acquiring a prior label',()=>{
 const model=fib('old'),borrowed=Object.create(Object.getPrototypeOf(model));Object.assign(borrowed,model,{levels:[{ratio:0,color:'#123456',enabled:true,label:'old'}]});expect(()=>model.applySettings.call(borrowed,{'levels.0.label':'new'})).toThrow();expect(borrowed.levels[0].label).toBe('old');
});
