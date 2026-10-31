"""Independent Python Fraction oracle for the bounded two-binary64-price percent API."""
import json,math,struct
from fractions import Fraction
from pathlib import Path

def bits(x):return struct.pack('>d',x).hex()
def value(x):return struct.unpack('>d',bytes.fromhex(x))[0]
maximum=float.fromhex('0x1.fffffffffffffp+1023');minimum=float.fromhex('0x0.0000000000001p-1022')
pairs=[]
def add(label,a,b):pairs.append((label,a,b))
for exponent in [-1074,-1022,-1000,-53,-1,0,1,52,500,1023]:
 a=math.ldexp(1.,exponent)
 for label,b in [('same',a),('nextUp',math.nextafter(a,math.inf)),('nextDown',math.nextafter(a,0.)),('negative',-a),('zero',0.),('negativeZero',-0.)]:add(f'power{exponent}:{label}',a,b)
for label,a,b in [('overflowDeltaFinitePercent',math.ldexp(1.,1023),-math.ldexp(1.,1023)),('maxToMin',maximum,minimum),('maxToNegativeMin',maximum,-minimum),('minToMaxFinalOverflow',minimum,maximum),('maxToNegativeMax',maximum,-maximum),('maxAdjacentDown',maximum,math.nextafter(maximum,0.)),('oneToMaxFiniteRatio',1.,maximum),('hundredToMaxFiniteRatio',100.,maximum)]:add(label,a,b)
# Fixed endpoints exercise quotients with odd denominators, cancellation and rounding.
for a,b in [(3.,10.),(7.,1.),(11.,13.),(math.nextafter(1.,math.inf),math.nextafter(2.,0.)),(math.nextafter(1.,0.),2.),(maximum/4,maximum/2),(float.fromhex('0x1.23456789abcdep+500'),float.fromhex('0x1.fffffffffffffp+499'))]:add('nontrivialRatio:'+bits(a)+':'+bits(b),a,b)
state=0x764ac192d14e9b35
for i in range(32):
 def next_bits():
  global state
  state^=(state<<13)&((1<<64)-1);state^=state>>7;state^=(state<<17)&((1<<64)-1);return state&((1<<64)-1)
 ab=next_bits()&((1<<63)-1);bb=next_bits()
 ab=(ab&((1<<52)-1))|(((ab>>52)%2047)<<52)
 bb=(bb&((1<<52)-1))|((((bb>>52)&2047)%2047)<<52)|(bb&(1<<63))
 a=value(f'{ab:016x}');b=value(f'{bb:016x}')
 if a==0:a=minimum
 add(f'deterministic{i}',a,b)
cases=[]
for label,a,b in pairs:
 exact=100*(Fraction.from_float(b)-Fraction.from_float(a))/Fraction.from_float(a)
 try:
  rounded=float(exact)
  expected=bits(0. if exact==0 else rounded) if math.isfinite(rounded) and (exact==0 or rounded!=0) else None
 except OverflowError:expected=None
 cases.append({'label':label,'firstBits':bits(a),'secondBits':bits(b),'expectedPercentBits':expected,'expectedStatus':'available' if expected is not None else 'unavailable'})
output={'oracle':'Python Fraction.from_float, exact100*(second-first)/first, Python binary64 rounding; zero cancellation canonicalized+0','cases':cases}
Path(__file__).with_suffix('.json').write_text(json.dumps(output,indent=2)+'\n')
print(len(cases))
