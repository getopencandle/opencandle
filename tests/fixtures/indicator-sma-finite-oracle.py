"""Synthetic independent SMA expectations from Python Fraction and IEEE binary64.

No production source, compensated-sum algorithm or dyadic accumulator is used.
Only forced-fallback cases and mathematically exact fast-path controls are given
once-rounded rational expectations. Regenerate from the repository root.
"""
from fractions import Fraction
from pathlib import Path
import hashlib
import json
import math
import random
import struct
import sys

HERE = Path(__file__).resolve().parent
MAX = sys.float_info.max
MIN = math.ulp(0.0)
NORMAL_MIN = sys.float_info.min
A = math.ldexp(1.0, 900)
B = math.ldexp(1.0, 100)
cases = []


def bits(value):
    return struct.pack('>d', value).hex()


def expected(values, period):
    result = []
    for end in range(len(values)):
        window = values[max(0, end + 1 - period):end + 1]
        if len(window) != period or any(v is None or not math.isfinite(v) for v in window):
            result.append(None)
            continue
        total = sum((Fraction.from_float(v) for v in window), Fraction())
        rational = total / period
        value = float(rational)
        assert math.isfinite(value)
        # A finite mean is in its convex hull. Conversion may round to an
        # endpoint; exact cancellation is +0, nonzero negative underflow -0.
        assert min(window) <= value <= max(window)
        result.append(bits(value))
    return result


def add(name, values, period, reason, trigger=None):
    values = [None if value is None else float(value) for value in values]
    item = dict(id='SYNTHETIC-' + name, period=period,
                inputBits=[None if value is None else bits(value) for value in values],
                expectedBits=expected(values, period), exactExpectationBasis=reason)
    if trigger is not None:
        item['declaredFallbackTrigger'] = trigger
    cases.append(item)


def overflow(name, tail, period=2, sign=1):
    add(name, [sign * MAX] * period + tail, period,
        'Same-sign finite MAX addition overflows before division; exact mode persists for the call. Every earlier non-null result is an exact finite identity.',
        dict(index=1, kind='incoming-addition-overflow'))


add('period-one-identities', [MAX, -MAX, A, -A, 1, -1, MIN, -MIN, -0.0, 0.0, None, math.nan, math.inf, -math.inf], 1,
    'Period1 finite identity; exact arithmetic-zero convention is +0. Genuine nonfinite/missing observations remain gaps.')
add('exact-fast-integer-control', [0, 2, 4, 6, None, 8, 10, 12], 2,
    'Representable small integer sums and division by2 are exact; no general rational rounding claim for the floating fast path.')
add('period-exceeds-prefix', [MAX, -MAX, MIN], 5, 'All outputs require a full finite window and therefore remain null.')

for period in [2, 3, 5]:
    for sign in [1, -1]:
        overflow(f'overflow-recovery-p{period}-sign{sign}',
                 [sign * MAX, -sign * MAX, -sign * MAX, 1, -1, MIN, -MIN, 0, 0, 0, 0, 0, 0], period, sign)

for sign in [1, -1]:
    add(f'gapped-overflow-initialization-sign{sign}', [sign * MAX, None, sign * MAX, 0, 1, 2, 3, None, 4, 5, 6], 3,
        'The second finite MAX addition overflows while the current window still has a missing member; initialization must retain both exact finite sum and valid-member count.',
        dict(index=2, kind='incoming-overflow-with-incomplete-window'))
    add(f'outgoing-overflow-sign{sign}', [sign * MAX, -sign * MAX, -sign * MAX, 1, 1, MIN, 0], 2,
        'Incoming update at index2 is finite, but subtracting the outgoing opposite-sign MAX overflows; initialize the exact CURRENT window once, without double applying the update.',
        dict(index=2, kind='outgoing-subtraction-overflow'))
    add(f'third-component-p3-sign{sign}', [sign * A, sign * B, sign, 0, 0, 0, MIN, 0, MIN], 3,
        '2**900 + 2**100 + 1 needs three separated binary64 components; losing the third component triggers exact fallback before the first full window.',
        dict(index=2, kind='third-nonzero-component'))
    add(f'third-component-cancellation-p5-sign{sign}', [sign * A, sign * B, sign, -sign * A, -sign * B, 0, 0, 0, 0, 0], 5,
        'Three separated components force fallback at index2; exact cancellation of both large components leaves a visible signed1/5 residual.',
        dict(index=2, kind='third-nonzero-component'))
    add(f'third-max-min-p3-sign{sign}', [sign * MAX, sign, sign * MIN, 0, sign * MIN, 0, 0], 3,
        'MAX + 1 + MIN needs three components without finite overflow; the later [MIN,0,MIN] window distinguishes retained tiny residuals.',
        dict(index=2, kind='third-nonzero-component'))

overflow('positive-subnormal-ties', [0, MIN, 2 * MIN, 3 * MIN, 0, MIN, 0, 0])
overflow('negative-subnormal-ties', [0, -MIN, -2 * MIN, -3 * MIN, 0, -MIN, MIN, 0], sign=-1)
overflow('positive-normal-ties', [2**53, 1, 2**53 + 2, 1, 0, 0])
overflow('negative-normal-ties', [-2**53, -1, -(2**53 + 2), -1, 0, 0], sign=-1)
overflow('normal-exponent-carry', [math.nextafter(2.0, -math.inf), 2.0, 0, 0])
overflow('subnormal-normal-boundary', [math.nextafter(NORMAL_MIN, -math.inf), NORMAL_MIN, -NORMAL_MIN, -math.nextafter(NORMAL_MIN, -math.inf), 0])
overflow('gap-finite-warmup', [None, MAX, None, 1, 2, 3, 4, math.nan, 5, 6, 7, math.inf, -math.inf, 8, 9, 10], period=3)

for period, seed in [(2, 817), (3, 2029), (5, 65537)]:
    rng = random.Random(seed)
    tail = []
    while len(tail) < 32:
        raw = rng.getrandbits(64)
        if (raw >> 52) & 2047 == 2047:
            continue
        tail.append(struct.unpack('>d', raw.to_bytes(8, 'big'))[0])
    overflow(f'fixed-seed-wide-exponent-p{period}', tail, period)

document = dict(schemaVersion=1, synthetic=True,
                generator='tests/fixtures/indicator-sma-finite-oracle.py',
                generatorSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                oracle='Fraction.from_float for each binary64 input; independent full finite-window rational mean; Python float conversion nearest/ties-even; struct.pack big-endian output bits.',
                zeroPolicy='Exact cancellation is +0; a negative nonzero rational rounded below the subnormal halfway threshold remains -0.',
                scope='Forced persistent fallback, period1 identity, full-window absence and exact representable ordinary controls only. No once-rounded-rational requirement for other floating fast-path inputs.',
                cases=cases)
output = HERE / 'indicator-sma-finite-oracle.json'
output.write_text(json.dumps(document, indent=2, allow_nan=False) + '\n', encoding='utf-8')
print(f'{len(cases)} synthetic independent cases written to {output}')
