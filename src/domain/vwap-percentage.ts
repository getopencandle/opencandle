/** Binary64 decomposition keeps percentage arithmetic bounded without overflowing an intermediate product. */
function positiveParts(value:number):{mantissa:number;exponent:number}{
 const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,value,false);
 const high=view.getUint32(0,false),low=view.getUint32(4,false),encoded=(high>>>20)&2047;
 const fraction=(high&0xfffff)*4294967296+low;
 if(encoded)return {mantissa:1+fraction/4503599627370496,exponent:encoded-1023};
 const bit=Math.floor(Math.log2(fraction));return {mantissa:fraction/2**bit,exponent:bit-1074};
}

export function vwapPercentageDistance(base:number,multiplier:number):number{
 if(!Number.isFinite(base)||!Number.isFinite(multiplier)||multiplier<0||multiplier>100000)throw new Error('VWAP percentage requires a finite base and multiplier from 0 through 100000.');
 if(base===0||multiplier===0)return 0;
 const a=positiveParts(Math.abs(base)),b=positiveParts(multiplier);let mantissa=a.mantissa*b.mantissa/100,exponent=a.exponent+b.exponent;
 // The quotient is in [0.01,0.04), so at most seven doublings normalize it.
 for(let step=0;mantissa<1&&step<7;step++){mantissa*=2;exponent--;}
 const distance=exponent>1023?Infinity:exponent>=-1022?mantissa*2**exponent:exponent>=-1075?(mantissa*2**(exponent+1074))*Number.MIN_VALUE:0;
 if(!Number.isFinite(distance))throw new Error('VWAP percentage distance overflowed and is not representable.');
 if(distance===0)throw new Error('VWAP percentage distance is below binary64 precision (underflow).');
 return distance;
}

export function vwapPercentageBounds(base:number,multiplier:number):{upper:number;lower:number}{
 const distance=vwapPercentageDistance(base,multiplier),upper=base+distance,lower=base-distance;
 if(!Number.isFinite(upper)||!Number.isFinite(lower))throw new Error('VWAP percentage boundary overflowed and is not representable.');
 return {upper,lower};
}
