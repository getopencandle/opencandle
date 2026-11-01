"""Reference fixture generator for the indicator guardrails (tests/reference/).

Run (isolated mode; user site-packages are appended explicitly so TA-Lib resolves):
    %LOCALAPPDATA%\\Programs\\Python\\Python312\\python.exe -I scripts/reference/generate_reference.py

Writes:
    tests/fixtures/reference/bars.json      deterministic OHLCV series (seeded; no market data)
    tests/fixtures/reference/expected.json  expected indicator outputs per case
    tests/fixtures/reference/coverage.json  per-case source, citation and noted disagreements (maintained by hand, checked by tests/reference/coverage.test.ts)

Reference order (0.8.1): (1) the original author's published definition, (2) TA-Lib /
StockCharts ChartSchool / the author's book, (3) other charting platforms only as a comparison point. Where sources
disagree, the expected values follow the convention OpenCandle documents in its catalog provenance and
policies; the disagreement is recorded in `notes` (it is NOT a failure).

Every hand-written formula below that TA-Lib also implements is cross-checked against TA-Lib
(`crosscheck`) on the bars where both are defined and the seed effect has decayed; the generator aborts
on a mismatch, so the hand references are themselves verified.
"""
import json, math, os, site, sys
sys.path.append(site.getusersitepackages())
import numpy as np
import talib

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'tests', 'fixtures', 'reference')
NAN = float('nan')
N = 300

# ---------------------------------------------------------------------------------------------- bars
def make_daily(seed, edge):
    rng = np.random.default_rng(seed)
    t0 = 1672617600  # 2023-01-02 00:00 UTC, a Monday
    times, day = [], 0
    while len(times) < N:
        t = t0 + day * 86400
        if ((day % 7) < 5):  # weekdays only: weekend time gaps
            times.append(t)
        day += 1
    drift = np.concatenate([np.full(60, 0.004), np.full(50, -0.005), np.full(60, 0.0), np.full(70, 0.003), np.full(60, -0.002)])
    close, bars = 100.0, []
    for i in range(N):
        prev = close
        o = prev
        if i in (40, 151, 222):  # price gaps
            o = prev * (1.04 if i != 151 else 0.95)
        close = max(1.0, o * (1 + drift[i] + rng.normal(0, 0.015)))
        hi = max(o, close) * (1 + abs(rng.normal(0, 0.006)))
        lo = min(o, close) * (1 - abs(rng.normal(0, 0.006)))
        vol = float(int(rng.lognormal(13, 0.4)))
        bars.append([times[i], round(o, 2), round(hi, 2), round(lo, 2), round(close, 2), vol])
    for b in bars:  # keep OHLC consistent after rounding
        b[2] = max(b[1], b[2], b[3], b[4]); b[3] = min(b[1], b[2], b[3], b[4])
    if edge:
        flat = bars[119][4]
        for i in range(120, 140):  # flat stretch, zero volume
            bars[i][1:6] = [flat, flat, flat, flat, 0.0]
        for i in (50, 51, 200):  # zero-volume bars
            bars[i][5] = 0.0
        for i in (210, 211, 212):  # unchanged closes
            bars[i][4] = bars[209][4]; bars[i][2] = max(bars[i][1:5]); bars[i][3] = min(bars[i][1:5])
    return [dict(time=b[0], open=b[1], high=b[2], low=b[3], close=b[4], volume=b[5]) for b in bars]


def make_intraday_us(seed):
    """30-minute US equity bars, extended hours 04:00-20:00 New York, 2024-10-28 .. 2024-11-08 (DST ends 2024-11-03)."""
    from zoneinfo import ZoneInfo
    from datetime import datetime, timedelta
    ny = ZoneInfo('America/New_York')
    rng = np.random.default_rng(seed)
    out, close = [], 50.0
    d = datetime(2024, 10, 28)
    while d <= datetime(2024, 11, 8):
        if d.weekday() < 5:
            for k in range(32):  # 04:00 .. 19:30 opens
                local = datetime(d.year, d.month, d.day, 4, 0, tzinfo=ny) + timedelta(minutes=30 * k)
                t = int(local.timestamp())
                o = close; close = max(1, o * (1 + rng.normal(0, 0.004)))
                hi = max(o, close) * (1 + abs(rng.normal(0, 0.002))); lo = min(o, close) * (1 - abs(rng.normal(0, 0.002)))
                regular = 9 * 60 + 30 <= local.hour * 60 + local.minute < 16 * 60
                vol = float(int(rng.lognormal(11 if regular else 8, 0.5)))
                o, hi, lo, c = round(o, 2), round(hi, 2), round(lo, 2), round(close, 2)
                out.append(dict(time=t, open=o, high=max(o, hi, lo, c), low=min(o, hi, lo, c), close=c, volume=vol))
        d += timedelta(days=1)
    return out


def make_crypto_hourly(seed):
    """1-hour 24/7 bars from 2024-03-08 00:00 UTC for 8 days."""
    rng = np.random.default_rng(seed)
    t0, out, close = 1709856000, [], 60000.0
    for k in range(24 * 8):
        o = close; close = o * (1 + rng.normal(0, 0.003))
        hi = max(o, close) * (1 + abs(rng.normal(0, 0.0015))); lo = min(o, close) * (1 - abs(rng.normal(0, 0.0015)))
        o, hi, lo, c = round(o, 2), round(hi, 2), round(lo, 2), round(close, 2)
        out.append(dict(time=t0 + 3600 * k, open=o, high=max(o, hi, lo, c), low=min(o, hi, lo, c), close=c, volume=round(float(rng.lognormal(3, 0.6)), 4)))
    return out

# ----------------------------------------------------------------------------------- primitives
def arr(x): return np.array(x, dtype=float)
def fin(v): return v == v and v not in (math.inf, -math.inf)

def sma(x, n):
    x = arr(x); out = np.full(len(x), NAN)
    for i in range(n - 1, len(x)):
        w = x[i - n + 1:i + 1]
        if np.all(np.isfinite(w)): out[i] = w.sum() / n
    return out

def wsum(x, n):
    x = arr(x); out = np.full(len(x), NAN)
    for i in range(n - 1, len(x)):
        w = x[i - n + 1:i + 1]
        if np.all(np.isfinite(w)): out[i] = w.sum()
    return out

def ema(x, n, seed='first', alpha=None):
    """seed='sma' (used for every reference): SMA of the first n finite values, the consensus seed (TA-Lib TA_EMA,
    StockCharts ChartSchool "Moving Averages"). seed='first': first finite value starts the average (OpenCandle 0.8.0)."""
    x = arr(x); a = 2.0 / (n + 1) if alpha is None else alpha; out = np.full(len(x), NAN)
    prev, buf = None, []
    for i, v in enumerate(x):
        if not fin(v):
            continue
        if prev is None:
            if seed == 'first':
                prev = v; out[i] = prev; continue
            buf.append(v)
            if len(buf) == n: prev = sum(buf) / n; out[i] = prev
            continue
        prev = a * v + (1 - a) * prev; out[i] = prev
    return out

def rma(x, n): return ema(x, n, 'sma', 1.0 / n)

def wma(x, n):
    x = arr(x); out = np.full(len(x), NAN); den = n * (n + 1) / 2
    for i in range(n - 1, len(x)):
        w = x[i - n + 1:i + 1]
        if np.all(np.isfinite(w)): out[i] = float(np.dot(w, np.arange(1, n + 1))) / den
    return out

def stdev(x, n, ddof=0):
    x = arr(x); out = np.full(len(x), NAN)
    for i in range(n - 1, len(x)):
        w = x[i - n + 1:i + 1]
        if np.all(np.isfinite(w)): out[i] = float(np.std(w, ddof=ddof))
    return out

def highest(x, n):
    x = arr(x); out = np.full(len(x), NAN)
    for i in range(n - 1, len(x)): out[i] = x[i - n + 1:i + 1].max()
    return out

def lowest(x, n):
    x = arr(x); out = np.full(len(x), NAN)
    for i in range(n - 1, len(x)): out[i] = x[i - n + 1:i + 1].min()
    return out

def change(x, k=1):
    x = arr(x); out = np.full(len(x), NAN); out[k:] = x[k:] - x[:-k]; return out

def shift(x, k):
    """value at i = x[i-k] (k>0 forward shift), NaN outside."""
    x = arr(x); out = np.full(len(x), NAN)
    if k >= 0: out[k:] = x[:len(x) - k]
    else: out[:k] = x[-k:]
    return out

def roc(x, n):
    x = arr(x); out = np.full(len(x), NAN)
    for i in range(n, len(x)):
        if x[i - n] != 0: out[i] = 100 * (x[i] - x[i - n]) / x[i - n]
    return out

def tr(b, first_hl=True):
    h, l, c = b['h'], b['l'], b['c']; out = np.full(len(h), NAN)
    if first_hl: out[0] = h[0] - l[0]
    for i in range(1, len(h)): out[i] = max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1]))
    return out

def linreg(x, n, offset=0):
    x = arr(x); out = np.full(len(x), NAN); xs = np.arange(n)
    for i in range(n - 1, len(x)):
        w = x[i - n + 1:i + 1]; slope, icpt = np.polyfit(xs, w, 1); out[i] = icpt + slope * (n - 1 - offset)
    return out

def rsi(x, n):
    ch = change(x); up = np.where(np.isfinite(ch), np.maximum(ch, 0), NAN); dn = np.where(np.isfinite(ch), np.maximum(-ch, 0), NAN)
    u, d = rma(up, n), rma(dn, n); out = np.full(len(u), NAN)
    for i in range(len(u)):
        if fin(u[i]) and fin(d[i]):
            if d[i] == 0 and u[i] == 0: continue
            out[i] = 100.0 if d[i] == 0 else 100 - 100 / (1 + u[i] / d[i])
    return out

def mean_dev(x, n):
    x = arr(x); out = np.full(len(x), NAN)
    for i in range(n - 1, len(x)):
        w = x[i - n + 1:i + 1]; out[i] = np.abs(w - w.mean()).mean()
    return out

def cci_of(src, n):
    m, d = sma(src, n), mean_dev(src, n)
    return np.where((d != 0) & np.isfinite(d), (arr(src) - m) / (0.015 * np.where(d == 0, 1, d)), NAN)

def stoch_raw(c, h, l, n):
    hh, ll = highest(h, n), lowest(l, n); den = hh - ll
    return np.where(np.isfinite(den) & (den != 0), 100 * (arr(c) - ll) / np.where(den == 0, 1, den), NAN)

# ----------------------------------------------------------------------------------- indicators
def build_cases(B):
    o, h, l, c, v = (arr([b[k] for b in B]) for k in ('open', 'high', 'low', 'close', 'volume'))
    b = dict(o=o, h=h, l=l, c=c, v=v)
    hl2, hlc3, ohlc4 = (h + l) / 2, (h + l + c) / 3, (o + h + l + c) / 4
    cases = []
    def case(cid, ind, inputs, plots, src, cite, notes=None, warmup=None, tol=1e-6):
        cases.append(dict(id=cid, indicator=ind, inputs=inputs, plots={k: [None if not fin(x) else float(f'{x:.12g}') for x in vals] for k, vals in plots.items()}, source=src, cite=cite, notes=notes or '', warmup=warmup, tol=tol))

    TAL = 'TA-Lib 0.6 (ta-lib.org), cross-checked'
    SC = 'https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/'
    # base kinds -----------------------------------------------------------------------------------
    case('sma-9', 'sma', {'length': 9}, {'sma': sma(c, 9)}, 'talib', TAL + ' SMA')
    case('ema-9', 'ema', {'length': 9}, {'ema': ema(c, 9, 'sma')}, 'talib', TAL + ' EMA (SMA seed)', 'The EMA built-in documents an SMA seed, as TA-Lib.')
    case('rsi-14', 'rsi', {'length': 14}, {'rsi': rsi(c, 14)}, 'author', 'J. Welles Wilder, New Concepts in Technical Trading Systems (1978); ' + TAL + ' RSI')
    f, s = ema(c, 12, 'sma'), ema(c, 26, 'sma'); m = f - s; sg = ema(m, 9, 'sma')
    case('macd-12-26-9', 'macd', {'fast': 12, 'slow': 26, 'signal': 9}, {'macd': m, 'signal': sg, 'histogram': m - sg}, 'author',
         'Gerald Appel: MACD = EMA12 - EMA26, signal EMA9 of MACD; ' + SC + 'macd-moving-average-convergence-divergence-oscillator',
         'TA-Lib MACD seeds the fast EMA at the slow EMA start (bar 25), so its early fast-EMA values differ; values converge. Each EMA here starts on its own first full window (SMA seed), the convention OpenCandle documents.')
    bm, bs = sma(c, 20), stdev(c, 20)
    case('bb-20-2', 'bb', {'length': 20, 'multiplier': 2}, {'basis': bm, 'upper': bm + 2 * bs, 'lower': bm - 2 * bs}, 'talib', TAL + ' BBANDS (population deviation)')
    case('atr-14', 'atr', {'length': 14}, {'atr': rma(tr(b), 14)}, 'author', 'Wilder (1978) ATR; first true range = high - low',
         'TA-Lib ATR skips the first bar (no prior close) and starts one bar later; values converge. OpenCandle documents first TR = high - low.')
    k = sma(stoch_raw(c, h, l, 14), 3)
    case('stoch-14-3-3', 'stochastic', {'length': 14, 'smoothK': 3, 'smoothD': 3}, {'k': k, 'd': sma(k, 3)}, 'talib', 'George Lane; ' + TAL + ' STOCH (SMA slowing)')
    k1 = stoch_raw(c, h, l, 14)
    case('stoch-14-1-3', 'stochastic', {'length': 14, 'smoothK': 1, 'smoothD': 3}, {'k': k1, 'd': sma(k1, 3)}, 'talib', TAL + ' STOCHF (fast %K, %D SMA 3)')
    ob = np.zeros(len(c))
    for i in range(1, len(c)): ob[i] = ob[i - 1] + (v[i] if c[i] > c[i - 1] else -v[i] if c[i] < c[i - 1] else 0)
    case('obv', 'obv', {}, {'obv': ob}, 'author', 'Joseph Granville (1963); ' + SC + 'on-balance-volume-obv',
         'TA-Lib OBV starts at volume[0]; OpenCandle documents a start at 0. The series differ by that constant only.')
    case('volume-20', 'volume', {'length': 20}, {'volume': v, 'ma': sma(v, 20)}, 'hand', 'Volume and its 20-bar SMA')
    # catalog ----------------------------------------------------------------------------------------
    cc = cci_of(hlc3, 20)
    case('cci-20', 'cci', {'length': 20, 'source': 'hlc3', 'maType': 'None'}, {'cci': cc}, 'talib', 'Donald Lambert (1980); ' + TAL + ' CCI')
    case('cci-20-ma', 'cci', {'length': 20, 'source': 'hlc3', 'maType': 'SMA', 'maLength': 14}, {'cci': cc, 'ma': sma(cc, 14)}, 'hand', 'CCI-based MA = SMA(CCI, 14) (OpenCandle smoothing section)')
    r = rsi(c, 14); kk = sma(stoch_raw(r, r, r, 14), 3)
    case('stochrsi', 'stochrsi', {}, {'k': kk, 'd': sma(kk, 3)}, 'author', 'Chande & Kroll (1994) StochRSI, smoothed %K/%D as documented',
         'TA-Lib STOCHRSI uses an unsmoothed fast %K; OpenCandle documents %K = SMA(100 x ratio, 3).')
    hh, ll = highest(h, 14), lowest(l, 14)
    case('willr-14', 'willr', {'length': 14}, {'r': -100 * (hh - c) / (hh - ll)}, 'talib', 'Larry Williams; ' + TAL + ' WILLR')
    case('mfi-14', 'mfi', {'length': 14}, {'mfi': mfi(h, l, c, v, 14)}, 'talib', 'Quong & Soudack; ' + TAL + ' MFI')
    mult = np.where(h == l, 0, ((c - l) - (h - c)) / np.where(h == l, 1, h - l))
    case('cmf-20', 'cmf', {'length': 20}, {'cmf': wsum(mult * v, 20) / wsum(v, 20)}, 'author', 'Marc Chaikin; ' + SC + 'chaikin-money-flow-cmf')
    case('mom-10', 'mom', {'length': 10}, {'mom': change(c, 10)}, 'talib', TAL + ' MOM')
    case('roc-9', 'roc', {'length': 9}, {'roc': roc(c, 9)}, 'talib', TAL + ' ROC')
    case('ao', 'ao', {}, {'histogram': sma(hl2, 5) - sma(hl2, 34)}, 'author', 'Bill Williams, Trading Chaos: AO = SMA(median, 5) - SMA(median, 34)')
    dn, up = talib.AROON(h, l, 14)  # TA-Lib returns (aroondown, aroonup)
    case('aroon-14', 'aroon', {'length': 14}, {'up': up, 'down': dn}, 'talib', 'Tushar Chande (1995); ' + TAL + ' AROON')
    case('aroonosc-14', 'aroonosc', {'length': 14}, {'oscillator': talib.AROONOSC(h, l, 14)}, 'talib', TAL + ' AROONOSC')
    # DMI (Wilder): RMA (mean seed) from bar 1
    pdm, mdm, trr = np.full(len(c), NAN), np.full(len(c), NAN), np.full(len(c), NAN)
    for i in range(1, len(c)):
        u, d = h[i] - h[i - 1], l[i - 1] - l[i]
        pdm[i] = u if u > d and u > 0 else 0; mdm[i] = d if d > u and d > 0 else 0
        trr[i] = max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1]))
    st, sp, sm = rma(trr, 14), rma(pdm, 14), rma(mdm, 14)
    pdi, mdi = 100 * sp / st, 100 * sm / st; dx = 100 * np.abs(pdi - mdi) / (pdi + mdi); adx = rma(dx, 14)
    dmi_note = 'TA-Lib PLUS_DI/ADX seed the Wilder sum with period-1 readings, so early values differ and converge; OpenCandle documents an RMA seeded with the mean of the first window.'
    case('dmi-14-14', 'dmi', {}, {'adx': adx, 'plusDI': pdi, 'minusDI': mdi}, 'author', 'Wilder (1978) DMI/ADX', dmi_note)
    case('adx-14-14', 'adx', {}, {'adx': adx}, 'author', 'Wilder (1978) ADX', dmi_note)
    case('psar', 'psar', {}, {'sar': psar(h, l, c, 0.02, 0.02, 0.2)}, 'author', 'Wilder (1978) Parabolic SAR, initialization as documented by OpenCandle',
         'TA-Lib SAR initializes direction from the first two bars\' directional movement; OpenCandle documents the first-two-closes rule. Values agree after the first reversal.')
    case('supertrend', 'supertrend', {}, supertrend(h, l, c, 10, 3), 'author', 'Olivier Seban, Supertrend (ATR 10, factor 3), final-band rules as documented')
    kb, ka = ema(c, 20, 'sma'), rma(tr(b), 10)
    case('kc', 'kc', {}, {'upper': kb + 2 * ka, 'basis': kb, 'lower': kb - 2 * ka}, 'author', 'Linda Raschke / ' + SC + 'keltner-channels: EMA(20) +/- 2 x ATR(10)',
         'SMA-seeded EMA (ChartSchool).')
    du, dl = highest(h, 20), lowest(l, 20)
    case('dc', 'dc', {}, {'basis': (du + dl) / 2, 'upper': du, 'lower': dl}, 'author', 'Richard Donchian')
    eb = sma(c, 20)
    case('env', 'env', {}, {'basis': eb, 'upper': eb * 1.1, 'lower': eb * 0.9}, 'hand', 'Moving average envelope, SMA 20 +/- 10 percent')
    case('lsma-25', 'lsma', {}, {'lsma': talib.LINEARREG(c, 25)}, 'talib', TAL + ' LINEARREG')
    case('wma-9', 'wma', {}, {'wma': talib.WMA(c, 9)}, 'talib', TAL + ' WMA')
    case('hma-9', 'hma', {}, {'hma': wma(2 * wma(c, 4) - wma(c, 9), 3)}, 'author', 'Alan Hull (2005): WMA(2 WMA(n/2) - WMA(n), sqrt n), n/2 and sqrt floored')
    case('smma-7', 'smma', {}, {'smma': rma(c, 7)}, 'author', 'Wilder smoothing (SMMA), SMA seed')
    conv, base = (highest(h, 9) + lowest(l, 9)) / 2, (highest(h, 26) + lowest(l, 26)) / 2
    spanb = (highest(h, 52) + lowest(l, 52)) / 2
    case('ichimoku', 'ichimoku', {}, {'conversion': conv, 'base': base, 'lagging': shift(c, -25), 'upper': shift((conv + base) / 2, 25), 'lower': shift(spanb, 25)},
         'author', 'Goichi Hosoda, Ichimoku Kinko Hyo (9, 26, 52, displacement 26 counted inclusively = 25 bars)',
         'Some sources shift by 26 bars; OpenCandle documents Displacement - 1 (inclusive counting).')
    case('vwma-20', 'vwma', {}, {'vwma': wsum(c * v, 20) / wsum(v, 20)}, 'author', 'Buff Dormeier (2011)')
    lr = np.log(c / shift(c, 1))
    # The author annualisation is the fixed 252 trading days (Annualization Manual); Auto on this UTC-declared daily
    # fixture would use 365.
    MANUAL = {'annualization': 'Manual'}
    case('hv-10', 'hv', MANUAL, {'hv': 100 * stdev(lr, 10, 1) * math.sqrt(252)}, 'author', 'John C. Hull: sample deviation of log returns x sqrt(252)',
         'Some charting platforms use the population deviation and sqrt(365); OpenCandle documents Hull (sample, 252).')
    case('uo', 'uo', {}, {'uo': talib.ULTOSC(h, l, c, 7, 14, 28)}, 'talib', 'Larry Williams (1985); ' + TAL + ' ULTOSC')
    e3 = ema(ema(ema(c, 18, 'sma'), 18, 'sma'), 18, 'sma')
    case('trix-18', 'trix', {}, {'trix': 100 * (e3 - shift(e3, 1)) / shift(e3, 1)}, 'author', 'Jack Hutson (1983): 1-bar percent ROC of a triple EMA; ' + TAL + ' TRIX (tail)',
         'SMA-seeded EMAs (TA-Lib). Some charting platforms compute TRIX from log prices x 10000 (comparison point only).')
    ch = change(c); su, sd = wsum(np.where(ch > 0, ch, 0), 9), wsum(np.where(ch < 0, -ch, 0), 9)
    su[:9] = NAN
    case('cmo-9', 'cmo', {}, {'cmo': 100 * (su - sd) / (su + sd)}, 'author', 'Tushar Chande, The New Technical Trader (1994): sums of up/down changes',
         'TA-Lib CMO applies Wilder smoothing to the sums; OpenCandle follows the author (plain sums).')
    case('stddev-20', 'stddev', {}, {'stddev': talib.STDDEV(c, 20, 1)}, 'talib', TAL + ' STDDEV (population)')
    case('alma-9', 'alma', {}, {'alma': alma(c, 9, 0.85, 6)}, 'author', 'Arnaud Legoux & Dimitrios Douzis-Loukas: Gaussian weights, m = offset (n-1), s = n / sigma')
    e1 = ema(c, 9, 'sma'); e2 = ema(e1, 9, 'sma'); e3b = ema(e2, 9, 'sma')
    case('dema-9', 'dema', {}, {'dema': 2 * e1 - e2}, 'author', 'Patrick Mulloy (1994); ' + TAL + ' DEMA (tail)', 'SMA-seeded EMAs (TA-Lib, StockCharts); OpenCandle 0.8.0 used a first-value seed.')
    case('tema-9', 'tema', {}, {'tema': 3 * e1 - 3 * e2 + e3b}, 'author', 'Patrick Mulloy (1994); ' + TAL + ' TEMA (tail)', 'SMA-seeded EMAs (TA-Lib, StockCharts); OpenCandle 0.8.0 used a first-value seed.')
    case('efi-13', 'efi', {}, {'efi': ema(change(c) * v, 13, 'sma')}, 'author', 'Alexander Elder: EMA13 of (close - prior close) x volume')
    case('maribbon', 'maribbon', {}, {'ma1': sma(c, 20), 'ma2': sma(c, 50), 'ma3': sma(c, 100), 'ma4': sma(c, 200)}, 'talib', TAL + ' SMA')
    case('bbpb', 'bbpb', {}, {'pb': (c - (bm - 2 * bs)) / (4 * bs)}, 'author', 'John Bollinger, Bollinger on Bollinger Bands (2001): %b')
    case('bbw', 'bbw', {}, {'bbw': (4 * bs) / bm}, 'author', 'John Bollinger: BandWidth = (upper - lower) / middle',
         'Some charting packages scale BandWidth by 100; OpenCandle documents the unscaled ratio.')
    case('adr-14', 'adr', {}, {'adr': sma(h - l, 14)}, 'hand', 'SMA of high - low')
    case('chop-14', 'chop', {}, {'chop': 100 * np.log10(wsum(tr(b), 14) / (highest(h, 14) - lowest(l, 14))) / math.log10(14)}, 'author', 'E. W. Dreiss, Choppiness index')
    case('coppock', 'coppock', {}, {'coppock': wma(roc(c, 14) + roc(c, 11), 10)}, 'author', 'Edwin Coppock (1962)')
    case('crsi', 'crsi', {}, {'crsi': connors(c)}, 'author', 'Connors Research, ConnorsRSI (2012)')
    case('dpo-21', 'dpo', {}, {'dpo': shift(c, 11) - sma(c, 21)}, 'author', SC + 'detrended-price-oscillator-dpo (not centered: the close 21/2 + 1 = 11 bars ago less the current SMA 21)')
    emv = 10000 * change(hl2) * (h - l) / v
    case('eom-14', 'eom', {}, {'eom': sma(np.where(h == l, 0, emv), 14)}, 'author', 'Richard Arms, Ease of movement (box ratio = (V/10000)/(H-L)), SMA 14')
    case('fisher-9', 'fisher', {}, fisher(hl2, 9), 'author', 'John Ehlers, Using the Fisher Transform (Stocks & Commodities, Nov 2002): values beyond +/-0.99 are set to +/-0.999',
         'OpenCandle documents "limited to +/-0.999"; the author sets any value beyond 0.99 to 0.999.')
    case('kst', 'kst', {}, kst(c), 'author', 'Martin Pring, Know Sure Thing (daily: ROC 10/15/20/30, SMA 10/10/10/15, signal 9)')
    eh = ema(h - l, 9, 'sma'); case('mass', 'mass', {}, {'mass': wsum(eh / ema(eh, 9, 'sma'), 25)}, 'author', 'Donald Dorsey, Mass index (EMA 9, sum 25)')
    case('mcginley-14', 'mcginley', {}, {'md': mcginley(c, 14)}, 'author', 'John McGinley, McGinley dynamic')
    nv = np.where(c > shift(c, 1), v, np.where(c < shift(c, 1), -v, 0.0)); nv[0] = NAN
    case('netvol', 'netvol', {}, {'netvol': nv}, 'hand', 'Signed volume by close change')
    pf, pslo = ema(c, 12, 'sma'), ema(c, 26, 'sma'); ppo = 100 * (pf - pslo) / pslo; psg = ema(ppo, 9, 'sma')
    case('ppo', 'ppo', {}, {'ppo': ppo, 'signal': psg, 'histogram': ppo - psg}, 'author', 'Gerald Appel; ' + SC + 'price-oscillators-ppo')
    case('rvgi-10', 'rvgi', {}, rvgi(o, h, l, c, 10), 'author', 'John Ehlers, Relative vigor index')
    sd10 = stdev(c, 10); chg = change(c)
    case('rvi', 'rvi', {}, {'rvi': rvi_dorsey(sd10, chg, 14)}, 'author', 'Donald Dorsey (1993), Relative volatility index, Wilder smoothing 14')
    t1 = ema(ema(chg, 25, 'sma'), 13, 'sma'); t2 = ema(ema(np.abs(chg), 25, 'sma'), 13, 'sma'); tsi = 100 * t1 / t2
    case('tsi', 'tsi', {}, {'tsi': tsi, 'signal': ema(tsi, 13, 'sma')}, 'author', 'William Blau, Momentum, Direction and Divergence (1995)')
    s1 = ema(ema(chg, 20, 'sma'), 5, 'sma'); s2 = ema(ema(np.abs(chg), 20, 'sma'), 5, 'sma'); smi = 100 * s1 / s2; ssg = ema(smi, 5, 'sma')
    case('smiergodic', 'smiergodic', {}, {'smi': smi, 'signal': ssg, 'oscillator': smi - ssg}, 'author', 'William Blau, SMI ergodic (TSI 20/5, signal 5)')
    case('smiergodicosc', 'smiergodicosc', {}, {'oscillator': smi - ssg}, 'author', 'William Blau, SMI ergodic oscillator')
    vs, vl = ema(v, 5, 'sma'), ema(v, 10, 'sma')
    case('vo', 'vo', {}, {'vo': 100 * (vs - vl) / vl}, 'hand', 'Volume oscillator = (EMA5 - EMA10) / EMA10 x 100')
    vp = np.abs(h - shift(l, 1)); vm = np.abs(l - shift(h, 1)); trv = tr(b, False)
    case('vortex-14', 'vortex', {}, {'viPlus': wsum(vp, 14) / wsum(trv, 14), 'viMinus': wsum(vm, 14) / wsum(trv, 14)}, 'author', 'Botes & Siepman (2010), Vortex indicator')
    case('alligator', 'alligator', {}, {'jaw': shift(rma(hl2, 13), 8), 'teeth': shift(rma(hl2, 8), 5), 'lips': shift(rma(hl2, 5), 3)}, 'author', 'Bill Williams, Trading Chaos: SMMA of median price, shifted forward')
    case('fractals', 'fractals', {}, fractals(h, l, 2), 'author', 'Bill Williams fractals (2 bars each side, strict)')
    clv = np.where(h == l, 0, ((c - l) - (h - c)) / np.where(h == l, 1, h - l)); ad = np.cumsum(clv * v)
    case('ad', 'ad', {}, {'ad': ad}, 'talib', 'Marc Chaikin; ' + TAL + ' AD')
    case('chaikinosc', 'chaikinosc', {}, {'osc': ema(ad, 3, 'sma') - ema(ad, 10, 'sma')}, 'author', 'Marc Chaikin; ' + TAL + ' ADOSC (first-value EMA seed)')
    pvt = np.full(len(c), NAN); pvt[1] = v[1] * (c[1] - c[0]) / c[0]
    for i in range(2, len(c)): pvt[i] = pvt[i - 1] + v[i] * (c[i] - c[i - 1]) / c[i - 1]
    case('pvt', 'pvt', {}, {'pvt': pvt}, 'hand', 'Price volume trend, starting on the second bar')
    case('bop', 'bop', {}, {'bop': talib.BOP(o, h, l, c)}, 'talib', 'Igor Livshin; ' + TAL + ' BOP')
    e13 = ema(c, 13, 'sma')
    case('bbpower', 'bbpower', {}, {'power': (h - e13) + (l - e13), 'bull': h - e13, 'bear': l - e13}, 'author', 'Alexander Elder, Elder-ray (EMA 13)',
         'OpenCandle power = bull + bear (the combined histogram).')
    case('macross', 'macross', {}, {'short': sma(c, 9), 'long': sma(c, 21)}, 'talib', TAL + ' SMA')
    case('emacross', 'emacross', {}, {'short': ema(c, 9, 'sma'), 'long': ema(c, 26, 'sma')}, 'hand', 'EMA 9 / EMA 26 (first-value seed)')
    case('kama', 'kama', {}, {'kama': kama(c, 10, 2, 30)}, 'author', 'Perry Kaufman, Smarter Trading (1995); ' + TAL + ' KAMA')
    pu, pl = shift(highest(h, 20), 1), shift(lowest(l, 20), 1)
    case('pricechannel', 'pricechannel', {}, {'upper': pu, 'lower': pl, 'center': (pu + pl) / 2}, 'author', 'Price channel excluding the current bar')
    case('lrslope', 'lrslope', {}, {'slope': talib.LINEARREG_SLOPE(c, 14)}, 'talib', TAL + ' LINEARREG_SLOPE')
    ul_hi = highest(c, 14); dd = 100 * (c - ul_hi) / ul_hi; ulc = np.sqrt(sma(dd * dd, 14))
    case('ulcer', 'ulcer', {}, {'ulcer': ulc}, 'author', 'Peter Martin (1987) Ulcer index')
    s20, d20, s50, d50 = sma(c, 20), stdev(c, 20), sma(c, 50), stdev(c, 50)
    case('bbtrend', 'bbtrend', {}, {'bbtrend': (np.abs((s20 - 2 * d20) - (s50 - 2 * d50)) - np.abs((s20 + 2 * d20) - (s50 + 2 * d50))) / s20 * 100}, 'author', 'John Bollinger, BBTrend')
    case('guppy', 'guppy', {}, {f'short{i+1}': ema(c, n, 'sma') for i, n in enumerate([3, 5, 8, 10, 12, 15])} | {f'long{i+1}': ema(c, n, 'sma') for i, n in enumerate([30, 35, 40, 45, 50, 60])}, 'author', 'Daryl Guppy GMMA')
    se = stderr(c, 21); end = talib.LINEARREG(c, 21)
    case('sebands', 'sebands', {}, {'middle': sma(end, 3), 'upper': sma(end + 2 * se, 3), 'lower': sma(end - 2 * se, 3)}, 'author', 'Jon Andersen (1996), Standard error bands')
    case('stderror', 'stderror', {}, {'stderror': stderr(c, 14)}, 'hand', 'Standard error of the estimate, n - 2')
    case('typprice', 'typprice', {}, {'price': talib.TYPPRICE(h, l, c)}, 'talib', TAL + ' TYPPRICE')
    case('avgprice', 'avgprice', {}, {'price': talib.AVGPRICE(o, h, l, c)}, 'talib', TAL + ' AVGPRICE')
    case('medprice', 'medprice', {}, {'price': talib.MEDPRICE(h, l)}, 'talib', TAL + ' MEDPRICE')
    hlr = highest(h, 10) - lowest(l, 10); rr = c - (highest(h, 10) + lowest(l, 10)) / 2
    smi2 = 200 * ema(ema(rr, 3, 'sma'), 3, 'sma') / ema(ema(hlr, 3, 'sma'), 3, 'sma')
    case('smi', 'smi', {}, {'smi': smi2, 'ema': ema(smi2, 3, 'sma')}, 'author', 'William Blau, Stochastic momentum index')
    case('volcc', 'volcc', MANUAL, {'volatility': 100 * stdev(lr, 10, 1) * math.sqrt(252)}, 'author', 'Close-to-close estimator (sample)')
    case('volzt', 'volzt', MANUAL, {'volatility': 100 * np.sqrt(sma(lr * lr, 10)) * math.sqrt(252)}, 'author', 'Zero-mean close-to-close volatility')
    gk = 0.5 * np.log(h / l) ** 2 - (2 * math.log(2) - 1) * np.log(c / o) ** 2
    case('volohlc', 'volohlc', MANUAL, {'volatility': 100 * np.sqrt(sma(gk, 10) * 252)}, 'author', 'Garman & Klass (1980)')
    hc = highest(c, 22); case('volindex', 'volindex', {}, {'index': 100 * (hc - l) / hc}, 'author', 'Larry Williams, The VIX Fix (2007)')
    case('mamultiple', 'mamultiple', {}, {f'ma{i+1}': sma(c, n) for i, n in enumerate([5, 10, 20, 50, 100, 200])}, 'talib', TAL + ' SMA')
    case('mahamming', 'mahamming', {}, {'ma': hamming(c, 10)}, 'author', 'Hamming window w(k) = 0.54 - 0.46 cos(2 pi k / (N - 1))')
    upb = np.where(c > shift(c, 1), 1.0, 0.0); upb[0] = NAN
    case('majority', 'majority', {}, {'majority': 100 * sma(upb, 14)}, 'hand', 'Percent of up closes over 14 bars')
    case('trendstrength', 'trendstrength', {}, {'tsi': talib.CORREL(c, np.arange(len(c), dtype=float), 14)}, 'talib', TAL + ' CORREL(close, bar index)')
    case('chaikinvol', 'chaikinvol', {}, {'cv': roc(ema(h - l, 10, 'sma'), 10)}, 'author', 'Marc Chaikin volatility')
    ao_ = sma(hl2, 5) - sma(hl2, 34)
    case('accelosc', 'accelosc', {}, {'ac': ao_ - sma(ao_, 5)}, 'author', 'Bill Williams, Accelerator oscillator')
    md = rolling_median(hl2, 3); ma_ = rma(tr(b), 14)
    case('median', 'median', {}, {'median': md, 'ema': ema(md, 3, 'sma'), 'upper': md + 2 * ma_, 'lower': md - 2 * ma_}, 'hand', 'Rolling median, its EMA and ATR bands (as documented)')
    a10 = rma(tr(b), 10); fh = highest(h, 10) - a10; fl = lowest(l, 10) + a10
    case('chandekroll', 'chandekroll', {}, {'stopLong': lowest(fl, 9), 'stopShort': highest(fh, 9)}, 'author', 'Chande & Kroll, The New Technical Trader (1994)')
    case('kdj', 'kdj', {}, kdj(h, l, c, 9, 3, 3), 'author', 'KDJ, K and D start at 50')
    case('machannel', 'machannel', {}, {'upper': sma(h, 20), 'lower': sma(l, 20)}, 'hand', 'SMA(high, 20) / SMA(low, 20)')
    case('rci-12', 'rci', {'maType': 'None'}, {'rci': rci(c, 12)}, 'author', 'Spearman rank correlation x 100 (tie-averaged ranks)')
    # hand-computed from the published formula (no outside library implements these) -----------------------------
    w14, w6 = cci_of(hlc3, 14), cci_of(hlc3, 6)
    case('woodiescci', 'woodiescci', {}, {'histogram': w14, 'cci': w14, 'turbo': w6}, 'hand', 'Ken Wood: CCI 14 and turbo CCI 6 of the typical price (Lambert CCI)')
    kvo = klinger(h, l, c, v)
    case('klinger', 'klinger', {}, kvo, 'hand', 'Stephen Klinger, volume force in the MetaStock form (as documented), EMA 34/55, signal EMA 13',
         'Some charting platforms compute KVO from signed volume only (sv = +/-volume by hlc3 change); OpenCandle documents the MetaStock volume-force form.')
    case('asi', 'asi', {}, {'asi': asi(o, h, l, c, 10)}, 'hand', 'J. Welles Wilder (1978) swing index, limit move 10, running total')
    ez = ema(c, 34, 'sma'); slope = 100 * (ez - shift(ez, 1)) / (highest(h, 30) - lowest(l, 30))
    case('chopzone', 'chopzone', {}, {'slope': slope, 'zone': np.where(np.isfinite(slope), 1.0, NAN)}, 'hand', 'Chop zone slope = 100 x EMA change / (highest high - lowest low over 30)')
    case('lrc', 'lrc', {}, lrc(c, 100, 2, 2), 'hand', 'OLS line of the last 100 closes +/- 2 population deviations of the residuals (latest window only)')
    case('vol24h', 'vol24h', {}, {'volume': v}, 'hand', 'Trailing 24-hour volume; on daily bars the window holds only the current bar')
    sec = second_symbol(B); c2 = sec
    case('ratio', 'ratio', {}, {'ratio': c / c2}, 'hand', 'Chart close / second symbol close (second symbol: deterministic transform, tests/reference/context.ts)')
    case('spread', 'spread', {}, {'spread': c - c2}, 'hand', 'Chart close - 1 x second symbol close')
    rs = c / c2; case('relstrength', 'relstrength', {}, {'rs': rs, 'ma': sma(rs, 20)}, 'hand', 'Comparative relative strength and its SMA 20')
    case('correlation', 'correlation', {}, {'correlation': talib.CORREL(c, c2, 20)}, 'talib', TAL + ' CORREL (Pearson)')
    lr2 = np.log(c2 / shift(c2, 1))
    case('correlationlog', 'correlationlog', {}, {'correlation': talib.CORREL(lr, lr2, 20)}, 'talib', TAL + ' CORREL of log returns')
    hull = wma(2 * wma(c, 27) - wma(c, 55), 7)
    case('hullsuite', 'hullsuite', {}, {'upper': hull, 'lower': shift(hull, 2), 'trend': np.where(np.isfinite(hull) & np.isfinite(shift(hull, 2)), np.where(hull > shift(hull, 2), 1.0, -1.0), NAN)}, 'author',
         'Alan Hull HMA(55): WMA(2 WMA(27) - WMA(55), round(sqrt 55) = 7); band against the value two bars earlier')
    case('performance', 'performance', {}, performance(B), 'hand', 'Return = 100 x (close / reference close - 1); reference = newest bar at or before the same instant 1 week / n calendar months earlier; YTD vs the newest bar before 1 January UTC')
    case('rciribbon', 'rciribbon', {}, {'short': rci(c, 10), 'middle': rci(c, 30), 'long': rci(c, 50)}, 'hand', 'Three RCIs (10, 30, 50) of the close')
    case('visibleavg', 'visibleavg', {}, {'average': np.full(len(c), c.mean())}, 'hand', 'Mean close of the visible bars (visible range = every loaded bar)')
    case('twap-daily', 'twap', {}, {'twap': ohlc4}, 'hand', 'TWAP anchor 1D on daily bars: one bar per period, so TWAP = ohlc4')
    ph, pl = np.full(len(c), NAN), np.full(len(c), NAN)
    for i in range(10, len(c) - 10):
        if all(h[i] > h[j] for j in range(i - 10, i + 11) if j != i): ph[i] = h[i]
        if all(l[i] < l[j] for j in range(i - 10, i + 11) if j != i): pl[i] = l[i]
    case('pivotshl', 'pivotshl', {}, {'high': ph, 'low': pl}, 'hand', 'Swing high/low with 10 bars each side (strict), placed on the pivot bar')
    case('chandelier', 'chandelier', {}, chandelier(h, l, c, 22, 3.0), 'hand', 'Chuck LeBeau chandelier exit (22, 3 ATR, use close), ratchet and direction rules as documented')
    return cases

# --- longer formulas -------------------------------------------------------------------------------

def chandelier(h, l, c, n, m):
    b = dict(h=h, l=l, c=c); atr = m * rma(tr(b), n); hi, lo = highest(c, n), lowest(c, n)
    ls, ss = hi - atr, lo + atr; L, S = np.full(len(c), NAN), np.full(len(c), NAN); d = 1; out_l, out_s = np.full(len(c), NAN), np.full(len(c), NAN)
    for i in range(len(c)):
        if not fin(ls[i]): continue
        pl, ps = (L[i - 1], S[i - 1]) if i and fin(L[i - 1]) else (ls[i], ss[i])
        L[i] = max(ls[i], pl) if c[i - 1] > pl else ls[i]
        S[i] = min(ss[i], ps) if c[i - 1] < ps else ss[i]
        d = 1 if c[i] > ps else -1 if c[i] < pl else d
        if d == 1: out_l[i] = L[i]
        else: out_s[i] = S[i]
    return {'long': out_l, 'short': out_s}

def klinger(h, l, c, v):
    n = len(c); vf = np.full(n, NAN); trend, cm = 0, 0.0; hlc = h + l + c
    for i in range(1, n):
        t = 1 if hlc[i] > hlc[i - 1] else -1; dm, pdm = h[i] - l[i], h[i - 1] - l[i - 1]
        cm = (cm + dm) if (i > 1 and t == trend) else (pdm + dm); trend = t
        if cm != 0: vf[i] = v[i] * abs(2 * (dm / cm - 1)) * t * 100
    kvo = ema(vf, 34, 'sma') - ema(vf, 55, 'sma'); return {'kvo': kvo, 'signal': ema(kvo, 13, 'sma')}

def asi(o, h, l, c, limit):
    out = np.full(len(c), NAN); total = 0.0
    for i in range(1, len(c)):
        cy, oy = c[i - 1], o[i - 1]; a, b, d = abs(h[i] - cy), abs(l[i] - cy), abs(h[i] - l[i]); k = max(a, b)
        if a >= b and a >= d: r = a - 0.5 * b + 0.25 * abs(cy - oy)
        elif b >= a and b >= d: r = b - 0.5 * a + 0.25 * abs(cy - oy)
        else: r = d + 0.25 * abs(cy - oy)
        si = 0.0 if r == 0 else 50 * (c[i] - cy + 0.5 * (c[i] - o[i]) + 0.25 * (cy - oy)) / r * k / limit
        total += si; out[i] = total
    return out

def lrc(x, n, up, dn):
    out = {k: np.full(len(x), NAN) for k in ('upper', 'basis', 'lower')}; w = x[-n:]; xs = np.arange(n)
    sl, ic = np.polyfit(xs, w, 1); line = ic + sl * xs; sd = math.sqrt(((w - line) ** 2).mean())
    out['basis'][-n:] = line; out['upper'][-n:] = line + up * sd; out['lower'][-n:] = line - dn * sd; return out

def second_symbol(B):
    return arr([b['close'] * (1 + 0.1 * math.sin(i / 7)) * 0.5 for i, b in enumerate(B)])

def performance(B):
    from datetime import datetime, timezone
    times = [b['time'] for b in B]; c = arr([b['close'] for b in B]); out = {k: np.full(len(B), NAN) for k in ('w1', 'm1', 'm3', 'm6', 'ytd', 'y1')}
    def ref_at(instant, strict=False):
        idx = None
        for j, t in enumerate(times):
            if (t < instant if strict else t <= instant): idx = j
            else: break
        return idx
    def months_back(t, m):
        d = datetime.fromtimestamp(t, timezone.utc); y, mo = d.year, d.month - m
        while mo <= 0: mo += 12; y -= 1
        import calendar; day = min(d.day, calendar.monthrange(y, mo)[1])
        return int(d.replace(year=y, month=mo, day=day).timestamp())
    for i, t in enumerate(times):
        refs = {'w1': t - 7 * 86400, 'm1': months_back(t, 1), 'm3': months_back(t, 3), 'm6': months_back(t, 6), 'y1': months_back(t, 12)}
        for k, inst in refs.items():
            if inst < times[0]: continue
            j = ref_at(inst)
            if j is not None and c[j] != 0: out[k][i] = 100 * (c[i] / c[j] - 1)
        jan1 = int(datetime(datetime.fromtimestamp(t, timezone.utc).year, 1, 1, tzinfo=timezone.utc).timestamp())
        if jan1 > times[0]:
            j = ref_at(jan1, True)
            if j is not None: out['ytd'][i] = 100 * (c[i] / c[j] - 1)
    return out
def mfi(h, l, c, v, n):
    tp = (h + l + c) / 3; pos, neg = np.zeros(len(c)), np.zeros(len(c)); pos[0] = neg[0] = NAN
    for i in range(1, len(c)):
        pos[i] = tp[i] * v[i] if tp[i] > tp[i - 1] else 0; neg[i] = tp[i] * v[i] if tp[i] < tp[i - 1] else 0
    ps, ns = wsum(pos, n), wsum(neg, n)
    return np.where(ns == 0, 100.0, 100 - 100 / (1 + ps / np.where(ns == 0, 1, ns)))

def psar(h, l, c, start, inc, mx):
    n = len(h); out = np.full(n, NAN)
    up = c[1] > c[0]; sar = l[0] if up else h[0]; ep = h[1] if up else l[1]; af = min(start, mx)
    for i in range(1, n):
        sar = sar + af * (ep - sar)
        rev = (up and l[i] < sar) or ((not up) and h[i] > sar)
        if rev:
            sar = max(ep, h[i]) if up else min(ep, l[i])
            up = not up; ep = h[i] if up else l[i]; af = min(start, mx)
        else:
            if up and h[i] > ep: ep = h[i]; af = min(af + inc, mx)
            if (not up) and l[i] < ep: ep = l[i]; af = min(af + inc, mx)
        if up: sar = min(sar, l[i - 1], l[i - 2] if i > 1 else l[i - 1])
        else: sar = max(sar, h[i - 1], h[i - 2] if i > 1 else h[i - 1])
        out[i] = sar
    return out

def supertrend(h, l, c, n, factor):
    b = dict(h=h, l=l, c=c); atr = rma(tr(b), n); src = (h + l) / 2
    ub, lb = src + factor * atr, src - factor * atr
    fu, fl = np.full(len(c), NAN), np.full(len(c), NAN); st = np.full(len(c), NAN); dirn = np.full(len(c), NAN)
    for i in range(len(c)):
        if not fin(atr[i]): continue
        pu = fu[i - 1] if i and fin(fu[i - 1]) else 0.0; pl = fl[i - 1] if i and fin(fl[i - 1]) else 0.0
        fl[i] = lb[i] if (lb[i] > pl or c[i - 1] < pl) else pl
        fu[i] = ub[i] if (ub[i] < pu or c[i - 1] > pu) else pu
        if not (i and fin(atr[i - 1])): d = 1
        elif st[i - 1] == fu[i - 1]: d = -1 if c[i] > fu[i] else 1
        else: d = 1 if c[i] < fl[i] else -1
        dirn[i] = d; st[i] = fl[i] if d == -1 else fu[i]
    return {'upTrend': np.where(dirn == -1, st, NAN), 'downTrend': np.where(dirn == 1, st, NAN)}

def alma(x, n, offset, sigma):
    m, s = offset * (n - 1), n / sigma; w = np.exp(-((np.arange(n) - m) ** 2) / (2 * s * s)); out = np.full(len(x), NAN)
    for i in range(n - 1, len(x)): out[i] = float(np.dot(w, x[i - n + 1:i + 1])) / w.sum()
    return out

def connors(c):
    streak = np.zeros(len(c)); streak[0] = NAN
    for i in range(1, len(c)):
        p = streak[i - 1] if fin(streak[i - 1]) else 0
        streak[i] = (p + 1 if p > 0 else 1) if c[i] > c[i - 1] else (p - 1 if p < 0 else -1) if c[i] < c[i - 1] else 0
    r1 = roc(c, 1); pr = np.full(len(c), NAN)
    for i in range(101, len(c)):
        w = r1[i - 100:i]; pr[i] = 100 * np.sum(w < r1[i]) / 100
    return (rsi(c, 3) + rsi(streak, 2) + pr) / 3

def fisher(hl2, n):
    hh, ll = highest(hl2, n), lowest(hl2, n); val, fish = 0.0, 0.0; f, t = np.full(len(hl2), NAN), np.full(len(hl2), NAN); started = False
    for i in range(n - 1, len(hl2)):
        rng = hh[i] - ll[i]; raw = 0.0 if rng == 0 else 0.66 * ((hl2[i] - ll[i]) / rng - 0.5) + 0.67 * val
        raw = 0.999 if raw > 0.99 else -0.999 if raw < -0.99 else raw  # Ehlers: If Value1 > .99 Then Value1 = .999
        prev = fish
        fish = 0.5 * math.log((1 + raw) / (1 - raw)) + 0.5 * fish; val = raw
        f[i] = fish; t[i] = prev if started else NAN; started = True
    return {'fisher': f, 'trigger': t}

def kst(c):
    k = sma(roc(c, 10), 10) + 2 * sma(roc(c, 15), 10) + 3 * sma(roc(c, 20), 10) + 4 * sma(roc(c, 30), 15)
    return {'kst': k, 'signal': sma(k, 9)}

def mcginley(x, n):
    out = np.full(len(x), NAN); md = x[0]; out[0] = md
    for i in range(1, len(x)): md = md + (x[i] - md) / (n * (x[i] / md) ** 4); out[i] = md
    return out

def rvgi(o, h, l, c, n):
    num = ((c - o) + 2 * shift(c - o, 1) + 2 * shift(c - o, 2) + shift(c - o, 3)) / 6
    den = ((h - l) + 2 * shift(h - l, 1) + 2 * shift(h - l, 2) + shift(h - l, 3)) / 6
    rv = wsum(num, n) / wsum(den, n)
    return {'rvi': rv, 'signal': (rv + 2 * shift(rv, 1) + 2 * shift(rv, 2) + shift(rv, 3)) / 6}

def rvi_dorsey(sd, ch, n):
    u = np.where(np.isfinite(sd) & np.isfinite(ch), np.where(ch > 0, sd, 0), NAN); d = np.where(np.isfinite(sd) & np.isfinite(ch), np.where(ch < 0, sd, 0), NAN)
    ru, rd = rma(u, n), rma(d, n); return 100 * ru / (ru + rd)

def fractals(h, l, p):
    up, dn = np.full(len(h), NAN), np.full(len(h), NAN)
    for i in range(p, len(h) - p):
        if all(h[i] > h[i - k] and h[i] > h[i + k] for k in range(1, p + 1)): up[i] = h[i]
        if all(l[i] < l[i - k] and l[i] < l[i + k] for k in range(1, p + 1)): dn[i] = l[i]
    return {'up': up, 'down': dn}

def kama(x, n, fast, slow):
    out = np.full(len(x), NAN); fs, ss = 2 / (fast + 1), 2 / (slow + 1); k = x[n - 1]
    for i in range(n, len(x)):
        vol = np.abs(np.diff(x[i - n:i + 1])).sum(); er = 0 if vol == 0 else abs(x[i] - x[i - n]) / vol
        sc = (er * (fs - ss) + ss) ** 2; k = k + sc * (x[i] - k); out[i] = k
    return out

def stderr(x, n):
    out = np.full(len(x), NAN); xs = np.arange(n)
    for i in range(n - 1, len(x)):
        w = x[i - n + 1:i + 1]; sl, ic = np.polyfit(xs, w, 1); res = w - (ic + sl * xs); out[i] = math.sqrt((res ** 2).sum() / (n - 2))
    return out

def hamming(x, n):
    w = 0.54 - 0.46 * np.cos(2 * math.pi * np.arange(n) / (n - 1)); out = np.full(len(x), NAN)
    for i in range(n - 1, len(x)): out[i] = float(np.dot(w, x[i - n + 1:i + 1])) / w.sum()
    return out

def rolling_median(x, n):
    out = np.full(len(x), NAN)
    for i in range(n - 1, len(x)): out[i] = float(np.median(x[i - n + 1:i + 1]))
    return out

def kdj(h, l, c, n, ks, ds):
    rsv = stoch_raw(c, h, l, n); K, D = 50.0, 50.0; ko, do, jo = (np.full(len(c), NAN) for _ in range(3))
    for i in range(len(c)):
        if not fin(rsv[i]): continue
        K = (1 - 1 / ks) * K + rsv[i] / ks; D = (1 - 1 / ds) * D + K / ds; ko[i], do[i], jo[i] = K, D, 3 * K - 2 * D
    return {'k': ko, 'd': do, 'j': jo}

def rci(x, n):
    out = np.full(len(x), NAN); t = np.arange(n, dtype=float)
    for i in range(n - 1, len(x)):
        w = x[i - n + 1:i + 1]; order = w.argsort(); ranks = np.empty(n); ranks[order] = np.arange(n, dtype=float)
        for val in np.unique(w):  # tie averaging
            idx = np.where(w == val)[0]; ranks[idx] = ranks[idx].mean()
        out[i] = 100 * np.corrcoef(ranks, t)[0, 1]
    return out

# ----------------------------------------------------------------------------- TA-Lib cross-checks
def crosscheck(B):
    o, h, l, c, v = (arr([b[k] for b in B]) for k in ('open', 'high', 'low', 'close', 'volume'))
    b = dict(o=o, h=h, l=l, c=c, v=v); tail = slice(200, None)
    def same(name, mine, ref, sl=slice(None)):
        a, r = np.asarray(mine, float)[sl], np.asarray(ref, float)[sl]; mask = np.isfinite(a) & np.isfinite(r)
        if mask.sum() < 20: raise SystemExit(f'crosscheck {name}: too few overlapping values')
        err = np.max(np.abs(a[mask] - r[mask]) / np.maximum(1, np.abs(r[mask])))
        if err > 1e-7: raise SystemExit(f'crosscheck {name} failed: max rel err {err}')
        return name
    done = [same('SMA', sma(c, 9), talib.SMA(c, 9)), same('EMA', ema(c, 9, 'sma'), talib.EMA(c, 9)), same('RSI', rsi(c, 14), talib.RSI(c, 14)),
            same('WMA', wma(c, 9), talib.WMA(c, 9)), same('STDDEV', stdev(c, 20), talib.STDDEV(c, 20, 1)), same('CCI', cci_of((h + l + c) / 3, 20), talib.CCI(h, l, c, 20)),
            same('ATR(tail)', rma(tr(b), 14), talib.ATR(h, l, c, 14), tail), same('MOM', change(c, 10), talib.MOM(c, 10)), same('ROC', roc(c, 9), talib.ROC(c, 9)),
            same('LINEARREG', linreg(c, 25), talib.LINEARREG(c, 25)), same('DEMA(tail)', 2 * ema(c, 9) - ema(ema(c, 9), 9), talib.DEMA(c, 9), tail),
            same('KAMA(tail)', kama(c, 10, 2, 30), talib.KAMA(c, 10), tail), same('TRIX(tail)', (lambda e: 100 * (e - shift(e, 1)) / shift(e, 1))(ema(ema(ema(c, 18), 18), 18)), talib.TRIX(c, 18), tail),
            same('MFI', mfi(h, l, c, v, 14), talib.MFI(h, l, c, v, 14)),
            same('AD', np.cumsum(np.where(h == l, 0, ((c - l) - (h - c)) / np.where(h == l, 1, h - l)) * v), talib.AD(h, l, c, v)),
            same('STOCH', sma(sma(stoch_raw(c, h, l, 14), 3), 3), talib.STOCH(h, l, c, 14, 3, 0, 3, 0)[1]),
            same('MACD(tail)', ema(c, 12, 'sma') - ema(c, 26, 'sma'), talib.MACD(c, 12, 26, 9)[0], tail),
            same('ADX(tail)', _adx(b), talib.ADX(h, l, c, 14), slice(270, None)),
            same('SAR(tail)', psar(h, l, c, 0.02, 0.02, 0.2), talib.SAR(h, l, 0.02, 0.2), tail)]
    return done

def _adx(b):
    h, l, c = b['h'], b['l'], b['c']; pdm, mdm, trr = (np.full(len(c), NAN) for _ in range(3))
    for i in range(1, len(c)):
        u, d = h[i] - h[i - 1], l[i - 1] - l[i]; pdm[i] = u if u > d and u > 0 else 0; mdm[i] = d if d > u and d > 0 else 0
        trr[i] = max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1]))
    st, sp, sm = rma(trr, 14), rma(pdm, 14), rma(mdm, 14); pdi, mdi = 100 * sp / st, 100 * sm / st
    return rma(100 * np.abs(pdi - mdi) / (pdi + mdi), 14)

# ------------------------------------------------------------------------------------------- VWAP
def vwap_cases(series, zone):
    from zoneinfo import ZoneInfo
    from datetime import datetime, timezone
    tz = ZoneInfo(zone); out, key, cv, cw = [], None, 0.0, 0.0
    for bar in series:
        k = datetime.fromtimestamp(bar['time'], tz).date().isoformat()
        if k != key: key, cv, cw = k, 0.0, 0.0
        tp = (bar['high'] + bar['low'] + bar['close']) / 3; cv += bar['volume']; cw += tp * bar['volume']
        out.append(None if cv == 0 else cw / cv)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    clean, edge = make_daily(20261031, False), make_daily(20261031, True)
    us, crypto = make_intraday_us(7), make_crypto_hourly(11)
    checks = crosscheck(clean)
    cases = build_cases(clean)
    vw = [dict(id='vwap-us-session-ny', series='us30m', inputs={'anchor': 'Session', 'timezone': 'America/New_York'}, plots={'vwap': [None if x is None else float(f'{x:.12g}') for x in vwap_cases(us, 'America/New_York')]},
               cite='VWAP resets at each trading session: the New York trading date for US equities (pre-market and after-hours count toward their trading date).'),
          dict(id='vwap-crypto-session-utc', series='crypto1h', inputs={'anchor': 'Session', 'timezone': 'UTC'}, plots={'vwap': [None if x is None else float(f'{x:.12g}') for x in vwap_cases(crypto, 'UTC')]},
               cite='Crypto trades 24/7; the session day is the UTC day (00:00 UTC).')]
    with open(os.path.join(OUT, 'bars.json'), 'w') as f:
        json.dump({'generator': 'scripts/reference/generate_reference.py', 'daily': clean, 'dailyEdge': edge, 'us30m': us, 'crypto1h': crypto}, f, separators=(',', ':'))
    with open(os.path.join(OUT, 'expected.json'), 'w') as f:
        json.dump({'generator': 'scripts/reference/generate_reference.py', 'talibVersion': talib.__version__, 'crosschecked': checks,
                   'series': 'daily', 'cases': cases, 'vwap': vw}, f, separators=(',', ':'))
    print(f'{len(cases)} daily cases, {len(vw)} vwap cases, crosschecked: {", ".join(checks)}')


if __name__ == '__main__':
    main()
