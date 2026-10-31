'use strict';
// Guest-side source for LVScript bar history (ctx.history, ctx.series), the ctx.ta library and the
// visual outputs (ctx.hline, ctx.fill, ctx.bgcolor, ctx.plotshape, ctx.plotchar). script-runtime.cjs splices PRELUDE
// into the bootstrap before any guest code is compiled and RUNNER into the per-run closure.
//
// Rules this code keeps (the sandbox rules):
// - It runs inside the same restricted QuickJS context as the script and only uses primitives captured before
//   guest code runs (PRELUDE plus the bootstrap captures). Math, String and iterator prototypes can be replaced
//   by guest code, so nothing here calls them at run time; loops are index loops; options are read through own
//   data descriptors (no getters run).
// - No lookahead: a value is only ever read from the current supplied bar or earlier ones. Future bars in the
//   engine input are never indexed.
// - Every kept state is a {length, values, sum} accumulator inside snapshot.ta, the exact shape the host already
//   validates (length 1..5000, finite values). No snapshot field, limit or host check changes.
// - Semantics are unless a comment names the LV built-in indicator a function is oracle-tested against.
const HISTORY_DEPTH = 500;
// PlotPalette is the distinct colours one plot or fill may use per run; fillColors bounds the per-bar fill
// colour rows of a run. plotOffset bounds a plot's bar offset.
const VISUAL_LIMITS = Object.freeze({ hlines: 16, fills: 16, shapeTitles: 32, shapes: 5000, backgrounds: 5000, plotPalette: 64, fillColors: 20000, plotOffset: 500 });
const PLOT_STYLES = Object.freeze(['line','stepline','histogram','columns','circles','cross','area','areabr','linebr']);
const PLOT_DISPLAYS = Object.freeze(['all','none','pane','data_window','status_line','price_scale']);
const PRELUDE = `const mathExp=Math.exp,mathCeil=Math.ceil,mathAbs=Math.abs,mathSqrt=Math.sqrt,mathFloor=Math.floor,mathMax=Math.max,mathMin=Math.min,createObject=Object.create,stringSlice=String.prototype.slice,SEP=String.fromCharCode(0),PRICE_SOURCES=['open','high','low','close','hl2','hlc3','ohlc4','hlcc4'];`;
const RUNNER = `
    const TA=snapshot.ta,HDEPTH=${HISTORY_DEPTH};
    const fail=message=>{throw Failure(message);};
    // ---- storage: every kept state is a host-shaped accumulator {length, values, sum} ----
    const slotOf=(name,length)=>{
      const descriptor=getDescriptor(TA,name);
      if(descriptor){
        if(!('value' in descriptor))fail('Invalid TA accumulator.');
        const slot=descriptor.value;
        if(slot===null||typeof slot!=='object'||!isArray(slot.values)||slot.values.length!==slot.length)fail('Invalid TA accumulator in the snapshot.');
        if(slot.length!==length)fail('A ctx.ta series changed its length. Use a new key for a different length.');
        return slot;
      }
      const values=[];for(let i=0;i<length;i++)append(values,0);
      const slot={length,values,sum:0};defineProperty(TA,name,{value:slot,enumerable:true,writable:true,configurable:true});return slot;
    };
    // A node names one slot. Nodes are engine-private, cached per run, and resolve their slot and
    // their child names once, so a call no longer rebuilds key strings or re-reads descriptors on every bar.
    // Slot names, slot contents and every arithmetic step are unchanged.
    const slotNodes=createObject(null);
    const nodeOf=name=>{const known=slotNodes[name];if(known!==undefined)return known;const node={name,kids:createObject(null),slot:null,ring:null,params:null,callBar:-1,callInputs:null,callOut:null};defineProperty(slotNodes,name,{value:node,writable:false,configurable:false});return node;};
    const kid=(node,suffix)=>{const known=node.kids[suffix];if(known!==undefined)return known;const child=nodeOf(node.name+SEP+suffix);defineProperty(node.kids,suffix,{value:child,writable:false,configurable:false});return child;};
    const slotIn=(node,length)=>{const slot=node.slot;if(slot!==null){if(slot.length!==length)fail('A ctx.ta series changed its length. Use a new key for a different length.');return slot;}const resolved=slotOf(node.name,length);node.slot=resolved;return resolved;};
    const regs=(node,count)=>{const slot=node.slot;return slot!==null&&slot.length===count?slot.values:slotIn(node,count).values;};
    // A ring of the last L observations of one keyed input. null stays a gap (mask 0); sum counts observations.
    // The ring record also counts its gaps, so a window check is one comparison instead of a scan.
    // The count is only trusted ("fast") when the kept ring is well formed: an integer count and 0/1 masks. A
    // snapshot ring that is not takes the original per-slot path, with the original result.
    const ringOf=(node,L)=>{
      const known=node.ring;if(known!==null){if(known.L!==L)fail('A ctx.ta series changed its length. Use a new key for a different length.');return known;}
      const v=slotIn(kid(node,'v'),L),m=slotIn(kid(node,'m'),L);let gaps=0,fast=isInteger(v.sum)&&v.sum>=0;
      for(let i=0;i<L;i++){const mask=m.values[i];if(mask!==1){gaps++;if(mask!==0)fast=false;}}
      const r={v,m,L,gaps,fast};node.ring=r;return r;
    };
    const ringPush=(r,value)=>{const v=r.v,m=r.m,L=r.L,at=v.sum%L;if(r.fast){if(m.values[at]!==1)r.gaps--;if(value===null)r.gaps++;}v.values[at]=value===null?0:value;m.values[at]=value===null?0:1;v.sum++;m.sum=v.sum;};
    // k observations back, 0 = latest: a number, null (a gap) or undefined (not observed yet or beyond L)
    const ringAt=(r,k)=>{const v=r.v,L=r.L;if(k<0||k>=L||k>=v.sum)return undefined;const at=(v.sum-1-k)%L;return r.m.values[at]===1?v.values[at]:null;};
    const ring=(node,L)=>{const r=ringOf(node,L);return{push(value){ringPush(r,value);},at(k){return ringAt(r,k);}};};
    // The full window oldest to newest, or null while it is short or holds a gap (the LV built-in window rule).
    // Index k back is slot (sum-1-k)%L, so oldest to newest is the slots from sum%L to the end, then from 0.
    const windowOf=r=>{
      const v=r.v,L=r.L;if(v.sum<L)return null;const out=[],values=v.values;
      if(r.fast){if(r.gaps!==0)return null;const start=v.sum%L;let j=0;for(let i=start;i<L;i++)out[j++]=values[i];for(let i=0;i<start;i++)out[j++]=values[i];return out;}
      for(let k=L-1;k>=0;k--){const value=ringAt(r,k);if(value===null||value===undefined)return null;append(out,value);}return out;
    };
    const pushWindow=(node,L,value)=>{const r=ringOf(node,L);ringPush(r,value);return windowOf(r);};
    // The mean, weighted mean and variance kernels read a well-formed full ring in place instead of a
    // copied window: the same values in the same oldest-to-newest order through the same operations. A kept ring
    // that is not well formed still goes through windowOf and the array kernels.
    const pushView=(node,L,value)=>{const r=ringOf(node,L);ringPush(r,value);if(!r.fast)return windowOf(r);return r.v.sum<L||r.gaps!==0?null:r;};
    // ---- argument checks ----
    const taName=fn=>'ctx.ta.'+fn;
    // A key is checked in full the first time it is used with a function; later calls find its
    // node in a private per-function table (only keys that passed every check are ever entered).
    const keyNodes=createObject(null);
    const keyOf=(fn,key)=>{if(typeof key!=='string'||key.length<1||key.length>128)fail(taName(fn)+' needs a key first: a string of 1 to 128 characters that names this series.');
      let table=keyNodes[fn];if(table===undefined){table=createObject(null);defineProperty(keyNodes,fn,{value:table,writable:false,configurable:false});}
      const known=table[key];if(known!==undefined)return known;
      for(let i=0;i<key.length;i++)if(apply(charCodeAt,key,[i])===0)fail(taName(fn)+' keys cannot contain a NUL character.');
      const node=nodeOf(SEP+fn+SEP+key);defineProperty(table,key,{value:node,writable:false,configurable:false});return node;};
    // For a number, value-value===0 is exactly Number.isFinite (NaN and +-Infinity give NaN).
    const source=(fn,value,label)=>{if(value===null)return null;if(typeof value!=='number'||value-value!==0)fail(taName(fn)+': '+(label||'source')+' must be a finite number or null.');return value;};
    const count=(fn,value,label,min,max)=>{if(!isInteger(value)||value<min||value>max)fail(taName(fn)+': '+label+' must be an integer from '+min+' to '+max+'.');return value;};
    const length=(fn,value,label='length',max=5000)=>isInteger(value)&&value>=1&&value<=max?value:count(fn,value,label,1,max);
    const real=(fn,value,label)=>{if(typeof value!=='number'||!isFinite(value))fail(taName(fn)+': '+label+' must be a finite number.');return value;};
    const flag=(fn,value,label)=>{if(typeof value!=='boolean')fail(taName(fn)+': '+label+' must be true or false.');return value;};
    const result=(fn,value)=>{if(value===null)return null;if(typeof value!=='number'||value-value!==0)fail(taName(fn)+' arithmetic overflowed; the value is unavailable.');return value===0?0:value;};
    // ---- one update per key per bar ----
    // A key advances at most once per bar. Calling it again on the same bar with the same values returns the same
    // result; other values on the same bar are refused instead of silently advancing the series twice.
    // The last update of each key (bar, inputs, result) lives on its private node.
    const same=(a,b)=>{if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;};
    const keyed=(fn,key,params,inputs,compute)=>{
      if(!snapshot.processedEvent||fillOrdinal!==null)requireEvent();
      // A key already entered for this function passed every keyOf check; any other key takes the full path.
      const table=typeof key==='string'?keyNodes[fn]:undefined,known=table!==undefined?table[key]:undefined,base=known!==undefined?known:keyOf(fn,key);
      let p=base.params;if(p===null||p.length!==params.length+1){p=slotIn(kid(base,'params'),params.length+1);base.params=p;}
      if(p.sum===0){for(let i=0;i<params.length;i++)p.values[i]=params[i];p.sum=1;}
      else for(let i=0;i<params.length;i++)if(p.values[i]!==params[i])fail(taName(fn)+' key "'+key+'" changed its parameters. Use a new key for different parameters.');
      const now=snapshot.processedCount;
      if(base.callBar===now){if(!same(base.callInputs,inputs))fail(taName(fn)+' key "'+key+'" was already updated on this bar with other values. Use one key per series.');return base.callOut;}
      const out=compute(base);
      base.callBar=now;base.callInputs=inputs;base.callOut=out;
      return out;
    };
    // ---- bar history (no lookahead: only the current supplied bar and earlier ones) ----
    const BAR_FIELDS=['time','open','high','low','close','volume'];
    const stored=[];let storedLength=0,historyDepth=0;
    {
      let present=0;
      for(let i=0;i<BAR_FIELDS.length;i++){const descriptor=getDescriptor(TA,SEP+'bars'+SEP+BAR_FIELDS[i]);if(descriptor){present++;if(!('value' in descriptor))fail('Invalid bar history in the snapshot.');append(stored,descriptor.value);}}
      if(present){
        if(present!==BAR_FIELDS.length)fail('Invalid bar history in the snapshot.');
        storedLength=stored[0].values.length;
        for(let i=0;i<stored.length;i++){const slot=stored[i];if(!isArray(slot.values)||slot.values.length!==storedLength||slot.length!==storedLength||slot.sum!==snapshot.processedCount||storedLength>HDEPTH)fail('Invalid bar history in the snapshot.');}
      }
    }
    const barAgo=k=>{
      if(k>historyDepth)historyDepth=k;
      const now=snapshot.processedCount;if(k>now)return null;
      if(k<=position){const bar=input.bars[position-k];return{time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume};}
      const back=k-position-1;
      if(back<storedLength){const at=storedLength-1-back;return{time:stored[0].values[at],open:stored[1].values[at],high:stored[2].values[at],low:stored[3].values[at],close:stored[4].values[at],volume:stored[5].values[at]};}
      fail('That bar is before the bars this run received, and the snapshot keeps only the last '+storedLength+'. Recalculate from the first bar.');
    };
    const currentBar=()=>input.bars[position];
    const finishHistory=()=>{
      // logical-v1 is a fresh full chart run; current history stays genuine, but unavailable volume is never fabricated for continuation.
      if(logicalPositions)return;
      if(!input.bars.length||(!storedLength&&!historyDepth))return;
      const depth=mathMin(HDEPTH,mathMax(storedLength,historyDepth,1)),total=storedLength+input.bars.length,take=mathMin(depth,total);
      for(let f=0;f<BAR_FIELDS.length;f++){
        const values=[];
        for(let i=total-take;i<total;i++)append(values,i<storedLength?stored[f].values[i]:input.bars[i-storedLength][BAR_FIELDS[f]]);
        defineProperty(TA,SEP+'bars'+SEP+BAR_FIELDS[f],{value:{length:take,values,sum:snapshot.processedCount},enumerable:true,writable:true,configurable:true});
      }
    };
    // SCRIPT-RT (SCRIPT.RUNTIME.HISTORY): ctx.history(n, source) reads one price source of that preceding bar
    // (null when the bar is unavailable), so close one bar back is ctx.history(1, 'close').
    const historyPrice=(b,name)=>{if(name==='hl2'){const sum=b.high+b.low;return isFinite(sum)?sum/2:b.high/2+b.low/2;}if(name==='hlc3'){const sum=b.high+b.low+b.close;return isFinite(sum)?sum/3:b.high/3+b.low/3+b.close/3;}if(name==='ohlc4'){const sum=b.open+b.high+b.low+b.close;return isFinite(sum)?sum/4:b.open/4+b.high/4+b.low/4+b.close/4;}if(name==='hlcc4'){const sum=b.high+b.low+2*b.close;return isFinite(sum)?sum/4:b.high/4+b.low/4+b.close/2;}return b[name];};
    const history=(n,source)=>{
      if(!isInteger(n)||n<0||n>HDEPTH)fail('ctx.history(n) needs an integer from 0 (this bar) to '+HDEPTH+'.');
      if(source!==undefined&&!contains(PRICE_SOURCES,source))fail('ctx.history(n, source) needs a price source: open, high, low, close, hl2, hlc3, ohlc4 or hlcc4.');
      requireEvent();const row=barAgo(n);if(row===null)return null;if(source===undefined)return freeze(row);return historyPrice(row,source);
    };
    // ctx.series(key, value, depth): records value for this bar and returns an accessor; at(n) is the value
    // recorded n bars back on this key (0 = this bar), null before the key has that many values.
    const seriesNodes=createObject(null);
    const series=(key,value,depth=100)=>{
      requireEvent();
      if(typeof key!=='string'||key.length<1||key.length>128)fail('ctx.series needs a key: a string of 1 to 128 characters.');
      let base=seriesNodes[key];
      if(base===undefined){for(let i=0;i<key.length;i++)if(apply(charCodeAt,key,[i])===0)fail('ctx.series keys cannot contain a NUL character.');base=null;}
      if(!(value===null||typeof value==='number'&&isFinite(value)||typeof value==='boolean'))fail('ctx.series values must be finite numbers, true or false, or null.');
      if(!isInteger(depth)||depth<1||depth>HDEPTH)fail('ctx.series depth must be an integer from 1 to '+HDEPTH+'.');
      if(base===null){base=nodeOf(SEP+'series'+SEP+key);defineProperty(seriesNodes,key,{value:base,writable:false,configurable:false});}
      const recorded=typeof value==='boolean'?(value?1:0):value,p=slotIn(kid(base,'params'),2);
      if(p.sum===0){p.values[0]=depth;p.values[1]=typeof value==='boolean'?1:0;p.sum=1;}
      else if(p.values[0]!==depth)fail('ctx.series key "'+key+'" changed its depth. Use a new key for a different depth.');
      const boolean=p.values[1]===1;
      if(value!==null&&(typeof value==='boolean')!==boolean)fail('ctx.series key "'+key+'" mixes numbers and true or false values.');
      const r=ring(base,depth+1),now=snapshot.processedCount;
      if(base.callBar===now){if(base.callOut!==recorded)fail('ctx.series key "'+key+'" was already recorded on this bar with another value.');}
      else{r.push(recorded);base.callBar=now;base.callOut=recorded;}
      return n=>{if(!isInteger(n)||n<0||n>depth)fail('A series accessor needs an integer from 0 to its depth, '+depth+'.');const out=r.at(n);if(out===undefined||out===null)return null;return boolean?out===1:out;};
    };
    // ---- kernels ----
    // EMA: first finite value seeds, missing values return null and keep the accumulator (LV ema kernel).
    const emaStep=(name,n,value)=>{const s=regs(name,2);if(value===null)return null;const alpha=2/(n+1);s[1]=s[0]?alpha*value+(1-alpha)*s[1]:value;s[0]=1;return s[1];};
    // SMA-seeded EMA (null until n finite values, then their mean), as the LV built-in MACD and KC.
    const emaSeededStep=(name,n,value)=>{const s=regs(name,3);if(value===null)return null;const alpha=2/(n+1);if(s[0]<n){s[2]+=value;s[0]++;if(s[0]<n)return null;s[1]=s[2]/n;return s[1];}s[1]=alpha*value+(1-alpha)*s[1];return s[1];};
    // RMA: seeded by the mean of the first n finite values, then (prior x (n - 1) + value) / n (LV built-in RMA).
    const rmaStep=(name,n,value)=>{const s=regs(name,4);if(value===null)return null;if(!s[2]){s[1]+=value;s[0]++;if(s[0]===n){s[3]=s[1]/n;s[2]=1;}return s[2]?s[3]:null;}s[3]=(s[3]*(n-1)+value)/n;return s[3];};
    const meanOf=w=>{let sum=0;for(let i=0;i<w.length;i++)sum+=w[i];return sum/w.length;};
    const viewMean=w=>{if(isArray(w))return meanOf(w);const values=w.v.values,L=w.L,start=w.v.sum%L;let sum=0;for(let i=start;i<L;i++)sum+=values[i];for(let i=0;i<start;i++)sum+=values[i];return sum/L;};
    const smaStep=(name,n,value)=>{const w=pushView(name,n,value);return w===null?null:viewMean(w);};
    const wmaOf=w=>{let sum=0;for(let k=0;k<w.length;k++)sum+=w[k]*(k+1);return sum/(w.length*(w.length+1)/2);};
    const viewWma=w=>{if(isArray(w))return wmaOf(w);const values=w.v.values,L=w.L,start=w.v.sum%L;let sum=0,k=0;for(let i=start;i<L;i++)sum+=values[i]*(++k);for(let i=0;i<start;i++)sum+=values[i]*(++k);return sum/(L*(L+1)/2);};
    const wmaStep=(name,n,value)=>{const w=pushView(name,n,value);return w===null?null:viewWma(w);};
    // Two-pass variance about the oldest value, as the LV built-in Bollinger deviation; biased = population.
    const varianceOf=(w,biased)=>{if(!biased&&w.length<2)return null;const origin=w[0];let offset=0;for(let i=0;i<w.length;i++)offset+=w[i]-origin;offset/=w.length;let sum=0;for(let i=0;i<w.length;i++){const d=(w[i]-origin)-offset;sum+=d*d;}return mathMax(0,sum/(biased?w.length:w.length-1));};
    const viewVariance=(w,biased)=>{if(isArray(w))return varianceOf(w,biased);const values=w.v.values,L=w.L,start=w.v.sum%L;if(!biased&&L<2)return null;const origin=values[start];let offset=0;
      for(let i=start;i<L;i++)offset+=values[i]-origin;for(let i=0;i<start;i++)offset+=values[i]-origin;offset/=L;let sum=0;
      for(let i=start;i<L;i++){const d=(values[i]-origin)-offset;sum+=d*d;}for(let i=0;i<start;i++){const d=(values[i]-origin)-offset;sum+=d*d;}return mathMax(0,sum/(biased?L:L-1));};
    const trueRange=handleNa=>{const bar=currentBar(),prior=barAgo(1);if(prior===null)return handleNa?bar.high-bar.low:null;return mathMax(bar.high-bar.low,mathAbs(bar.high-prior.close),mathAbs(bar.low-prior.close));};
    const previous=(name,value)=>{const s=regs(name,3),had=s[0]===1&&s[2]===1,prior=s[1];s[0]=1;s[2]=value===null?0:1;s[1]=value===null?0:value;return had?prior:null;};
    const extremeOf=(w,high)=>{let best=w[w.length-1],at=0;for(let k=1;k<w.length;k++){const value=w[w.length-1-k];if(high?value>best:value<best){best=value;at=k;}}return{best,at};};
    const pivotOf=(w,right,high)=>{const center=w[w.length-1-right];for(let i=0;i<w.length;i++){if(i===w.length-1-right)continue;if(high?!(center>w[i]):!(center<w[i]))return null;}return center;};
    const lagged=(name,n,value)=>{const r=ring(name,n+1);r.push(value);const base=r.at(n);return base===undefined?null:base;};
    const crossing=(fn,key,a,b,direction)=>{const x=source(fn,a,'first series'),y=source(fn,b,'second series');return keyed(fn,key,[],[x,y],base=>{
      const s=regs(base,4),had=s[0]===1&&s[3]===1,px=s[1],py=s[2];s[0]=1;s[3]=x!==null&&y!==null?1:0;s[1]=x===null?0:x;s[2]=y===null?0:y;
      if(!had||x===null||y===null)return false;const up=x>y&&px<=py,down=x<y&&px>=py;return direction>0?up:direction<0?down:up||down;});};
    // Sort private copies with index loops and captured primitives. Guest prototypes are untrusted.
    const sortedWindow=w=>{let a=[],b=[];for(let i=0;i<w.length;i++)append(a,w[i]);for(let width=1;width<a.length;width*=2){for(let start=0;start<a.length;start+=2*width){const middle=mathMin(start+width,a.length),end=mathMin(start+2*width,a.length);let left=start,right=middle;for(let at=start;at<end;at++)b[at]=left<middle&&(right>=end||a[left]<=a[right])?a[left++]:a[right++];}const swap=a;a=b;b=swap;}return a;};
    const percentile=(fn,key,value,n,percentage,linear)=>{const v=source(fn,value),len=length(fn,n),p=real(fn,percentage,'percentage');if(p<0||p>100)fail(taName(fn)+': percentage must be from 0 to 100.');return keyed(fn,key,[len,p],[v],base=>{const w=pushWindow(base,len,v);if(w===null)return null;const sorted=sortedWindow(w);if(!linear)return sorted[mathMax(0,mathCeil(p*len/100)-1)];const at=p/100*(len-1),lo=mathFloor(at),hi=mathCeil(at);return result(fn,sorted[lo]*(1-(at-lo))+sorted[hi]*(at-lo));});};
    const runningExtreme=(fn,key,value,high)=>{const v=source(fn,value);return keyed(fn,key,[],[v],base=>{const s=regs(base,2);if(v!==null){if(!s[0]||(high?v>s[1]:v<s[1]))s[1]=v;s[0]=1;}return s[0]?s[1]:null;});};
    const sourceValue=name=>{requireEvent();if(!contains(PRICE_SOURCES,name))fail('ctx.ta.source needs a price source: open, high, low, close, hl2, hlc3, ohlc4 or hlcc4.');const b=currentBar();if(name==='hl2'){const sum=b.high+b.low;return result('source',isFinite(sum)?sum/2:b.high/2+b.low/2);}if(name==='hlc3'){const sum=b.high+b.low+b.close;return result('source',isFinite(sum)?sum/3:b.high/3+b.low/3+b.close/3);}if(name==='ohlc4'){const sum=b.open+b.high+b.low+b.close;return result('source',isFinite(sum)?sum/4:b.open/4+b.high/4+b.low/4+b.close/4);}if(name==='hlcc4'){const sum=b.high+b.low+2*b.close;return result('source',isFinite(sum)?sum/4:b.high/4+b.low/4+b.close/2);}return b[name];};
    // Helpers.
    const volumeIndex=(fn,key,direction)=>keyed(fn,key,[],[],base=>{const s=regs(base,1),b=currentBar(),prior=barAgo(1);let index=s[0]===0?1:s[0];
      if(prior!==null&&b.close!==0&&prior.close!==0){const v=b.volume,pv=prior.volume;if(v!==null&&v===v&&pv!==null&&pv===pv&&(direction<0?v<pv:v>pv))index=result(fn,index+(b.close-prior.close)/prior.close*index);}
      s[0]=index;return index;});
    const PIVOT_TYPES=['Traditional','Fibonacci','Woodie','Classic','DM','Camarilla'];
    const pivotType=type=>{for(let i=0;i<PIVOT_TYPES.length;i++)if(PIVOT_TYPES[i]===type)return i;fail('ctx.ta.pivot_point_levels type must be one of '+PIVOT_TYPES.join(', ')+'.');};
    const PIVOT_NONE=freeze([null,null,null,null,null,null,null,null,null,null,null]);
    const pivotLevelsOf=(t,O,H,L,C,currentOpen)=>{const R=H-L,r=v=>result('pivot_point_levels',v);let P,o;
      if(t===0){P=(H+L+C)/3;o=[P,P*2-L,P*2-H,P+R,P-R,P*2+(H-2*L),P*2-(2*H-L),P*3+(H-3*L),P*3-(3*H-L),P*4+(H-4*L),P*4-(4*H-L)];}
      else if(t===1){P=(H+L+C)/3;o=[P,P+0.382*R,P-0.382*R,P+0.618*R,P-0.618*R,P+R,P-R,null,null,null,null];}
      else if(t===2){P=(H+L+2*currentOpen)/4;const r3=H+2*(P-L),s3=L-2*(H-P);o=[P,2*P-L,2*P-H,P+R,P-R,r3,s3,r3+R,s3-R,null,null];}
      else if(t===3){P=(H+L+C)/3;o=[P,2*P-L,2*P-H,P+R,P-R,P+2*R,P-2*R,P+3*R,P-3*R,null,null];}
      else if(t===4){const X=O===C?H+L+2*C:C>O?2*H+L+C:2*L+H+C;o=[X/4,X/2-L,X/2-H,null,null,null,null,null,null,null,null];}
      else{P=(H+L+C)/3;const r5=L!==0?H/L*C:null;o=[P,C+1.1*R/12,C-1.1*R/12,C+1.1*R/6,C-1.1*R/6,C+1.1*R/4,C-1.1*R/4,C+1.1*R/2,C-1.1*R/2,r5,r5===null?null:C-(r5-C)];}
      const out=[];for(let i=0;i<11;i++)append(out,o[i]===null?null:r(o[i]));return freeze(out);};
    const ta=freeze({
      // Finite windows warm up with null; every keyed update shares the onFill guard.
      source(name){return sourceValue(name);},
      alma(key,value,n,offset=0.85,sigma=6,floor=false){const v=source('alma',value),len=length('alma',n),o=real('alma',offset,'offset'),s=real('alma',sigma,'sigma');flag('alma',floor,'floor');if(s<=0)fail('ctx.ta.alma: sigma must be positive.');return keyed('alma',key,[len,o,s,floor?1:0],[v],base=>{const w=pushWindow(base,len,v);if(w===null)return null;const center=floor?mathFloor(o*(len-1)):o*(len-1),width=len/s;let top=0,bottom=0;for(let i=0;i<len;i++){const distance=(i-center)/width,weight=mathExp(-distance*distance/2);top=result('alma',top+result('alma',w[i]*weight));bottom+=weight;}return bottom===0?null:result('alma',top/bottom);});},
      dema(key,value,n){const v=source('dema',value),len=length('dema',n);return keyed('dema',key,[len],[v],base=>{const first=result('dema',emaStep(kid(base,'a'),len,v)),second=result('dema',emaStep(kid(base,'b'),len,first));return first===null||second===null?null:result('dema',2*first-second);});},
      tema(key,value,n){const v=source('tema',value),len=length('tema',n);return keyed('tema',key,[len],[v],base=>{const a=result('tema',emaStep(kid(base,'a'),len,v)),b=result('tema',emaStep(kid(base,'b'),len,a)),c=result('tema',emaStep(kid(base,'c'),len,b));return a===null||b===null||c===null?null:result('tema',3*a-3*b+c);});},
      swma(key,value){const v=source('swma',value);return keyed('swma',key,[],[v],base=>{const w=pushWindow(base,4,v);return w===null?null:result('swma',w[0]/6+w[1]/3+w[2]/3+w[3]/6);});},
      linreg(key,value,n,offset=0){const v=source('linreg',value),len=length('linreg',n),o=count('linreg',offset,'offset',-5000,5000);return keyed('linreg',key,[len,o],[v],base=>{const w=pushWindow(base,len,v);if(w===null)return null;if(len===1)return w[0];const mean=result('linreg',meanOf(w)),center=(len-1)/2;let numerator=0,denominator=0;for(let i=0;i<len;i++){numerator=result('linreg',numerator+(i-center)*(w[i]-mean));denominator+=(i-center)*(i-center);}return result('linreg',mean+numerator/denominator*(len-1-o-center));});},
      vwap(key,value,anchor=false,multiplier){const v=source('vwap',value),reset=flag('vwap',anchor,'anchor'),bands=multiplier!==undefined,m=bands?real('vwap',multiplier,'multiplier'):0;return keyed('vwap',key,[bands?1:0,m],[v,reset],base=>{const s=regs(base,3);if(reset){s[0]=0;s[1]=0;s[2]=0;}const volume=currentBar().volume;if(v!==null&&volume!==null){const weighted=result('vwap',v*volume),square=result('vwap',weighted*v),total=result('vwap',s[0]+volume),sum=result('vwap',s[1]+weighted),squares=result('vwap',s[2]+square);s[0]=total;s[1]=sum;s[2]=squares;}const mean=s[0]===0?null:result('vwap',s[1]/s[0]);if(!bands)return mean;if(mean===null)return freeze({vwap:null,upper:null,lower:null});const deviation=result('vwap',mathSqrt(mathMax(0,s[2]/s[0]-mean*mean)));return freeze({vwap:mean,upper:result('vwap',mean+m*deviation),lower:result('vwap',mean-m*deviation)});});},
      wpr(key,n){const len=length('wpr',n);return keyed('wpr',key,[len],[],base=>{const b=currentBar(),highs=pushWindow(kid(base,'h'),len,b.high),lows=pushWindow(kid(base,'l'),len,b.low);if(highs===null||lows===null)return null;const hi=extremeOf(highs,true).best,lo=extremeOf(lows,false).best;return hi===lo?null:result('wpr',(b.close-hi)/(hi-lo)*100);});},
      cmo(key,value,n){const v=source('cmo',value),len=length('cmo',n);return keyed('cmo',key,[len],[v],base=>{const p=previous(kid(base,'p'),v),change=v===null||p===null?null:result('cmo',v-p),up=pushWindow(kid(base,'u'),len,change===null?null:mathMax(change,0)),down=pushWindow(kid(base,'d'),len,change===null?null:mathMax(-change,0));if(up===null||down===null)return null;let u=0,d=0;for(let i=0;i<len;i++){u=result('cmo',u+up[i]);d=result('cmo',d+down[i]);}const total=result('cmo',u+d);return total===0?null:result('cmo',(u-d)/total*100);});},
      tsi(key,value,shortLength,longLength){const v=source('tsi',value),short=length('tsi',shortLength,'short length'),long=length('tsi',longLength,'long length');return keyed('tsi',key,[short,long],[v],base=>{const p=previous(kid(base,'p'),v),change=p===null||v===null?null:result('tsi',v-p),a=result('tsi',emaStep(kid(base,'a'),long,change)),b=result('tsi',emaStep(kid(base,'b'),long,change===null?null:mathAbs(change))),top=result('tsi',emaStep(kid(base,'c'),short,a)),bottom=result('tsi',emaStep(kid(base,'d'),short,b));return top===null||bottom===null||bottom===0?null:result('tsi',top/bottom);});},
      percentrank(key,value,n){const v=source('percentrank',value),len=length('percentrank',n,'length',4999);return keyed('percentrank',key,[len],[v],base=>{const w=pushWindow(base,len+1,v);if(w===null)return null;let matches=0;for(let i=0;i<len;i++)if(w[i]<=v)matches++;return matches/len*100;});},
      cog(key,value,n){const v=source('cog',value),len=length('cog',n);return keyed('cog',key,[len],[v],base=>{const w=pushWindow(base,len,v);if(w===null)return null;let top=0,bottom=0;for(let i=0;i<len;i++){top=result('cog',top+result('cog',w[i]*(len-i)));bottom=result('cog',bottom+w[i]);}return bottom===0?null:result('cog',-top/bottom);});},
      median(key,value,n){const v=source('median',value),len=length('median',n);return keyed('median',key,[len],[v],base=>{const w=pushWindow(base,len,v);if(w===null)return null;const sorted=sortedWindow(w),middle=mathFloor(len/2);return len%2?sorted[middle]:result('median',sorted[middle-1]/2+sorted[middle]/2);});},
      dev(key,value,n){const v=source('dev',value),len=length('dev',n);return keyed('dev',key,[len],[v],base=>{const w=pushWindow(base,len,v);if(w===null)return null;const mean=result('dev',meanOf(w));let sum=0;for(let i=0;i<len;i++)sum=result('dev',sum+mathAbs(w[i]-mean));return result('dev',sum/len);});},
      range(key,value,n){const v=source('range',value),len=length('range',n);return keyed('range',key,[len],[v],base=>{const w=pushWindow(base,len,v);return w===null?null:result('range',extremeOf(w,true).best-extremeOf(w,false).best);});},
      percentile_nearest_rank(key,value,n,percentage){return percentile('percentile_nearest_rank',key,value,n,percentage,false);},
      percentile_linear_interpolation(key,value,n,percentage){return percentile('percentile_linear_interpolation',key,value,n,percentage,true);},
      max(key,value){return runningExtreme('max',key,value,true);},
      min(key,value){return runningExtreme('min',key,value,false);},
      bbw(key,value,n,multiplier=2){const v=source('bbw',value),len=length('bbw',n),m=real('bbw',multiplier,'multiplier');return keyed('bbw',key,[len,m],[v],base=>{const w=pushView(base,len,v);if(w===null)return null;const basis=result('bbw',viewMean(w));return basis===0?null:result('bbw',2*m*mathSqrt(viewVariance(w,true))/basis);});},
      kcw(key,value,n,multiplier,useTrueRange=true){const v=source('kcw',value),len=length('kcw',n),m=real('kcw',multiplier,'multiplier');flag('kcw',useTrueRange,'useTrueRange');return keyed('kcw',key,[len,m,useTrueRange?1:0],[v],base=>{const b=currentBar(),basis=result('kcw',emaStep(kid(base,'b'),len,v)),width=result('kcw',emaStep(kid(base,'w'),len,useTrueRange?trueRange(true):b.high-b.low));return basis===null||width===null||basis===0?null:result('kcw',2*m*width/basis);});},
      sar(key,start,increment,maximum){const a=real('sar',start,'start'),step=real('sar',increment,'increment'),max=real('sar',maximum,'maximum');if(a<0||step<0||max<a)fail('ctx.ta.sar: start and increment must be non-negative and maximum at least start.');return keyed('sar',key,[a,step,max],[],base=>{const s=regs(base,5),bar=currentBar(),prior=barAgo(1);if(prior===null)return null;let up=s[1]===1,stop=s[2],extreme=s[3],af=s[4];if(!s[0]){up=bar.close>prior.close;stop=up?prior.low:prior.high;extreme=up?bar.high:bar.low;af=a;}stop=result('sar',stop+af*(extreme-stop));let reversed=false;if(up&&stop>bar.low){up=false;stop=mathMax(extreme,bar.high);extreme=bar.low;af=a;reversed=true;}else if(!up&&stop<bar.high){up=true;stop=mathMin(extreme,bar.low);extreme=bar.high;af=a;reversed=true;}if(!reversed&&s[0]){if(up&&bar.high>extreme){extreme=bar.high;af=mathMin(max,af+step);}else if(!up&&bar.low<extreme){extreme=bar.low;af=mathMin(max,af+step);}}const previous2=barAgo(2);stop=up?mathMin(stop,prior.low,previous2===null?prior.low:previous2.low):mathMax(stop,prior.high,previous2===null?prior.high:previous2.high);s[0]=1;s[1]=up?1:0;s[2]=result('sar',stop);s[3]=extreme;s[4]=af;return s[2];});},
      supertrend(key,factor,atrLength){const f=real('supertrend',factor,'factor'),len=length('supertrend',atrLength,'ATR length');if(f<=0)fail('ctx.ta.supertrend: factor must be positive.');return keyed('supertrend',key,[f,len],[],base=>{const b=currentBar(),atr=result('supertrend',rmaStep(kid(base,'a'),len,trueRange(true))),s=regs(base,5);if(atr===null)return freeze({value:null,direction:null});const middle=b.high/2+b.low/2;let upper=result('supertrend',middle+f*atr),lower=result('supertrend',middle-f*atr),direction=1;if(s[0]){if(!(lower>s[2]||s[4]<s[2]))lower=s[2];if(!(upper<s[1]||s[4]>s[1]))upper=s[1];direction=s[3]===1?(b.close>upper?-1:1):(b.close<lower?1:-1);}s[0]=1;s[1]=upper;s[2]=lower;s[3]=direction;s[4]=b.close;return freeze({value:direction<0?lower:upper,direction});});},
      accdist(key){return keyed('accdist',key,[],[],base=>{const b=currentBar(),s=regs(base,1),flow=b.high===b.low||b.volume===null?0:result('accdist',((b.close-b.low)-(b.high-b.close))/(b.high-b.low)*b.volume),next=result('accdist',s[0]+flow);s[0]=next;return next;});},
      pvt(key){return keyed('pvt',key,[],[],base=>{const b=currentBar(),s=regs(base,1),prior=barAgo(1);if(prior===null)return null;if(prior.close===0||b.volume===null)return null;const flow=result('pvt',(b.close-prior.close)/prior.close*b.volume),next=result('pvt',s[0]+flow);s[0]=next;return next;});},

      sma(key,value,n){const v=source('sma',value),len=length('sma',n);return keyed('sma',key,[len],[v],base=>result('sma',smaStep(base,len,v)));},
      ema(key,value,n){const v=source('ema',value),len=length('ema',n);return keyed('ema',key,[len],[v],base=>result('ema',emaStep(base,len,v)));},
      rma(key,value,n){const v=source('rma',value),len=length('rma',n);return keyed('rma',key,[len],[v],base=>result('rma',rmaStep(base,len,v)));},
      wma(key,value,n){const v=source('wma',value),len=length('wma',n);return keyed('wma',key,[len],[v],base=>result('wma',wmaStep(base,len,v)));},
      // VWMA: SMA of source x volume over SMA of volume, both over the same n bars (LV built-in VWMA).
      vwma(key,value,n){const v=source('vwma',value),len=length('vwma',n);return keyed('vwma',key,[len],[v],base=>{const volume=currentBar().volume,weighted=v===null?null:v*volume;if(weighted!==null&&!isFinite(weighted))fail('ctx.ta.vwma arithmetic overflowed; the value is unavailable.');const top=smaStep(kid(base,'pv'),len,weighted),bottom=smaStep(kid(base,'vol'),len,volume);return top!==null&&bottom!==null&&bottom!==0?result('vwma',top/bottom):null;});},
      // HMA: WMA(2 x WMA(n/2) - WMA(n), sqrt(n)), n/2 and sqrt(n) rounded down with minimum 1 (LV built-in HMA).
      hma(key,value,n){const v=source('hma',value),len=length('hma',n);return keyed('hma',key,[len],[v],base=>{const half=wmaStep(kid(base,'h'),mathMax(1,mathFloor(len/2)),v),full=wmaStep(kid(base,'f'),len,v),raw=half!==null&&full!==null?2*half-full:null;return result('hma',wmaStep(kid(base,'r'),mathMax(1,mathFloor(mathSqrt(len))),raw));});},
      // RSI: RMA of gains and losses against the previous value; flat (both zero) is null (LV built-in RSI).
      rsi(key,value,n){const v=source('rsi',value),len=length('rsi',n);return keyed('rsi',key,[len],[v],base=>{
        const prior=previous(kid(base,'prev'),v),gain=prior!==null&&v!==null?mathMax(v-prior,0):null,loss=prior!==null&&v!==null?mathMax(prior-v,0):null;
        const up=rmaStep(kid(base,'up'),len,gain),down=rmaStep(kid(base,'dn'),len,loss);
        if(up===null||down===null||up===0&&down===0)return null;if(down===0)return 100;if(up===0)return 0;return result('rsi',100-100/(1+up/down));});},
      // MACD with EMA oscillator and signal (LV built-in MACD defaults 12, 26, 9).
      macd(key,value,fast=12,slow=26,signal=9){const v=source('macd',value),f=length('macd',fast,'fast length'),s=length('macd',slow,'slow length'),g=length('macd',signal,'signal length');return keyed('macd',key,[f,s,g],[v],base=>{
        const a=emaSeededStep(kid(base,'f'),f,v),b=emaSeededStep(kid(base,'s'),s,v),line=a!==null&&b!==null?a-b:null,sig=emaSeededStep(kid(base,'g'),g,line),hist=line!==null&&sig!==null?line-sig:null;
        return freeze({macd:result('macd',line),signal:result('macd',sig),histogram:result('macd',hist)});});},
      // Raw stochastic: 100 x (source - lowest low) / (highest high - lowest low); a flat range is null (LV built-in %K before smoothing).
      stoch(key,value,high,low,n){const v=source('stoch',value),h=source('stoch',high,'high'),l=source('stoch',low,'low'),len=length('stoch',n);return keyed('stoch',key,[len],[v,h,l],base=>{
        const highs=pushWindow(kid(base,'h'),len,h),lows=pushWindow(kid(base,'l'),len,l);if(highs===null||lows===null||v===null)return null;
        const top=extremeOf(highs,true).best,bottom=extremeOf(lows,false).best;if(top===bottom)return null;const numerator=v-bottom,denominator=top-bottom,scaled=100*numerator;
        return result('stoch',isFinite(scaled)?scaled/denominator:numerator/denominator*100);});},
      // True range against the previous supplied bar. With no previous bar: high - low when handleNa is true, else null.
      tr(handleNa=false){flag('tr',handleNa,'handleNa');requireEvent();return result('tr',trueRange(handleNa));},
      // ATR: RMA of true range, the first bar using high - low (LV built-in ATR, RMA smoothing).
      atr(key,n){const len=length('atr',n);return keyed('atr',key,[len],[],base=>result('atr',rmaStep(base,len,trueRange(true))));},
      // Bollinger bands: SMA basis +/- multiplier x population deviation (LV built-in BB, SMA basis).
      bb(key,value,n,multiplier=2){const v=source('bb',value),len=length('bb',n),m=real('bb',multiplier,'multiplier');return keyed('bb',key,[len,m],[v],base=>{
        const w=pushView(base,len,v);if(w===null)return freeze({basis:null,upper:null,lower:null});const basis=viewMean(w),deviation=mathSqrt(viewVariance(w,true));
        return freeze({basis:result('bb',basis),upper:result('bb',basis+m*deviation),lower:result('bb',basis-m*deviation)});});},
      // Keltner channels: EMA basis +/- multiplier x EMA of true range (or high - low) (LV built-in KC, exponential).
      kc(key,value,n,multiplier,useTrueRange=true){const v=source('kc',value),len=length('kc',n),m=real('kc',multiplier,'multiplier');flag('kc',useTrueRange,'useTrueRange');return keyed('kc',key,[len,m,useTrueRange?1:0],[v],base=>{
        const bar=currentBar(),basis=emaSeededStep(kid(base,'b'),len,v),width=emaSeededStep(kid(base,'w'),len,useTrueRange?trueRange(true):bar.high-bar.low);
        if(basis===null||width===null)return freeze({basis:result('kc',basis),upper:null,lower:null});return freeze({basis:result('kc',basis),upper:result('kc',basis+m*width),lower:result('kc',basis-m*width)});});},
      // DMI: +DI, -DI and ADX with RMA smoothing; the first bar has no directional movement (LV built-in DMI).
      dmi(key,diLength,adxSmoothing){const di=length('dmi',diLength,'DI length'),smooth=length('dmi',adxSmoothing,'ADX smoothing');return keyed('dmi',key,[di,smooth],[],base=>{
        const bar=currentBar(),prior=barAgo(1);let plus=null,minus=null,range=null;
        if(prior!==null){const up=bar.high-prior.high,down=prior.low-bar.low;plus=up>down&&up>0?up:0;minus=down>up&&down>0?down:0;range=mathMax(bar.high-bar.low,mathAbs(bar.high-prior.close),mathAbs(bar.low-prior.close));}
        const str=rmaStep(kid(base,'tr'),di,range),sp=rmaStep(kid(base,'p'),di,plus),sm=rmaStep(kid(base,'m'),di,minus);
        const plusDI=str!==null&&str>0&&sp!==null?100*sp/str:null,minusDI=str!==null&&str>0&&sm!==null?100*sm/str:null;
        const dx=plusDI===null||minusDI===null||plusDI+minusDI===0?null:100*mathAbs(plusDI-minusDI)/(plusDI+minusDI);
        return freeze({plusDI:result('dmi',plusDI),minusDI:result('dmi',minusDI),adx:result('dmi',rmaStep(kid(base,'adx'),smooth,dx))});});},
      // CCI: (source - SMA) / (0.015 x mean absolute deviation); zero deviation is null (LV built-in CCI).
      cci(key,value,n){const v=source('cci',value),len=length('cci',n);return keyed('cci',key,[len],[v],base=>{const w=pushWindow(base,len,v);if(w===null)return null;const mean=meanOf(w);let deviation=0;for(let i=0;i<w.length;i++)deviation+=mathAbs(w[i]-mean);deviation/=len;return deviation===0?null:result('cci',(v-mean)/(0.015*deviation));});},
      // MFI over a typical-price source and the bar volume (LV built-in MFI uses hlc3).
      mfi(key,value,n){const v=source('mfi',value),len=length('mfi',n);return keyed('mfi',key,[len],[v],base=>{
        const prior=previous(kid(base,'prev'),v),volume=currentBar().volume,flow=v===null?null:v*volume;
        const pos=prior===null||v===null?null:v>prior?flow:0,neg=prior===null||v===null?null:v<prior?flow:0;
        const p=pushWindow(kid(base,'pos'),len,pos),q=pushWindow(kid(base,'neg'),len,neg);if(p===null||q===null)return null;
        let up=0,down=0;for(let i=0;i<len;i++){up+=p[i];down+=q[i];}if(up+down===0)return null;if(down===0)return 100;return result('mfi',100-100/(1+up/down));});},
      // OBV: starts at 0 and adds or subtracts the bar volume when close rises or falls (LV built-in OBV).
      obv(key){return keyed('obv',key,[],[],base=>{const s=regs(base,3),bar=currentBar();if(s[0]&&bar.close>s[1])s[2]+=bar.volume;else if(s[0]&&bar.close<s[1])s[2]-=bar.volume;s[0]=1;s[1]=bar.close;return result('obv',s[2]);});},
      highest(key,value,n){const v=source('highest',value),len=length('highest',n);return keyed('highest',key,[len],[v],base=>{const w=pushWindow(base,len,v);return w===null?null:extremeOf(w,true).best;});},
      lowest(key,value,n){const v=source('lowest',value),len=length('lowest',n);return keyed('lowest',key,[len],[v],base=>{const w=pushWindow(base,len,v);return w===null?null:extremeOf(w,false).best;});},
      // Offset (0 or negative) to the highest or lowest value in the window; ties pick the most recent bar.
      highestbars(key,value,n){const v=source('highestbars',value),len=length('highestbars',n);return keyed('highestbars',key,[len],[v],base=>{const w=pushWindow(base,len,v);return w===null?null:result('highestbars',-extremeOf(w,true).at);});},
      lowestbars(key,value,n){const v=source('lowestbars',value),len=length('lowestbars',n);return keyed('lowestbars',key,[len],[v],base=>{const w=pushWindow(base,len,v);return w===null?null:result('lowestbars',-extremeOf(w,false).at);});},
      change(key,value,n=1){const v=source('change',value),len=length('change',n,'length',4999);return keyed('change',key,[len],[v],base=>{const prior=lagged(base,len,v);return v===null||prior===null?null:result('change',v-prior);});},
      // Momentum: source - source n bars back (LV built-in Mom).
      mom(key,value,n){const v=source('mom',value),len=length('mom',n,'length',4999);return keyed('mom',key,[len],[v],base=>{const prior=lagged(base,len,v);return v===null||prior===null?null:result('mom',v-prior);});},
      // Rate of change: (source - prior) / prior x 100; a zero prior is null (LV built-in ROC).
      roc(key,value,n){const v=source('roc',value),len=length('roc',n,'length',4999);return keyed('roc',key,[len],[v],base=>{const prior=lagged(base,len,v);return v===null||prior===null||prior===0?null:result('roc',(v-prior)/prior*100);});},
      stdev(key,value,n,biased=true){const v=source('stdev',value),len=length('stdev',n);flag('stdev',biased,'biased');return keyed('stdev',key,[len,biased?1:0],[v],base=>{const w=pushView(base,len,v);if(w===null)return null;const variance=viewVariance(w,biased);return variance===null?null:result('stdev',mathSqrt(variance));});},
      variance(key,value,n,biased=true){const v=source('variance',value),len=length('variance',n);flag('variance',biased,'biased');return keyed('variance',key,[len,biased?1:0],[v],base=>{const w=pushView(base,len,v);return w===null?null:result('variance',viewVariance(w,biased));});},
      // Pearson correlation over n bars; a flat window is null; clamped to -1..1 (LV built-in Correlation coefficient).
      correlation(key,a,b,n){const x=source('correlation',a,'first series'),y=source('correlation',b,'second series'),len=length('correlation',n);return keyed('correlation',key,[len],[x,y],base=>{
        const wa=pushWindow(kid(base,'a'),len,x),wb=pushWindow(kid(base,'b'),len,y);if(wa===null||wb===null)return null;const ma=meanOf(wa),mb=meanOf(wb);let cov=0,va=0,vb=0;
        for(let i=0;i<len;i++){const dx=wa[i]-ma,dy=wb[i]-mb;cov+=dx*dy;va+=dx*dx;vb+=dy*dy;}if(va===0||vb===0)return null;return result('correlation',mathMax(-1,mathMin(1,cov/mathSqrt(va*vb))));});},
      // a above b now and at or below b on the key's previous update (crossunder mirrors it; cross is either).
      crossover(key,a,b){return crossing('crossover',key,a,b,1);},
      crossunder(key,a,b){return crossing('crossunder',key,a,b,-1);},
      cross(key,a,b){return crossing('cross',key,a,b,0);},
      // true when the source is above (rising) or below (falling) each of its previous n values.
      rising(key,value,n){const v=source('rising',value),len=length('rising',n,'length',4999);return keyed('rising',key,[len],[v],base=>{const w=pushWindow(base,len+1,v);if(w===null)return false;for(let i=0;i<len;i++)if(!(w[len]>w[i]))return false;return true;});},
      falling(key,value,n){const v=source('falling',value),len=length('falling',n,'length',4999);return keyed('falling',key,[len],[v],base=>{const w=pushWindow(base,len+1,v);if(w===null)return false;for(let i=0;i<len;i++)if(!(w[len]<w[i]))return false;return true;});},
      // Updates of this key since the condition was last true (0 on a true update), null before the first true one.
      barssince(key,condition){const c=flag('barssince',condition,'condition');return keyed('barssince',key,[],[c],base=>{const s=regs(base,2);if(c){s[0]=1;s[1]=0;}else if(s[0])s[1]++;return s[0]?s[1]:null;});},
      // The source on the occurrence-th most recent update where the condition was true (0 = the latest).
      valuewhen(key,condition,value,occurrence=0){const c=flag('valuewhen',condition,'condition'),v=source('valuewhen',value),o=count('valuewhen',occurrence,'occurrence',0,100);return keyed('valuewhen',key,[o],[c,v],base=>{const r=ring(base,o+1);if(c)r.push(v);const out=r.at(o);return out===undefined?null:out;});},
      // Pivots, confirmed right bars later (never earlier): the value right bars back when it is strictly above
      // (pivothigh) or below (pivotlow) every other value in the left + right window, else null (the LV RSI
      // divergence pivot rule INDREST-DD-1).
      pivothigh(key,value,left,right){const v=source('pivothigh',value),l=count('pivothigh',left,'left',1,2000),r=count('pivothigh',right,'right',0,2000);return keyed('pivothigh',key,[l,r],[v],base=>{const w=pushWindow(base,l+r+1,v);return w===null?null:pivotOf(w,r,true);});},
      pivotlow(key,value,left,right){const v=source('pivotlow',value),l=count('pivotlow',left,'left',1,2000),r=count('pivotlow',right,'right',0,2000);return keyed('pivotlow',key,[l,r],[v],base=>{const w=pushWindow(base,l+r+1,v);return w===null?null:pivotOf(w,r,false);});},
      // Running total of the finite values (null input adds nothing); null before the first finite value.
      cum(key,value){const v=source('cum',value);return keyed('cum',key,[],[v],base=>{const s=regs(base,2);if(v!==null){s[1]+=v;s[0]=1;}return s[0]?result('cum',s[1]):null;});},
      sum(key,value,n){const v=source('sum',value),len=length('sum',n);return keyed('sum',key,[len],[v],base=>{const w=pushWindow(base,len,v);if(w===null)return null;let total=0;for(let i=0;i<len;i++)total+=w[i];return result('sum',total);});},
      // LV-defined unless noted. fixnan: the latest finite value; null before the first one.
      fixnan(key,value){const v=source('fixnan',value);return keyed('fixnan',key,[],[v],base=>{const s=regs(base,2);if(v!==null){s[0]=1;s[1]=v;}return s[0]?s[1]:null;});},
      // mode: the most frequent value of the window; ties (including all-distinct windows) take the smallest value.
      mode(key,value,n){const v=source('mode',value),len=length('mode',n);return keyed('mode',key,[len],[v],base=>{const w=pushWindow(base,len,v);if(w===null)return null;const sorted=sortedWindow(w);let best=sorted[0],bestCount=0,run=0;for(let i=0;i<len;i++){run=i>0&&sorted[i]===sorted[i-1]?run+1:1;if(run>bestCount){bestCount=run;best=sorted[i];}}return best;});},
      // wad: running sum of close - min(low, prior close) on an up close, close - max(high, prior close) on a down close,
      // zero otherwise (and zero on the first bar).
      wad(key){return keyed('wad',key,[],[],base=>{const b=currentBar(),s=regs(base,1),prior=barAgo(1);let gain=0;if(prior!==null){if(b.close>prior.close)gain=b.close-mathMin(b.low,prior.close);else if(b.close<prior.close)gain=b.close-mathMax(b.high,prior.close);}const next=result('wad',s[0]+gain);s[0]=next;return next;});},
      // wvad: this bar's (close - open) / (high - low) x volume. A flat bar or missing volume is unavailable.
      wvad(){requireEvent();const b=currentBar(),volume=b.volume;if(b.high===b.low||volume===null||volume!==volume)return null;return result('wvad',(b.close-b.open)/(b.high-b.low)*volume);},
      // iii: intraday intensity (2 close - high - low) / ((high - low) x volume). Flat bar or zero/missing volume is unavailable.
      iii(){requireEvent();const b=currentBar(),volume=b.volume;if(b.high===b.low||volume===null||volume!==volume||volume===0)return null;return result('iii',(2*b.close-b.high-b.low)/((b.high-b.low)*volume));},
      // nvi / pvi: start at 1; on a bar whose volume is below (nvi) or above (pvi) the prior bar's, the index grows by the
      // close change ratio. Zero closes and missing volumes hold the index.
      nvi(key){return volumeIndex('nvi',key,-1);},
      pvi(key){return volumeIndex('pvi',key,1);},
      // pivot_point_levels: on an anchor bar the period that just ended (it began at the previous anchor) gives the levels,
      // which hold until the next anchor. developing = true reads the current period so far instead. Returns a frozen
      // 11-entry array [P, R1, S1, R2, S2, R3, S3, R4, S4, R5, S5]; a level the type does not define is null.
      // Formulas are those of the LV built-in Pivot Points Standard (src/domain/indicators-ext/r23-catalog.ts pivotLevels).
      pivot_point_levels(key,type,anchor,developing=false){const t=pivotType(type),a=flag('pivot_point_levels',anchor,'anchor'),d=flag('pivot_point_levels',developing,'developing');return keyed('pivot_point_levels',key,[t,d?1:0],[a],base=>{
        const s=regs(base,10),b=currentBar();
        // s: 0 started, 1-4 current O H L C, 5 has previous, 6-9 previous O H L C
        if(a){if(s[0]){s[5]=1;s[6]=s[1];s[7]=s[2];s[8]=s[3];s[9]=s[4];}s[0]=1;s[1]=b.open;s[2]=b.high;s[3]=b.low;s[4]=b.close;}
        else if(s[0]){if(b.high>s[2])s[2]=b.high;if(b.low<s[3])s[3]=b.low;s[4]=b.close;}
        if(d)return s[0]?pivotLevelsOf(t,s[1],s[2],s[3],s[4],s[1]):PIVOT_NONE;
        return s[5]?pivotLevelsOf(t,s[6],s[7],s[8],s[9],s[1]):PIVOT_NONE;});},
    });
    // ---- visual outputs ----
    const visuals={hlines:[],fills:[],backgrounds:[],shapes:[]};
    const colorOf=(value,label)=>{if(hexColor(value))return value;if(typeof value==='string'&&value.length===9&&hexColor(apply(stringSlice,value,[0,7]))){const a=apply(charCodeAt,value,[7]),b=apply(charCodeAt,value,[8]),hex=c=>(c>=48&&c<=57)||(c>=65&&c<=70)||(c>=97&&c<=102);if(hex(a)&&hex(b))return value;}fail(label+' color must be #RRGGBB or #RRGGBBAA.');};
    const optionsOf=(raw,allowed,label)=>{if(raw===undefined)return createObject(null);record(raw,label+' options');onlyKeys(raw,allowed,label+' options');const out=createObject(null);for(let i=0;i<allowed.length;i++){const value=field(raw,allowed[i],label+' options');if(value!==undefined)defineProperty(out,allowed[i],{value,enumerable:true});}return out;};
    const pick=(value,fallback)=>value===undefined?fallback:value;
    const oneOf=(value,allowed,label)=>{if(!contains(allowed,value))fail(label+' must be one of '+allowed.join(', ')+'.');return value;};
    const titleOf=(value,label)=>{if(typeof value!=='string'||value.length<1||value.length>128)fail(label+' needs a title of 1 to 128 characters.');return value;};
    const LINE_STYLES=['solid','dashed','dotted'],SHAPES=['circle','square','diamond','flag','arrowup','arrowdown','triangleup','triangledown','cross','xcross'],LOCATIONS=['abovebar','belowbar','top','bottom'],SIZES=['tiny','small','normal','large','huge'];
    const shapeTitles=[];
    const hline=(title,price,options)=>{
      requireEvent();const name=titleOf(title,'ctx.hline');if(typeof price!=='number'||!isFinite(price))fail('ctx.hline price must be a finite number.');
      const o=optionsOf(options,['color','lineStyle','width'],'ctx.hline'),color=colorOf(pick(o.color,'#787b86'),'ctx.hline'),lineStyle=oneOf(pick(o.lineStyle,'dashed'),LINE_STYLES,'ctx.hline lineStyle'),width=pick(o.width,1);
      if(!isInteger(width)||width<1||width>4)fail('ctx.hline width must be an integer from 1 to 4.');
      for(let i=0;i<visuals.hlines.length;i++){const row=visuals.hlines[i];if(row.title===name){if(row.price!==price||row.color!==color||row.lineStyle!==lineStyle||row.width!==width)fail('ctx.hline "'+name+'" must keep the same price and style on every bar.');return;}}
      if(visuals.hlines.length>=${VISUAL_LIMITS.hlines})fail('A script may draw at most ${VISUAL_LIMITS.hlines} horizontal lines.');emit();append(visuals.hlines,{title:name,price,color,lineStyle,width});
    };
    // The fill colour may change per bar (null leaves the bar unfilled), as Pine fill(color = cond ? a : b).
    // The first call's colour is the fill's base colour; a bar whose colour differs from it is kept as a per-bar row
    // {time, palette index or -1}. between: 'hlines' fills between two ctx.hline titles instead of two plots.
    let fillColorRows=0;
    const paletteIndex=(palette,color,label)=>{if(color===null)return -1;for(let i=0;i<palette.length;i++)if(palette[i]===color)return i;if(palette.length>=${VISUAL_LIMITS.plotPalette})fail(label+' may use at most ${VISUAL_LIMITS.plotPalette} distinct colors.');append(palette,color);return palette.length-1;};
    const fill=(title,from,to,options)=>{
      requireEvent();const name=titleOf(title,'ctx.fill'),a=titleOf(from,'ctx.fill first plot'),b=titleOf(to,'ctx.fill second plot');if(a===b)fail('ctx.fill needs two different titles.');
      const o=optionsOf(options,['color','between'],'ctx.fill'),given=pick(o.color,'#6fa8ff33'),color=given===null?null:colorOf(given,'ctx.fill'),between=oneOf(pick(o.between,'plots'),['plots','hlines'],'ctx.fill between');
      let row=null;for(let i=0;i<visuals.fills.length;i++)if(visuals.fills[i].title===name){row=visuals.fills[i];break;}
      if(row!==null){if(row.from!==a||row.to!==b||row.between!==between)fail('ctx.fill "'+name+'" must keep the same endpoints on every bar.');}
      else{if(visuals.fills.length>=${VISUAL_LIMITS.fills})fail('A script may define at most ${VISUAL_LIMITS.fills} fills.');emit();row={title:name,from:a,to:b,color:color===null?'#6fa8ff33':color,between,palette:[],ct:[],cn:[],ci:[]};append(visuals.fills,row);}
      const t=snapshot.processedEvent.time,n=snapshot.processedCount,last=row.ct.length-1;
      if(last>=0&&(logicalPositions?row.cn[last]===n:row.ct[last]===t)){row.ct.length=last;row.cn.length=last;row.ci.length=last;fillColorRows--;}
      if(color===row.color)return;
      if(fillColorRows>=${VISUAL_LIMITS.fillColors})fail('Per-bar fill color output limit exceeded.');fillColorRows++;
      append(row.ct,t);append(row.cn,n);append(row.ci,paletteIndex(row.palette,color,'ctx.fill "'+name+'"'));
    };
    // Ctx.plot options. Returns {color, opts}; opts is null unless a style field was given. Defaults:
    // style line, linewidth null (the renderer default), offset 0, display all.
    const plotOptions=raw=>{
      const o=optionsOf(raw,['color','style','linewidth','offset','display'],'ctx.plot'),given=pick(o.color,'#6fa8ff'),color=given===null?null:colorOf(given,'ctx.plot');
      if(o.style===undefined&&o.linewidth===undefined&&o.offset===undefined&&o.display===undefined)return{color,opts:null};
      const style=oneOf(pick(o.style,'line'),${JSON.stringify(PLOT_STYLES)},'ctx.plot style'),linewidth=pick(o.linewidth,null),offset=pick(o.offset,0);
      if(linewidth!==null&&(!isInteger(linewidth)||linewidth<1||linewidth>10))fail('ctx.plot linewidth must be an integer from 1 to 10.');
      if(!isInteger(offset)||offset<-${VISUAL_LIMITS.plotOffset}||offset>${VISUAL_LIMITS.plotOffset})fail('ctx.plot offset must be an integer from -${VISUAL_LIMITS.plotOffset} to ${VISUAL_LIMITS.plotOffset} bars.');
      let shown=pick(o.display,'all');const names=[];
      if(typeof shown==='string')append(names,shown);else if(isArray(shown)){if(shown.length<1||shown.length>5)fail('ctx.plot display must be a display name or a list of 1 to 5 names.');for(let i=0;i<shown.length;i++)append(names,field(shown,toString(i),'ctx.plot display'));}else fail('ctx.plot display must be a display name or a list of names.');
      const display={pane:false,priceScale:false,legend:false,dataWindow:false};
      for(let i=0;i<names.length;i++){const d=oneOf(names[i],${JSON.stringify(PLOT_DISPLAYS)},'ctx.plot display');
        if(d==='all'){display.pane=true;display.priceScale=true;display.legend=true;display.dataWindow=true;}else if(d==='pane')display.pane=true;else if(d==='data_window')display.dataWindow=true;else if(d==='status_line')display.legend=true;else if(d==='price_scale')display.priceScale=true;}
      return{color,opts:{style,linewidth,offset,display}};
    };
    const sameOpts=(a,b)=>a.style===b.style&&a.linewidth===b.linewidth&&a.offset===b.offset&&a.display.pane===b.display.pane&&a.display.priceScale===b.display.priceScale&&a.display.legend===b.display.legend&&a.display.dataWindow===b.display.dataWindow;
    const bgcolor=color=>{
      requireEvent();if(color===null)return;const value=colorOf(color,'ctx.bgcolor'),t=snapshot.processedEvent.time,rows=visuals.backgrounds,last=rows[rows.length-1];
      if(last&&(logicalPositions?last.n===snapshot.processedCount:last.t===t)){last.color=value;return;}
      if(rows.length>=${VISUAL_LIMITS.backgrounds})fail('Background color output limit exceeded.');emit();append(rows,logicalPositions?{t,color:value,n:snapshot.processedCount}:{t,color:value});
    };
    const marker=(label,title,condition,options,text,shapeDefault)=>{
      requireEvent();const name=titleOf(title,label);if(typeof condition!=='boolean')fail(label+' condition must be true or false.');
      const o=optionsOf(options,label==='ctx.plotshape'?['shape','location','color','text','size']:['location','color','size'],label);
      const shape=shapeDefault===null?oneOf(pick(o.shape,'xcross'),SHAPES,label+' shape'):shapeDefault,location=oneOf(pick(o.location,'abovebar'),LOCATIONS,label+' location'),color=colorOf(pick(o.color,'#6fa8ff'),label),size=oneOf(pick(o.size,'small'),SIZES,label+' size');
      const words=text===null?pick(o.text,''):text;if(typeof words!=='string'||words.length>40)fail(label+' text must be at most 40 characters.');
      if(!contains(shapeTitles,name)){if(shapeTitles.length>=${VISUAL_LIMITS.shapeTitles})fail('A script may define at most ${VISUAL_LIMITS.shapeTitles} shape or character series.');append(shapeTitles,name);}
      if(!condition)return;if(visuals.shapes.length>=${VISUAL_LIMITS.shapes})fail('Shape output limit exceeded.');emit();
      append(visuals.shapes,logicalPositions?{title:name,t:snapshot.processedEvent.time,n:snapshot.processedCount,shape,location,color,text:words,size}:{title:name,t:snapshot.processedEvent.time,shape,location,color,text:words,size});
    };
    const plotshape=(title,condition,options)=>marker('ctx.plotshape',title,condition,options,null,null);
    const plotchar=(title,condition,character,options)=>{if(typeof character!=='string'||character.length<1||character.length>4)fail('ctx.plotchar needs a character string of 1 to 4 characters.');marker('ctx.plotchar',title,condition,options,character,'none');};
    const finishVisuals=()=>{
      if(!visuals.fills.length)return;const titles=createObject(null),lineTitles=createObject(null);
      // Snapshot.plots entries are point titles; an older snapshot holds {name, ...} rows.
      for(let i=0;i<snapshot.plots.length;i++){const row=snapshot.plots[i],name=typeof row==='string'?row:row!==null&&typeof row==='object'?row.name:undefined;if(typeof name==='string'&&!getDescriptor(titles,name))defineProperty(titles,name,{value:true,configurable:true});}
      for(let i=0;i<visuals.hlines.length;i++)defineProperty(lineTitles,visuals.hlines[i].title,{value:true,configurable:true});
      for(let i=0;i<visuals.fills.length;i++){const row=visuals.fills[i];
        if(row.between==='hlines'){if(!getDescriptor(lineTitles,row.from)||!getDescriptor(lineTitles,row.to))fail('ctx.fill "'+row.title+'" refers to a horizontal line that was never drawn. Use the titles given to ctx.hline.');}
        else if(!getDescriptor(titles,row.from)||!getDescriptor(titles,row.to))fail('ctx.fill "'+row.title+'" refers to a plot that was never plotted. Use the titles given to ctx.plot.');}
      // The host row is {title, from, to, color} plus between (hline fills) and colors (per-bar rows).
      const rows=[];for(let i=0;i<visuals.fills.length;i++){const row=visuals.fills[i],out={title:row.title,from:row.from,to:row.to,color:row.color};
        if(row.between==='hlines')out.between='hlines';
        if(row.ct.length){out.colors=logicalPositions?{palette:row.palette,times:row.ct,indices:row.cn,values:row.ci}:{palette:row.palette,times:row.ct,values:row.ci};}
        append(rows,out);}
      visuals.fills=rows;
    };
    // Plotarrow draws an up arrow below the bar for a positive value and a down arrow above it for a
    // negative one (nothing for zero or null), through the same shape output as plotshape.
    const plotarrow=(title,value,options)=>{
      requireEvent();const label='ctx.plotarrow',name=titleOf(title,label);if(!(value===null||typeof value==='number'&&isFinite(value)))fail(label+' value must be a finite number or null.');
      const o=optionsOf(options,['colorup','colordown','size'],label),up=colorOf(pick(o.colorup,'#3fb68b'),label+' colorup'),down=colorOf(pick(o.colordown,'#e5566b'),label+' colordown'),size=oneOf(pick(o.size,'small'),SIZES,label+' size');
      if(!contains(shapeTitles,name)){if(shapeTitles.length>=${VISUAL_LIMITS.shapeTitles})fail('A script may define at most ${VISUAL_LIMITS.shapeTitles} shape or character series.');append(shapeTitles,name);}
      if(value===null||value===0)return;if(visuals.shapes.length>=${VISUAL_LIMITS.shapes})fail('Shape output limit exceeded.');emit();
      const shape=value>0?'arrowup':'arrowdown',location=value>0?'belowbar':'abovebar',color=value>0?up:down;
      append(visuals.shapes,logicalPositions?{title:name,t:snapshot.processedEvent.time,n:snapshot.processedCount,shape,location,color,text:'',size}:{title:name,t:snapshot.processedEvent.time,shape,location,color,text:'',size});
    };
    // ---- calendar fields and sessions without Date (pure integer arithmetic) ----
    // Zones: UTC/GMT, fixed offsets (UTC+5, GMT-03:30, +0530), and named zones with their daylight rules:
    // America/New_York, America/Chicago, America/Denver, America/Los_Angeles (US rules: 2007+, 1987-2006, earlier
    // years the 1967 rule), Europe/London, Europe/Berlin, Europe/Paris, Europe/Zurich (EU rule, every year),
    // Australia/Sydney (2008+ rule; earlier years the last-Sunday rule, without the 2000 and 2006 one-off dates), and Asia/Tokyo, Asia/Hong_Kong, Asia/Shanghai, Asia/Singapore,
    // Asia/Kolkata (no daylight time).
    const daysFromCivil=(y,m,d)=>{y-=m<=2?1:0;const era=mathFloor(y/400),yoe=y-era*400,doy=mathFloor((153*(m+(m>2?-3:9))+2)/5)+d-1,doe=yoe*365+mathFloor(yoe/4)-mathFloor(yoe/100)+doy;return era*146097+doe-719468;};
    const civilFromDays=days=>{const z=days+719468,era=mathFloor(z/146097),doe=z-era*146097,yoe=mathFloor((doe-mathFloor(doe/1460)+mathFloor(doe/36524)-mathFloor(doe/146096))/365),doy=doe-(365*yoe+mathFloor(yoe/4)-mathFloor(yoe/100)),mp=mathFloor((5*doy+2)/153),d=doy-mathFloor((153*mp+2)/5)+1,m=mp<10?mp+3:mp-9;return{y:yoe+era*400+(m<=2?1:0),m,d,doy};};
    const weekday=days=>((days+4)%7+7)%7;// 0 = Sunday
    const nthSunday=(y,m,n)=>{const first=daysFromCivil(y,m,1);return first+(7-weekday(first))%7+7*(n-1);};
    const lastSunday=(y,m)=>{const last=daysFromCivil(m===12?y+1:y,m===12?1:m+1,1)-1;return last-weekday(last);};
    const ZONES={'America/New_York':[-300,1],'America/Chicago':[-360,1],'America/Denver':[-420,1],'America/Los_Angeles':[-480,1],'Europe/London':[0,2],'Europe/Berlin':[60,2],'Europe/Paris':[60,2],'Europe/Zurich':[60,2],'Australia/Sydney':[600,3],'Asia/Tokyo':[540,0],'Asia/Hong_Kong':[480,0],'Asia/Shanghai':[480,0],'Asia/Singapore':[480,0],'Asia/Kolkata':[330,0]};
    const fixedOffset=tz=>{const n=tz.length,code=i=>apply(charCodeAt,tz,[i]);let at=0;if(n>=3){const p=apply(stringSlice,tz,[0,3]);if(p==='UTC'||p==='GMT')at=3;}if(at===n)return 0;const sign=code(at);if(sign!==43&&sign!==45)return null;at++;const digits=[];let colon=-1;
      for(let i=at;i<n;i++){const c=code(i);if(c===58){if(colon>=0||digits.length===0)return null;colon=digits.length;continue;}if(c<48||c>57)return null;append(digits,c-48);}
      let h,mi=0;if(colon>=0){if(colon>2||digits.length-colon!==2)return null;h=colon===1?digits[0]:digits[0]*10+digits[1];mi=digits[colon]*10+digits[colon+1];}
      else if(digits.length===1||digits.length===2)h=digits.length===1?digits[0]:digits[0]*10+digits[1];else if(digits.length===4){h=digits[0]*10+digits[1];mi=digits[2]*10+digits[3];}else return null;
      if(h>14||mi>=60||h*60+mi>840)return null;return(sign===45?-1:1)*(h*60+mi);};
    const zoneOf=(tz,label)=>{if(tz===undefined)return'UTC';if(typeof tz!=='string'||tz.length<1||tz.length>40)fail(label+' time zone must be a zone name such as UTC, UTC+5 or America/New_York.');const known=getDescriptor(ZONES,tz);if(!known&&fixedOffset(tz)===null)fail(label+' time zone "'+tz+'" is not supported. Use UTC, a fixed offset such as UTC-5 or UTC+05:30, or one of '+keys(ZONES).join(', ')+'.');return tz;};
    const offsetMinutes=(tz,t)=>{const zone=getDescriptor(ZONES,tz);if(!zone)return fixedOffset(tz);const std=zone.value[0],rule=zone.value[1];if(rule===0)return std;
      const y=civilFromDays(mathFloor((t+std*60)/86400)).y;let start,end;
      if(rule===1){let s,e;if(y>=2007){s=nthSunday(y,3,2);e=nthSunday(y,11,1);}else if(y>=1987){s=nthSunday(y,4,1);e=lastSunday(y,10);}else{s=lastSunday(y,4);e=lastSunday(y,10);}start=s*86400+7200-std*60;end=e*86400+7200-(std+60)*60;}
      else if(rule===2){start=lastSunday(y,3)*86400+3600;end=lastSunday(y,10)*86400+3600;}
      else{// southern hemisphere: daylight from the first Sunday of October to the first Sunday of April (before 2008: last Sundays of October and March)
        const endDst=(y>=2008?nthSunday(y,4,1):lastSunday(y,3))*86400+10800-(std+60)*60,startDst=(y>=2008?nthSunday(y,10,1):lastSunday(y,10))*86400+7200-std*60;return t<endDst||t>=startDst?std+60:std;}
      return t>=start&&t<end?std+60:std;};
    const timeArg=(t,label)=>{if(t===undefined){requireEvent();return currentBar().time;}if(typeof t!=='number'||!isFinite(t)||t<-62135596800||t>253402300799)fail(label+' time must be Unix seconds from year 1 through 9999.');return mathFloor(t);};
    const localParts=(t,tz)=>{const local=t+offsetMinutes(tz,t)*60,days=mathFloor(local/86400),secs=local-days*86400,c=civilFromDays(days);return{y:c.y,m:c.m,d:c.d,doy:c.doy,days,secs};};
    const calendar=(t,tz)=>{const label='ctx.calendar',time=timeArg(t,label),zone=zoneOf(tz,label),p=localParts(time,zone),start=daysFromCivil(p.y,1,1);
      return freeze({year:p.y,month:p.m,dayofmonth:p.d,dayofweek:weekday(p.days)+1,dayofyear:p.days-start+1,hour:mathFloor(p.secs/3600),minute:mathFloor(p.secs/60)%60,second:p.secs%60,offset:offsetMinutes(zone,time)});};
    // Session grammar of the session input: 24x7, or up to eight HHMM-HHMM ranges joined by commas with an optional
    // colon and day digits (1 = Sunday .. 7 = Saturday; all days when omitted). An overnight range belongs to the day it
    // starts on; equal start and end means the whole day.
    const sessionCache=createObject(null);
    const sessionOf=text=>{const known=sessionCache[text];if(known!==undefined)return known;const bad=()=>fail('ctx.insession session must be 24x7 or HHMM-HHMM ranges joined by commas, optionally followed by a colon and day digits 1 (Sunday) to 7, such as 0930-1600:23456.');
      if(typeof text!=='string'||text.length<1||text.length>200)bad();let out;
      if(text==='24x7')out={all:true,ranges:[],mask:127};else{const code=i=>apply(charCodeAt,text,[i]);let at=0;const ranges=[];let mask=0;
        const clock=()=>{if(at+4>text.length)bad();let n=0;for(let i=0;i<4;i++){const c=code(at++);if(c<48||c>57)bad();n=n*10+c-48;}if(n%100>=60)bad();return mathFloor(n/100)*60+n%100;};
        for(;;){if(ranges.length>=8)bad();const s=clock();if(s>=1440||code(at++)!==45)bad();const e=clock();if(e>1440)bad();append(ranges,[s,e]);if(at===text.length)break;const c=code(at++);if(c===44){if(at===text.length)bad();continue;}if(c!==58)bad();
          while(at<text.length){const d=code(at++)-49;if(d<0||d>6||mask&(1<<d))bad();mask|=1<<d;}if(!mask)bad();break;}
        out={all:false,ranges,mask:mask||127};}
      defineProperty(sessionCache,text,{value:out,writable:false,configurable:false});return out;};
    const insession=(session,tz,t)=>{const label='ctx.insession',s=sessionOf(session),zone=zoneOf(tz,label),time=timeArg(t,label);if(s.all)return true;const p=localParts(time,zone),minute=mathFloor(p.secs/60),today=weekday(p.days),yesterday=(today+6)%7;
      for(let i=0;i<s.ranges.length;i++){const a=s.ranges[i][0],b=s.ranges[i][1];
        if(a<b){if(minute>=a&&minute<b&&s.mask&(1<<today))return true;}
        else if(a===b){if(s.mask&(1<<today))return true;}
        else{if(minute>=a&&s.mask&(1<<today))return true;if(minute<b&&s.mask&(1<<yesterday))return true;}}
      return false;};
    const nz=(value,replacement=0)=>value===null||value===undefined||typeof value==='number'&&value!==value?replacement:value;
    const lv={ta,history,series,hline,fill,bgcolor,plotshape,plotchar,plotarrow,calendar,insession,nz,plotOptions,sameOpts,paletteIndex};
`;
module.exports = { PRELUDE, RUNNER, HISTORY_DEPTH, VISUAL_LIMITS, PLOT_STYLES };
