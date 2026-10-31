"""Unit tests for iex_tops_bars.py against a hand-built SYNTHETIC capture.

SYNTHETIC FIXTURE: every packet below is constructed in this file from the IEX
TOPS 1.6 / IEX-TP layouts. None of it is market data; prices, sizes and trade IDs
are invented to exercise the framing, eligibility and aggregation rules exactly.

Run:  %LOCALAPPDATA%\\Programs\\Python\\Python312\\python.exe -I tools\\iex-hist\\test_iex_tops_bars.py
"""
from __future__ import annotations

import calendar
import contextlib
import gzip
import hashlib
import io
import json
import shutil
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import iex_tops_bars as tool  # noqa: E402

SYNTHETIC_LABEL = 'SYNTHETIC TEST FIXTURE - hand-built IEX-TP/TOPS 1.6 packets, not market data'
SESSION = 0x5EED


def ns(y, mo, d, h, mi, s, frac_ns=0):
    """UTC wall time -> ns since epoch."""
    return calendar.timegm((y, mo, d, h, mi, s)) * 1_000_000_000 + frac_ns


def et(h, mi, s, frac_ns=0):
    """2026-10-14 America/New_York (EDT, UTC-4) wall time -> ns since epoch."""
    return ns(2026, 10, 14, h + 4, mi, s, frac_ns)


def px(text):
    """'27.35' -> TOPS Price int (4 implied decimals)."""
    whole, _, frac = text.partition('.')
    return int(whole) * 10000 + int((frac + '0000')[:4])


def trade(sym, ts, size, price, tid, flags=0, mtype=0x54):
    msg = struct.pack('<BBq8sIqq', mtype, flags, ts, sym.ljust(8).encode(), size, px(price), tid)
    assert len(msg) == 38
    return msg


def brk(sym, ts, size, price, tid):
    return trade(sym, ts, size, price, tid, mtype=0x42)


def quote(sym, ts):
    msg = struct.pack('<BBq8sIqqI', 0x51, 0, ts, sym.ljust(8).encode(), 100, px('27.00'), px('28.00'), 100)
    assert len(msg) == 42
    return msg


def segment(first_seq, msgs, send_ns=0, protocol=0x8003):
    payload = b''.join(struct.pack('<H', len(m)) + m for m in msgs)
    header = struct.pack('<BBHIIHHqqq', 1, 0, protocol, 1, SESSION, len(payload), len(msgs), 0, first_seq, send_ns)
    assert len(header) == 40
    return header + payload


def udp_frame(payload):
    udp = struct.pack('>HHHH', 10378, 10378, 8 + len(payload), 0) + payload
    ip = struct.pack('>BBHHHBBH4s4s', 0x45, 0, 20 + len(udp), 1, 0x4000, 64, 17, 0,
                     bytes([10, 0, 0, 1]), bytes([233, 215, 21, 4])) + udp   # DF flag set, not a fragment
    return b'\x01\x00\x5e\x57\x15\x04' + b'\x02\x00\x00\x00\x00\x01' + b'\x08\x00' + ip


def pcap(frames, big_endian=False):
    e = '>' if big_endian else '<'
    out = [struct.pack(e + 'IHHiIII', 0xA1B2C3D4, 2, 4, 0, 0, 65535, 1)]
    for i, f in enumerate(frames):
        out.append(struct.pack(e + 'IIII', 1792000000 + i, 0, len(f), len(f)) + f)
    return b''.join(out)


def pcapng(frames):
    def block(btype, body):
        body += b'\x00' * (-len(body) % 4)
        length = 12 + len(body)
        return struct.pack('<II', btype, length) + body + struct.pack('<I', length)
    out = [block(0x0A0D0D0A, struct.pack('<IHHq', 0x1A2B3C4D, 1, 0, -1)),
           block(1, struct.pack('<HHI', 1, 0, 65535))]
    for f in frames:
        out.append(block(6, struct.pack('<IIIII', 0, 0, 0, len(f), len(f)) + f))
    return b''.join(out)


def fixture_segments():
    """The synthetic trading day. Expected GME bars (America/New_York):
        09:30  O 27.4  H 27.6  L 27.35  C 27.5   V 760   (odd-lot 99.00 print and broken 27.90 trade excluded)
        09:31  O/H/L/C 27.55                     V 105   (volume includes a 0x60 odd-lot extended print)
    No bar for 08:00 (Form T only) or 09:32 (odd lot only)."""
    return [
        segment(1, []),                                                                      # pre-open heartbeat
        segment(1, [quote('GME', et(7, 59, 0))]),                                            # quote ignored
        segment(2, [trade('GME', et(8, 0, 5), 100, '27.50', 900, flags=0x40)]),              # Form T: no price
        segment(3, [trade('AAPL', et(9, 30, 0), 100, '250.00', 901),                          # unrequested symbol
                    trade('GME', et(9, 30, 1), 100, '27.40', 1),                              # open
                    quote('GME', et(9, 30, 1))]),
        segment(6, [trade('GME', et(9, 30, 10), 200, '27.60', 2, flags=0x80)]),             # ISO: eligible, high
        segment(7, [trade('GME', et(9, 30, 20), 10, '99.00', 3, flags=0x20)]),              # odd lot: volume only
        segment(8, [trade('GME', et(9, 30, 30), 300, '27.35', 4, flags=0x10)]),             # TT exempt: low
        segment(9, [trade('GME', et(9, 30, 40), 100, '27.90', 5)]),                         # broken below
        segment(10, [trade('GME', et(9, 30, 59, 999_999_999), 150, '27.50', 6, flags=0x08)]),  # cross: close
        # sequence 11 never arrives -> one gap of one message
        segment(12, [trade('GME', et(9, 31, 0), 100, '27.55', 7)]),                         # minute boundary
        segment(12, [trade('GME', et(9, 31, 0), 100, '27.55', 7)]),                         # duplicate packet
        segment(13, [trade('GME', et(9, 31, 30), 5, '1.00', 8, flags=0x60)]),               # odd lot + Form T
        segment(14, [trade('GME', et(9, 32, 15), 7, '27.60', 9, flags=0x20)]),              # odd-lot-only minute
        segment(15, [trade('SPY', et(9, 45, 0), 40, '777.1234', 100),
                     trade('SPY', et(9, 45, 30), 60, '774.50', 101)]),
        segment(17, [brk('GME', et(9, 33, 0), 100, '27.90', 5)]),                           # break trade 5
        segment(18, []),                                                                     # heartbeat
        segment(1, [trade('GME', et(9, 34, 0), 100, '50.00', 999)], protocol=0x8004),       # other protocol
    ]


EXPECTED_GME = (
    'time,open,high,low,close,volume,symbol\n'
    '2026-10-14T09:30:00-04:00,27.4,27.6,27.35,27.5,760,GME\n'
    '2026-10-14T09:31:00-04:00,27.55,27.55,27.55,27.55,105,GME\n'
)
EXPECTED_SPY = (
    'time,open,high,low,close,volume,symbol\n'
    '2026-10-14T09:45:00-04:00,777.1234,777.1234,774.5,774.5,100,SPY\n'
)


def parse(capture, block_size=None, symbols=('GME', 'SPY')):
    p = tool.TopsParser(list(symbols))
    if block_size is None:
        p.feed(capture)
    else:
        for i in range(0, len(capture), block_size):
            p.feed(capture[i:i + block_size])
    return p


class EasternTime(unittest.TestCase):
    def test_dst_boundaries_2026(self):
        self.assertEqual(tool.eastern_iso(calendar.timegm((2026, 3, 8, 6, 59, 0))), '2026-03-08T01:59:00-05:00')
        self.assertEqual(tool.eastern_iso(calendar.timegm((2026, 3, 8, 7, 0, 0))), '2026-03-08T03:00:00-04:00')
        self.assertEqual(tool.eastern_iso(calendar.timegm((2026, 11, 1, 5, 59, 0))), '2026-11-01T01:59:00-04:00')
        self.assertEqual(tool.eastern_iso(calendar.timegm((2026, 11, 1, 6, 0, 0))), '2026-11-01T01:00:00-05:00')
        self.assertEqual(tool.eastern_iso(calendar.timegm((2026, 1, 15, 14, 30, 0))), '2026-01-15T09:30:00-05:00')
        self.assertEqual(tool.eastern_iso(calendar.timegm((2026, 10, 14, 13, 30, 0))), '2026-10-14T09:30:00-04:00')

    def test_price_format_exact(self):
        self.assertEqual(tool.format_price(px('777.1234')), '777.1234')
        self.assertEqual(tool.format_price(px('774.50')), '774.5')
        self.assertEqual(tool.format_price(px('27')), '27')
        self.assertEqual(tool.format_price(1), '0.0001')


class Aggregation(unittest.TestCase):
    def setUp(self):
        self.frames = [udp_frame(s) for s in fixture_segments()]
        self.capture = pcap(self.frames)

    def test_exact_ohlcv_and_eligibility(self):
        p = parse(self.capture)
        self.assertEqual(tool.bars_csv('GME', p.bars('GME', '2026-10-14')[0]).decode(), EXPECTED_GME)
        self.assertEqual(tool.bars_csv('SPY', p.bars('SPY', '2026-10-14')[0]).decode(), EXPECTED_SPY)
        _, st = p.bars('GME', '2026-10-14')
        # trade ids 900, 1..9; the duplicate packet of id 7 is dropped by IEX-TP sequence number
        self.assertEqual(st['trade_reports_received'], 10)
        self.assertEqual(st['trade_reports_unique'], 10)
        self.assertEqual(st['trades_broken_removed'], 1)          # id 5
        self.assertEqual(st['trades_after_breaks'], 9)
        self.assertEqual(st['price_eligible_trades'], 5)          # ids 1, 2, 4, 6, 7
        self.assertEqual(st['price_ineligible_trades'], 4)        # ids 900 (T), 3 (I), 8 (T+I), 9 (I)
        self.assertEqual(st['price_ineligible_by_reason'],
                         {'extended_hours': 1, 'odd_lot': 2, 'extended_hours_and_odd_lot': 1})
        self.assertEqual(st['volume_in_bars'], 760 + 105)
        self.assertEqual(st['volume_in_minutes_without_price_eligible_trade'], 100 + 7)
        self.assertEqual(st['minutes_without_price_eligible_trade'], 2)
        self.assertEqual(st['trade_breaks_unmatched'], 0)
        cap = p.stats
        self.assertEqual(cap['duplicate_messages_skipped'], 1)
        self.assertEqual(cap['sequence_gaps'], 1)
        self.assertEqual(cap['sequence_gap_messages'], 1)
        self.assertEqual(cap['iextp_segments_other_protocol'], 1)
        self.assertEqual(cap['iextp_heartbeats'], 2)
        self.assertEqual(cap['iextp_sessions'], [SESSION])
        self.assertEqual(cap['iextp_first_sequence'], 1)
        self.assertEqual(cap['iextp_last_sequence'], 17)
        self.assertEqual(cap['messages'], 17 - 1)                 # seq 1..17 minus the missing seq 11

    def test_streaming_block_boundaries_do_not_matter(self):
        whole = parse(self.capture)
        for size in (1, 7, 64, 333):
            chunked = parse(self.capture, block_size=size)
            for sym in ('GME', 'SPY'):
                self.assertEqual(chunked.bars(sym)[0], whole.bars(sym)[0], (sym, size))

    def test_pcapng_framing_matches_pcap(self):
        p = parse(pcapng(self.frames), block_size=50)
        self.assertEqual(p.stats['capture_format'], 'pcapng')
        self.assertEqual(tool.bars_csv('GME', p.bars('GME')[0]).decode(), EXPECTED_GME)
        self.assertEqual(tool.bars_csv('SPY', p.bars('SPY')[0]).decode(), EXPECTED_SPY)

    def test_fast_path_equals_generic_path(self):
        """Little-endian pcap / pcap-ng frames take the fixed-offset fast path; big-endian pcap
        always takes the generic path. Bars and every capture statistic must agree."""
        generic = parse(pcap(self.frames, big_endian=True), block_size=97)
        self.assertEqual(generic.stats['capture_format'], 'pcap')
        for fast in (parse(self.capture, block_size=97), parse(pcapng(self.frames), block_size=97)):
            for sym in ('GME', 'SPY'):
                self.assertEqual(fast.bars(sym), generic.bars(sym))
            keys = set(generic.stats) - {'capture_format', 'decompressed_bytes', 'linktype'}
            self.assertEqual({k: fast.stats[k] for k in keys}, {k: generic.stats[k] for k in keys})

    def test_unrequested_symbol_ignored(self):
        p = parse(self.capture, symbols=('AAPL',))
        bars, st = p.bars('AAPL')
        self.assertEqual([(b['open'], b['volume']) for b in bars], [(px('250'), 100)])
        self.assertEqual(st['trade_reports_received'], 1)

    def test_cli_end_to_end_gzip_with_sidecar(self):
        tmp = Path(tempfile.mkdtemp(prefix='iex-hist-test-'))
        try:
            src = tmp / 'synthetic_fixture.pcap.gz'
            src.write_bytes(gzip.compress(self.capture))
            out = tmp / 'out'
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                tool.main(['--file', str(src), '--file-date', '2026-10-14', '--out', str(out), '--symbols', 'GME,SPY'])
            csv = out / 'GME_IEX-TOPS_20261014_1m.csv'
            self.assertEqual(csv.read_bytes().decode(), EXPECTED_GME)
            side = json.loads((out / (csv.name + '.provenance.json')).read_text(encoding='utf-8'))
            self.assertEqual(side['csv_sha256'], hashlib.sha256(csv.read_bytes()).hexdigest())
            self.assertTrue(side['source']['complete_day'])
            self.assertTrue(side['source']['gzip_stream_complete'])
            self.assertEqual(side['source']['capture']['capture_format'], 'pcap')
            self.assertEqual(side['attribution'], tool.ATTRIBUTION)
            self.assertIn('0x40', side['eligibility_rule'])
            self.assertEqual(side['day_from_bars']['high'], '27.6')
            self.assertLessEqual(len(side['suggested_source_label']), 160)
            # --max-bytes guard: a truncated read is labelled partial, never complete.
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                tool.main(['--file', str(src), '--file-date', '2026-10-14', '--out', str(tmp / 'part'),
                           '--max-bytes', '200'])
            part = json.loads((tmp / 'part' / 'SPY_IEX-TOPS_20261014_1m.csv.provenance.json').read_text(encoding='utf-8'))
            self.assertFalse(part['source']['complete_day'])
            self.assertEqual(part['source']['compressed_bytes_streamed'], 200)
            self.assertIn('PARTIAL', part['source']['note'])
        finally:
            shutil.rmtree(tmp)


if __name__ == '__main__':
    print(SYNTHETIC_LABEL)
    unittest.main(verbosity=2)
