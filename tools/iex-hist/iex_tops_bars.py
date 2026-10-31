#!/usr/bin/env python3
"""IEX HIST TOPS 1.6 -> 1-minute OHLCV bars for OpenCandle's local CSV import.

Original OpenCandle tool (stdlib only). It streams one trading day's IEX HIST
TOPS capture (a gzip'd pcap or pcap-ng file of the IEX-TP multicast feed) over
HTTPS, decompresses it on the fly, decodes IEX-TP segments and TOPS Trade Report
(0x54) and Trade Break (0x42) messages for the requested symbols, and writes one
CSV of 1-minute bars per symbol plus a provenance sidecar JSON. The multi-GB
capture is never written to disk.

Field layout and eligibility follow the IEX TOPS Specification v1.66 (TOPS 1.6,
Message Protocol ID 0x8003, all binary fields little endian):

  Trade Report 'T' (0x54) / Trade Break 'B' (0x42), 38 bytes:
    0 type(1) 1 sale condition flags(1) 2 timestamp int64 ns since epoch UTC(8)
    10 symbol(8, space padded) 18 size uint32(4) 22 price int64, 4 implied
    decimals(8) 30 trade id int64(8)

  Sale condition flags (Appendix A): 0x80 ISO, 0x40 extended hours (Form T),
  0x20 odd lot, 0x10 trade-through exempt, 0x08 single-price cross.
  Appendix A "Trade Eligibility Guidelines": a trade is Last Sale and High/Low
  eligible only when the Extended Hours flag AND the Odd Lot flag are both 0
  (ISO, trade-through-exempt and cross flags may be 0 or 1). Every trade is
  Volume eligible.

Bar rule implemented here (see README.md):
  * open/high/low/close come only from Last Sale / High-Low eligible trades
    (flags & 0x60 == 0), in feed order (spec: per symbol and message type the
    timestamps never decrease);
  * a bar exists only for a minute holding at least one such trade (no price is
    ever invented);
  * the bar's volume is the sum of ALL non-broken trades in that minute
    (spec: every trade is volume eligible), so odd lots count toward volume;
  * volume of minutes that have no price-eligible trade (pre/post-market Form T
    minutes, odd-lot-only minutes) cannot be placed in a bar and is reported in
    the sidecar instead;
  * a Trade Break removes the referenced Trade ID entirely;
  * duplicate IEX-TP messages (sequence numbers already seen) are skipped and a
    repeated Trade ID is counted once.
Bars are keyed by their start minute in America/New_York and written as ISO
8601 timestamps with an explicit UTC offset.
"""
from __future__ import annotations

import argparse
import bisect
import calendar
import datetime as dt
import hashlib
import http.client
import json
import os
import queue
import struct
import sys
import threading
import time
import urllib.error
import urllib.request
import zlib
from pathlib import Path

TOOL_NAME = 'OpenCandle iex-hist converter'
TOOL_VERSION = '1.0.0'
LISTING_URL = 'https://iextrading.com/api/1.0/hist'
TERMS_URL = 'https://www.iex.io/legal/hist-data-terms'
SPEC_URL = 'https://www.iex.io/documents/tops-v1-66'
ATTRIBUTION = ('Data provided for free by IEX. By accessing or using IEX Historical Data, '
               'you agree to the IEX Historical Data Terms of Use.')
USER_AGENT = f'OpenCandle-iex-hist/{TOOL_VERSION} (getopencandle.com; local converter; python-urllib)'
REPO_ROOT = Path(__file__).resolve().parents[2]

TOPS_PROTOCOL_ID = 0x8003          # TOPS 1.6 on IEX-TP
MSG_TRADE_REPORT = 0x54            # 'T'
MSG_TRADE_BREAK = 0x42             # 'B'
TRADE_MSG_LEN = 38
FLAG_ISO = 0x80
FLAG_EXTENDED_HOURS = 0x40
FLAG_ODD_LOT = 0x20
FLAG_TRADE_THROUGH_EXEMPT = 0x10
FLAG_SINGLE_PRICE_CROSS = 0x08
PRICE_INELIGIBLE_MASK = FLAG_EXTENDED_HOURS | FLAG_ODD_LOT

ELIGIBILITY_RULE = (
    'IEX TOPS 1.6 Appendix A Trade Eligibility Guidelines: open/high/low/close use only trades whose '
    'Extended Hours flag (0x40, Form T) and Odd Lot flag (0x20) are both 0 (ISO 0x80, trade-through-exempt '
    '0x10 and single-price-cross 0x08 may be 0 or 1). A bar exists only for a minute with at least one such '
    'trade. Every trade is volume eligible, so bar volume sums all non-broken trades in that minute, odd lots '
    'included. Volume in minutes without a price-eligible trade is reported here, not placed in a bar. '
    'Trade Break messages remove the referenced Trade ID.')

_PCAP_MAGIC = {
    b'\xd4\xc3\xb2\xa1': '<', b'\x4d\x3c\xb2\xa1': '<',   # little endian, usec / nsec
    b'\xa1\xb2\xc3\xd4': '>', b'\xa1\xb2\x3c\x4d': '>',   # big endian, usec / nsec
}
_PCAPNG_SHB = 0x0A0D0D0A
LINKTYPE_ETHERNET = 1
LINKTYPE_RAW = (101, 228)          # raw IPv4
LINKTYPE_LINUX_SLL = 113

_TP = struct.Struct('<BBHIIHHqq')   # IEX-TP header fields up to First Message Sequence Number
_U16 = struct.Struct('<H').unpack_from
# Fast-path view of the common frame shape, Ethernet II + IPv4 (IHL 5) + UDP + IEX-TP header, read
# little endian at fixed offsets from the start of the Ethernet header: ethertype (LE view of the
# big-endian 0x0800, i.e. 0x0008), IPv4 version/IHL, flags+fragment offset (LE view), IP protocol,
# UDP length (LE view, byte-swapped on use), IEX-TP version, Message Protocol ID, Session ID,
# Payload Length, Message Count, First Message Sequence Number. 74 bytes.
_FRAME_VIEW = '12xHB5xHxB14xH2xBxH4xIHH8xq'
_PCAPNG_EPB_FAST = struct.Struct('<II12xI4x' + _FRAME_VIEW)   # block type, block length, captured length
_PCAP_LE_FAST = struct.Struct('<8xI4x' + _FRAME_VIEW)         # captured length (little-endian pcap)
assert _PCAPNG_EPB_FAST.size == 102 and _PCAP_LE_FAST.size == 90
_TRADE = struct.Struct('<q8xIqq').unpack_from   # timestamp, (symbol), size, price, trade id; from msg offset 2


# ----------------------------------------------------------------------------- time

_DST_CACHE: dict[int, tuple[int, int]] = {}


def _dst_bounds(year: int) -> tuple[int, int]:
    """US Eastern DST for `year` (Energy Policy Act of 2005 rules, in force since 2007):
    starts the second Sunday of March at 02:00 EST (07:00 UTC), ends the first Sunday of
    November at 02:00 EDT (06:00 UTC). Returned as UTC epoch seconds [start, end)."""
    if year < 2007:
        raise ValueError('US Eastern DST rule implemented for 2007 and later only.')
    bounds = _DST_CACHE.get(year)
    if bounds is None:
        march = dt.date(year, 3, 1)
        second_sunday = march + dt.timedelta(days=(6 - march.weekday()) % 7 + 7)
        november = dt.date(year, 11, 1)
        first_sunday = november + dt.timedelta(days=(6 - november.weekday()) % 7)
        start = calendar.timegm((second_sunday.year, 3, second_sunday.day, 7, 0, 0))
        end = calendar.timegm((first_sunday.year, 11, first_sunday.day, 6, 0, 0))
        bounds = _DST_CACHE[year] = (start, end)
    return bounds


def eastern_offset_seconds(utc_seconds: int) -> int:
    start, end = _dst_bounds(time.gmtime(utc_seconds).tm_year)
    return -4 * 3600 if start <= utc_seconds < end else -5 * 3600


def eastern_iso(utc_seconds: int) -> str:
    """ISO 8601 America/New_York wall time with explicit offset, whole seconds."""
    offset = eastern_offset_seconds(utc_seconds)
    t = time.gmtime(utc_seconds + offset)
    sign = '-' if offset < 0 else '+'
    hours, rem = divmod(abs(offset), 3600)
    return (f'{t.tm_year:04d}-{t.tm_mon:02d}-{t.tm_mday:02d}T{t.tm_hour:02d}:{t.tm_min:02d}:{t.tm_sec:02d}'
            f'{sign}{hours:02d}:{rem // 60:02d}')


def eastern_date(utc_seconds: int) -> str:
    return eastern_iso(utc_seconds)[:10]


def format_price(price: int) -> str:
    """Exact plain decimal from a TOPS Price (int64 with 4 implied decimals); no float rounding."""
    whole, frac = divmod(abs(price), 10000)
    text = f'{whole}.{frac:04d}'.rstrip('0').rstrip('.')
    return ('-' + text) if price < 0 else text


# ----------------------------------------------------------------------------- parser

class TopsParser:
    """Incremental decoder: feed() arbitrary consecutive byte blocks of an uncompressed
    pcap / pcap-ng capture, then call bars()."""

    def __init__(self, symbols: list[str]):
        if not symbols:
            raise ValueError('At least one symbol is required.')
        self.symbols = list(symbols)
        self.want = {}
        for s in self.symbols:
            raw = s.encode('ascii')
            if not 1 <= len(raw) <= 8 or s != s.upper().strip():
                raise ValueError(f'Symbol {s!r} must be 1-8 upper-case ASCII characters.')
            self.want[raw.ljust(8, b' ')] = s
        self.patterns = list(self.want)
        self.trades: dict[str, list[tuple]] = {s: [] for s in self.symbols}
        self.breaks: dict[str, list[tuple]] = {s: [] for s in self.symbols}
        self._buf = b''
        self._fmt: str | None = None           # 'pcap' | 'pcapng'
        self._endian = '<'
        self._linktype = None
        self._ng_links: list[int] = []
        self._sessions: dict[int, int] = {}    # IEX-TP session id -> next expected sequence number
        self._cur_session: int | None = None   # session of the most recent segment
        self._ng_fast = False                  # pcap-ng fast path enabled (LE, one Ethernet interface)
        self._last_tp: int | None = None
        self.stats = {
            'capture_format': None, 'linktype': None, 'decompressed_bytes': 0,
            'frames': 0, 'frames_not_udp_ipv4': 0, 'ip_fragments_skipped': 0,
            'iextp_segments': 0, 'iextp_segments_other_protocol': 0, 'iextp_heartbeats': 0,
            'iextp_sessions': [], 'iextp_first_sequence': None, 'iextp_last_sequence': None,
            'messages': 0, 'duplicate_messages_skipped': 0, 'sequence_gap_messages': 0, 'sequence_gaps': 0,
            'malformed_segments': 0, 'segments_decoded': 0,
            'trade_reports_selected': 0, 'trade_breaks_selected': 0,
            'first_send_time_ns': None, 'last_send_time_ns': None, 'pcapng_blocks_other': 0,
        }

    # -- framing -------------------------------------------------------------------------
    def feed(self, block: bytes) -> None:
        self.stats['decompressed_bytes'] += len(block)
        data = self._buf + block if self._buf else block
        pos = 0
        if self._fmt is None:
            if len(data) < 24:
                self._buf = data
                return
            magic = data[:4]
            if magic in _PCAP_MAGIC:
                self._fmt, self._endian = 'pcap', _PCAP_MAGIC[magic]
                self._linktype = struct.unpack_from(self._endian + 'I', data, 20)[0] & 0x0FFFFFFF
                self.stats['capture_format'] = 'pcap'
                self.stats['linktype'] = self._linktype
                pos = 24
            elif struct.unpack_from('<I', data, 0)[0] == _PCAPNG_SHB:
                self._fmt = 'pcapng'
                self.stats['capture_format'] = 'pcapng'
            else:
                raise ValueError('Input is neither pcap nor pcap-ng (after gzip decompression).')
        self._last_tp = None
        pos = self._parse_pcap(data, pos) if self._fmt == 'pcap' else self._parse_pcapng(data, pos)
        if self._last_tp is not None:   # IEX-TP Send Time of the last segment in this block
            self.stats['last_send_time_ns'] = struct.unpack_from('<q', data, self._last_tp + 32)[0]
        self._buf = data[pos:]

    def _hits(self, data: bytes) -> list[int]:
        """Offsets of every occurrence of a requested (space padded) symbol in the block. Any
        Trade Report / Trade Break for a requested symbol necessarily contains these bytes, so
        only frames containing a hit need their messages decoded; all frames are still framed
        and sequence-accounted."""
        hits: list[int] = []
        for pat in self.patterns:
            i = data.find(pat)
            while i >= 0:
                hits.append(i)
                i = data.find(pat, i + 1)
        if len(self.patterns) > 1:
            hits.sort()
        return hits

    def _flush_fast(self, session, expected, segments, messages, heartbeats, last_tp) -> None:
        """Fold the fast-path counters (kept in locals for speed) back into the shared state."""
        st = self.stats
        if session is not None:
            self._sessions[session] = expected
            if messages:
                st['iextp_last_sequence'] = expected - 1
        st['iextp_segments'] += segments
        st['messages'] += messages
        st['iextp_heartbeats'] += heartbeats
        if last_tp is not None:
            self._last_tp = last_tp

    def _parse_pcapng(self, data: bytes, pos: int) -> int:
        n = len(data)
        hits = self._hits(data)
        nh, hi = len(hits), 0
        frames = 0
        fast_unpack = _PCAPNG_EPB_FAST.unpack_from
        session = self._cur_session
        expected = self._sessions.get(session) if session is not None else None
        segs = msgs = beats = 0
        last_tp = None
        while pos + 12 <= n:
            # Fast path: little-endian Enhanced Packet Block, single Ethernet interface, IPv4/UDP
            # IEX-TP TOPS segment continuing the current session with the next expected sequence.
            if self._ng_fast and pos + 102 <= n:
                (btype, blen, cap, ethertype, verihl, frag, ipproto, udplen,
                 tpver, proto, sess, plen, count, first) = fast_unpack(data, pos)
                end = pos + blen
                if (btype == 6 and end <= n and blen >= 104 and not blen & 3 and cap >= 82
                        and ethertype == 0x0008 and verihl == 0x45 and not frag & 0xFF3F and ipproto == 17
                        and tpver == 1 and proto == TOPS_PROTOCOL_ID and sess == session and first == expected):
                    frames += 1
                    segs += 1
                    expected = first + count
                    p = pos + 28
                    last_tp = p + 42
                    if hi < nh and hits[hi] < end:
                        hi = bisect.bisect_left(hits, end, hi)
                        if count:
                            udp_len = ((udplen & 0xFF) << 8) | (udplen >> 8)
                            self._decode(data, p + 42, min(p + cap, p + 34 + udp_len), plen, count, first, 0)
                    if count:
                        msgs += count
                    else:
                        beats += 1
                    pos = end
                    continue
            # Generic path for everything else (other block types, gaps, duplicates, odd frames).
            e = self._endian
            btype, blen = struct.unpack_from(e + 'II', data, pos)
            if btype == _PCAPNG_SHB:
                bom = data[pos + 8:pos + 12]
                e = self._endian = '<' if bom == b'\x4d\x3c\x2b\x1a' else '>'
                btype, blen = struct.unpack_from(e + 'II', data, pos)
            if blen < 12 or blen % 4:
                raise ValueError(f'Corrupt pcap-ng block length {blen} at offset {pos}.')
            end = pos + blen
            if end > n:
                break
            self._flush_fast(session, expected, segs, msgs, beats, last_tp)
            segs = msgs = beats = 0
            last_tp = None
            if btype == _PCAPNG_SHB:
                self._ng_links = []
            elif btype == 1:   # Interface Description Block
                self._ng_links.append(struct.unpack_from(e + 'H', data, pos + 8)[0])
                self.stats['linktype'] = self._ng_links[-1]
            elif btype in (6, 3, 2):   # Enhanced / Simple / obsolete Packet Block
                if btype == 6:
                    iface = struct.unpack_from(e + 'I', data, pos + 8)[0]
                    cap = struct.unpack_from(e + 'I', data, pos + 20)[0]
                    p = pos + 28
                elif btype == 3:
                    iface, cap, p = 0, min(struct.unpack_from(e + 'I', data, pos + 8)[0], blen - 16), pos + 12
                else:
                    iface = struct.unpack_from(e + 'H', data, pos + 8)[0]
                    cap = struct.unpack_from(e + 'I', data, pos + 20)[0]
                    p = pos + 28
                link = self._ng_links[iface] if iface < len(self._ng_links) else LINKTYPE_ETHERNET
                frames += 1
                parse = hi < nh and hits[hi] < end
                if parse:
                    hi = bisect.bisect_left(hits, end, hi)
                loc = self._locate_udp(data, p, min(p + cap, end), link)
                if loc is not None:
                    self._segment(data, loc[0], loc[1], parse)
            else:
                self.stats['pcapng_blocks_other'] += 1
            self._ng_fast = self._endian == '<' and self._ng_links == [LINKTYPE_ETHERNET]
            session = self._cur_session
            expected = self._sessions.get(session) if session is not None else None
            pos = end
        self._flush_fast(session, expected, segs, msgs, beats, last_tp)
        self.stats['frames'] += frames
        return pos

    def _parse_pcap(self, data: bytes, pos: int) -> int:
        n = len(data)
        hits = self._hits(data)
        nh, hi = len(hits), 0
        frames = 0
        u32 = struct.Struct(self._endian + 'I').unpack_from
        fast = self._endian == '<' and self._linktype == LINKTYPE_ETHERNET
        fast_unpack = _PCAP_LE_FAST.unpack_from
        session = self._cur_session
        expected = self._sessions.get(session) if session is not None else None
        segs = msgs = beats = 0
        last_tp = None
        while pos + 16 <= n:
            if fast and pos + 90 <= n:
                (incl, ethertype, verihl, frag, ipproto, udplen,
                 tpver, proto, sess, plen, count, first) = fast_unpack(data, pos)
                end = pos + 16 + incl
                if (end <= n and incl >= 82 and ethertype == 0x0008 and verihl == 0x45 and not frag & 0xFF3F
                        and ipproto == 17 and tpver == 1 and proto == TOPS_PROTOCOL_ID
                        and sess == session and first == expected):
                    frames += 1
                    segs += 1
                    expected = first + count
                    p = pos + 16
                    last_tp = p + 42
                    if hi < nh and hits[hi] < end:
                        hi = bisect.bisect_left(hits, end, hi)
                        if count:
                            udp_len = ((udplen & 0xFF) << 8) | (udplen >> 8)
                            self._decode(data, p + 42, min(end, p + 34 + udp_len), plen, count, first, 0)
                    if count:
                        msgs += count
                    else:
                        beats += 1
                    pos = end
                    continue
            incl = u32(data, pos + 8)[0]
            p = pos + 16
            end = p + incl
            if end > n:
                break
            self._flush_fast(session, expected, segs, msgs, beats, last_tp)
            segs = msgs = beats = 0
            last_tp = None
            frames += 1
            parse = hi < nh and hits[hi] < end
            if parse:
                hi = bisect.bisect_left(hits, end, hi)
            loc = self._locate_udp(data, p, end, self._linktype)
            if loc is not None:
                self._segment(data, loc[0], loc[1], parse)
            session = self._cur_session
            expected = self._sessions.get(session) if session is not None else None
            pos = end
        self._flush_fast(session, expected, segs, msgs, beats, last_tp)
        self.stats['frames'] += frames
        return pos

    def _locate_udp(self, data: bytes, p: int, end: int, link) -> tuple[int, int] | None:
        """Return (udp payload start, end) for an IPv4/UDP frame, else None (counted)."""
        if link == LINKTYPE_ETHERNET:
            q = p + 12
            if q + 2 > end:
                self.stats['frames_not_udp_ipv4'] += 1
                return None
            ethertype = (data[q] << 8) | data[q + 1]
            q += 2
            while ethertype in (0x8100, 0x88A8) and q + 4 <= end:   # VLAN tags
                ethertype = (data[q + 2] << 8) | data[q + 3]
                q += 4
        elif link in LINKTYPE_RAW:
            q, ethertype = p, 0x0800
        elif link == LINKTYPE_LINUX_SLL:
            q = p + 16
            ethertype = (data[p + 14] << 8) | data[p + 15] if p + 16 <= end else 0
        else:
            self.stats['frames_not_udp_ipv4'] += 1
            return None
        if ethertype != 0x0800 or q + 20 > end or data[q] >> 4 != 4:
            self.stats['frames_not_udp_ipv4'] += 1
            return None
        ihl = (data[q] & 0x0F) * 4
        if data[q + 9] != 17 or ihl < 20 or q + ihl + 8 > end:
            self.stats['frames_not_udp_ipv4'] += 1
            return None
        if (data[q + 6] & 0x3F) or data[q + 7]:   # more-fragments flag or nonzero fragment offset
            self.stats['ip_fragments_skipped'] += 1
            return None
        u = q + ihl
        udp_len = (data[u + 4] << 8) | data[u + 5]
        return u + 8, min(end, u + udp_len)

    # -- IEX-TP + TOPS ---------------------------------------------------------------
    def _segment(self, data: bytes, tp: int, tpend: int, parse: bool) -> None:
        """Generic IEX-TP segment handler: sequence accounting (gaps, duplicates, sessions,
        heartbeats) and, when the frame holds a symbol hit, message decoding."""
        st = self.stats
        if tp + 40 > tpend:
            st['malformed_segments'] += 1
            return
        version, _, proto, _chan, session, plen, count, _off, first = _TP.unpack_from(data, tp)
        if version != 1 or proto != TOPS_PROTOCOL_ID:
            st['iextp_segments_other_protocol'] += 1
            return
        st['iextp_segments'] += 1
        self._last_tp = tp
        self._cur_session = session
        expected = self._sessions.get(session)
        if expected is None:
            expected = first
            st['iextp_sessions'].append(session)
            if st['iextp_first_sequence'] is None:
                st['iextp_first_sequence'] = first
                st['first_send_time_ns'] = struct.unpack_from('<q', data, tp + 32)[0]
        skip = 0
        if first > expected:
            st['sequence_gaps'] += 1
            st['sequence_gap_messages'] += first - expected
        elif first < expected:
            skip = min(count, expected - first)
            st['duplicate_messages_skipped'] += skip
        if first + count > expected:
            self._sessions[session] = first + count
            if count:
                st['iextp_last_sequence'] = first + count - 1
        else:
            self._sessions[session] = expected
        if count == 0:
            st['iextp_heartbeats'] += 1
            return
        st['messages'] += count - skip
        if parse and skip < count:
            self._decode(data, tp, tpend, plen, count, first, skip)

    def _decode(self, data: bytes, tp: int, tpend: int, plen: int, count: int, first: int, skip: int) -> None:
        """Decode the messages of one IEX-TP segment; keep Trade Reports / Trade Breaks for the
        requested symbols. Messages before index `skip` were already delivered (duplicates)."""
        st = self.stats
        st['segments_decoded'] += 1
        i = tp + 40
        lim = min(tpend, i + plen)
        want = self.want
        for k in range(count):
            if i + 2 > lim:
                st['malformed_segments'] += 1
                return
            ml = _U16(data, i)[0]
            m = i + 2
            i = m + ml
            if i > lim:
                st['malformed_segments'] += 1
                return
            if k < skip or ml < TRADE_MSG_LEN:
                continue
            mtype = data[m]
            if mtype != MSG_TRADE_REPORT and mtype != MSG_TRADE_BREAK:
                continue
            sym = want.get(data[m + 10:m + 18])
            if sym is None:
                continue
            ts, size, price, trade_id = _TRADE(data, m + 2)
            rec = (first + k, ts, data[m + 1], size, price, trade_id)
            if mtype == MSG_TRADE_REPORT:
                self.trades[sym].append(rec)
                st['trade_reports_selected'] += 1
            else:
                self.breaks[sym].append(rec)
                st['trade_breaks_selected'] += 1

    # -- aggregation -------------------------------------------------------------------
    def bars(self, symbol: str, file_date: str | None = None) -> tuple[list[dict], dict]:
        """1-minute bars and statistics for one symbol, from everything fed so far."""
        seen: dict[int, tuple] = {}
        duplicates = conflicts = invalid = 0
        unique = []
        for rec in self.trades[symbol]:
            prior = seen.get(rec[5])
            if prior is not None:
                if prior[1:] == rec[1:]:
                    duplicates += 1
                else:
                    conflicts += 1
                continue
            if rec[3] <= 0 or rec[4] <= 0:
                invalid += 1
                continue
            seen[rec[5]] = rec
            unique.append(rec)
        break_ids = {rec[5] for rec in self.breaks[symbol]}
        broken = [rec for rec in unique if rec[5] in break_ids]
        live = [rec for rec in unique if rec[5] not in break_ids]
        live.sort(key=lambda r: (r[1], r[0]))   # timestamp, then feed sequence (stable chronology)
        minutes: dict[int, list] = {}
        counts = {'extended_hours': 0, 'odd_lot': 0, 'extended_hours_and_odd_lot': 0}
        flag_counts = {'iso': 0, 'trade_through_exempt': 0, 'single_price_cross': 0}
        eligible_n = 0
        outside_date = 0
        vol_all = vol_eligible = 0
        for seq, ts, flags, size, price, tid in live:
            minute = (ts // 1_000_000_000) // 60 * 60
            if file_date and eastern_date(minute) != file_date:
                outside_date += 1
            b = minutes.get(minute)
            if b is None:
                b = minutes[minute] = [None, None, None, None, 0, 0, 0]   # o h l c vol trades eligible_trades
            b[4] += size
            b[5] += 1
            vol_all += size
            if flags & FLAG_ISO:
                flag_counts['iso'] += 1
            if flags & FLAG_TRADE_THROUGH_EXEMPT:
                flag_counts['trade_through_exempt'] += 1
            if flags & FLAG_SINGLE_PRICE_CROSS:
                flag_counts['single_price_cross'] += 1
            bad = flags & PRICE_INELIGIBLE_MASK
            if bad:
                key = ('extended_hours_and_odd_lot' if bad == PRICE_INELIGIBLE_MASK
                       else 'extended_hours' if bad == FLAG_EXTENDED_HOURS else 'odd_lot')
                counts[key] += 1
                continue
            eligible_n += 1
            vol_eligible += size
            if b[0] is None:
                b[0] = b[1] = b[2] = price
            else:
                if price > b[1]:
                    b[1] = price
                if price < b[2]:
                    b[2] = price
            b[3] = price
            b[6] += 1
        bars = []
        unbarred_volume = unbarred_minutes = 0
        for minute in sorted(minutes):
            o, h, lo, c, vol, ntr, nel = minutes[minute]
            if not nel:
                unbarred_volume += vol
                unbarred_minutes += 1
                continue
            bars.append({'time': minute, 'open': o, 'high': h, 'low': lo, 'close': c, 'volume': vol,
                         'trades': ntr, 'eligible_trades': nel})
        stats = {
            'trade_reports_received': len(self.trades[symbol]),
            'trade_reports_unique': len(unique),
            'duplicate_trade_ids_identical': duplicates,
            'duplicate_trade_ids_conflicting': conflicts,
            'invalid_size_or_price': invalid,
            'trade_breaks_received': len(self.breaks[symbol]),
            'trades_broken_removed': len(broken),
            'trade_breaks_unmatched': len(break_ids - {rec[5] for rec in unique}),
            'trades_after_breaks': len(live),
            'price_eligible_trades': eligible_n,
            'price_ineligible_trades': len(live) - eligible_n,
            'price_ineligible_by_reason': counts,
            'other_flag_counts_informational': flag_counts,
            'trades_outside_file_date_et': outside_date,
            'volume_all_trades': vol_all,
            'volume_price_eligible_trades': vol_eligible,
            'volume_in_bars': vol_all - unbarred_volume,
            'volume_in_minutes_without_price_eligible_trade': unbarred_volume,
            'minutes_without_price_eligible_trade': unbarred_minutes,
            'first_trade_ns': live[0][1] if live else None,
            'last_trade_ns': live[-1][1] if live else None,
        }
        return bars, stats


# ----------------------------------------------------------------------------- output

def bars_csv(symbol: str, bars: list[dict]) -> bytes:
    lines = ['time,open,high,low,close,volume,symbol']
    for b in bars:
        lines.append(','.join((eastern_iso(b['time']), format_price(b['open']), format_price(b['high']),
                               format_price(b['low']), format_price(b['close']), str(b['volume']), symbol)))
    return ('\n'.join(lines) + '\n').encode('utf-8')


def day_summary(bars: list[dict]) -> dict | None:
    if not bars:
        return None
    return {'first_bar': eastern_iso(bars[0]['time']), 'last_bar': eastern_iso(bars[-1]['time']),
            'open': format_price(bars[0]['open']), 'high': format_price(max(b['high'] for b in bars)),
            'low': format_price(min(b['low'] for b in bars)), 'close': format_price(bars[-1]['close']),
            'volume_in_bars': sum(b['volume'] for b in bars)}


def utc_iso(seconds: float | None) -> str | None:
    if seconds is None:
        return None
    return dt.datetime.fromtimestamp(seconds, dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def ns_iso(ns: int | None) -> str | None:
    if ns is None:
        return None
    return dt.datetime.fromtimestamp(ns / 1e9, dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def write_outputs(parser: TopsParser, out_dir: Path, run: dict, file_date_iso: str | None) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    date_tag = (file_date_iso or 'unknown').replace('-', '')
    results = {}
    for symbol in parser.symbols:
        bars, stats = parser.bars(symbol, file_date_iso)
        name = f'{symbol}_IEX-TOPS_{date_tag}_1m.csv'
        payload = bars_csv(symbol, bars)
        csv_path = out_dir / name
        tmp = csv_path.with_suffix('.csv.tmp')
        tmp.write_bytes(payload)
        os.replace(tmp, csv_path)
        sha = hashlib.sha256(payload).hexdigest()
        summary = day_summary(bars)
        sidecar = {
            'schema': 'larryvision.iex-hist.provenance/1',
            'csv_file': name,
            'csv_sha256': sha,
            'csv_bytes': len(payload),
            'symbol': symbol,
            'bars': len(bars),
            'bar_interval': '1m',
            'bar_time_convention': 'Bar start minute, America/New_York wall time, ISO 8601 with explicit UTC offset.',
            'day_from_bars': summary,
            'trades': {(k[:-3] + '_utc' if k.endswith('_ns') else k): (ns_iso(v) if k.endswith('_ns') else v)
                       for k, v in stats.items()},
            'eligibility_rule': ELIGIBILITY_RULE,
            'venue_caveat': ('IEX venue trades only (IEX matched executions; routed executions are not reported). '
                             'Not consolidated tape data: prices, highs, lows and volume differ from consolidated '
                             'bars and sparse minutes are gaps, not zero-volume bars.'),
            'adjustment': 'raw (as traded, unadjusted)',
            'session': ('Form T (extended hours) trades are not price eligible, so bars normally span only the '
                        'regular market session (see day_from_bars for the actual first/last bar); the first and '
                        'last bars are IEX trades, not official opening/closing prices.'),
            'attribution': ATTRIBUTION,
            'terms_url': TERMS_URL,
            'spec': 'IEX TOPS Specification v1.66 (TOPS 1.6, IEX-TP Message Protocol ID 0x8003): ' + SPEC_URL,
            'source': run,
            'suggested_source_label': suggested_label(run, file_date_iso),
            'generator': f'{TOOL_NAME} {TOOL_VERSION}',
        }
        side_path = out_dir / (name + '.provenance.json')
        tmp = side_path.with_suffix('.json.tmp')
        tmp.write_text(json.dumps(sidecar, indent=2) + '\n', encoding='utf-8')
        os.replace(tmp, side_path)
        results[symbol] = {'csv': str(csv_path), 'sha256': sha, 'bars': len(bars), 'day': summary,
                           'eligible': stats['price_eligible_trades'], 'ineligible': stats['price_ineligible_trades'],
                           'broken': stats['trades_broken_removed'], 'sidecar': str(side_path)}
    return results


def suggested_label(run: dict, file_date_iso: str | None) -> str:
    retrieved = (run.get('retrieval_started_utc') or '')[:10] or 'unknown'
    label = (f'IEX HIST TOPS {file_date_iso}, IEX venue trades only, 1-minute bars, retrieved {retrieved}. '
             'Data provided for free by IEX.')
    return label[:160]


# ----------------------------------------------------------------------------- source

def fetch_listing(url: str = LISTING_URL) -> dict:
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode('utf-8'))


def pick_tops(listing: dict, date: str) -> dict:
    """Return the TOPS 1.6 entry for YYYYMMDD, or the most recent one for 'latest'."""
    days = sorted(listing)
    if date != 'latest':
        days = [date] if date in listing else []
    for day in reversed(days):
        for entry in listing[day]:
            if entry.get('feed') == 'TOPS' and entry.get('version') == '1.6':
                return entry
    raise SystemExit(f'No TOPS 1.6 file listed for {date}.')


class Progress:
    def __init__(self, path: Path | None, total: int | None, interval: float = 15.0):
        self.path, self.total, self.interval = path, total, interval
        self.started = time.time()
        self.last = 0.0
        self.compressed = 0
        self.reconnects = 0
        self.parse_seconds = 0.0   # parser thread busy
        self.wait_seconds = 0.0    # parser thread waiting on download/decompression

    def report(self, parser: TopsParser, state: str = 'running', force: bool = False, extra: dict | None = None):
        now = time.time()
        if not force and now - self.last < self.interval:
            return
        self.last = now
        elapsed = now - self.started
        rate = self.compressed / elapsed if elapsed > 0 else 0.0
        doc = {
            'state': state, 'updated_utc': utc_iso(now), 'elapsed_s': round(elapsed, 1),
            'compressed_bytes': self.compressed, 'compressed_total': self.total,
            'percent': round(100.0 * self.compressed / self.total, 2) if self.total else None,
            'mb_per_s': round(rate / 1e6, 2),
            'eta_s': round((self.total - self.compressed) / rate) if self.total and rate > 0 else None,
            'decompressed_bytes': parser.stats['decompressed_bytes'], 'frames': parser.stats['frames'],
            'messages': parser.stats['messages'], 'reconnects': self.reconnects,
            'parse_s': round(self.parse_seconds, 1), 'wait_s': round(self.wait_seconds, 1),
            'trade_reports': {s: len(v) for s, v in parser.trades.items()},
            'feed_time_utc': ns_iso(parser.stats['last_send_time_ns']),
        }
        if extra:
            doc.update(extra)
        line = (f"[{doc['elapsed_s']:>8.1f}s] {doc['compressed_bytes']:,} B"
                f"{' (' + str(doc['percent']) + '%)' if doc['percent'] is not None else ''} "
                f"{doc['mb_per_s']} MB/s parse={doc['parse_s']}s wait={doc['wait_s']}s "
                f"feed={doc['feed_time_utc']} trades={doc['trade_reports']} state={state}")
        print(line, file=sys.stderr, flush=True)
        if self.path:
            tmp = self.path.with_suffix(self.path.suffix + '.tmp')
            tmp.write_text(json.dumps(doc, indent=2) + '\n', encoding='utf-8')
            os.replace(tmp, self.path)


def _open(url: str, offset: int):
    headers = {'User-Agent': USER_AGENT, 'Accept-Encoding': 'identity'}
    if offset:
        headers['Range'] = f'bytes={offset}-'
    resp = urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120)
    if offset:
        crange = resp.headers.get('Content-Range', '')
        if resp.status != 206 or not crange.startswith(f'bytes {offset}-'):
            resp.close()
            raise IOError(f'Server did not honour Range resume at {offset} (status {resp.status}, {crange!r}).')
    return resp


def compressed_chunks(url: str | None, path: Path | None, progress: Progress, max_bytes: int | None,
                      chunk: int = 1 << 20, max_reconnects: int = 3):
    """Yield raw (still gzip'd or plain) bytes from HTTPS or a local file. An HTTPS
    connection that drops is resumed in place with a Range request (same pinned object
    generation), so no byte is downloaded twice."""
    got = 0
    if path is not None:
        with open(path, 'rb') as fh:
            while True:
                want = chunk if max_bytes is None else min(chunk, max_bytes - got)
                if want <= 0:
                    return
                data = fh.read(want)
                if not data:
                    return
                got += len(data)
                progress.compressed = got
                yield data
        return
    resp = _open(url, 0)
    length = resp.headers.get('Content-Length')
    total = int(length) if length is not None else None
    try:
        while True:
            want = chunk if max_bytes is None else min(chunk, max_bytes - got)
            if want <= 0:
                return
            try:
                data = resp.read(want)
                if not data and total is not None and got < total:
                    raise http.client.IncompleteRead(b'', total - got)
            except (OSError, http.client.HTTPException) as exc:
                if progress.reconnects >= max_reconnects:
                    raise
                progress.reconnects += 1
                print(f'connection error at {got:,} bytes ({exc!r}); resuming with Range '
                      f'(attempt {progress.reconnects}/{max_reconnects})', file=sys.stderr, flush=True)
                try:
                    resp.close()
                except Exception:
                    pass
                time.sleep(min(60, 5 * progress.reconnects))
                resp = _open(url, got)
                continue
            if not data:
                return
            got += len(data)
            progress.compressed = got
            yield data
    finally:
        resp.close()


def decompressed_blocks(raw_chunks, state: dict):
    """gzip (single or multi-member) or plain passthrough, streaming."""
    d = None
    plain = None
    for raw in raw_chunks:
        if plain is None:
            plain = raw[:2] != b'\x1f\x8b'
            state['gzip'] = not plain
            if not plain:
                d = zlib.decompressobj(16 + zlib.MAX_WBITS)
        if plain:
            yield raw
            continue
        out = d.decompress(raw)
        while d.eof and d.unused_data:
            rest = d.unused_data
            state['gzip_members'] = state.get('gzip_members', 1) + 1
            d = zlib.decompressobj(16 + zlib.MAX_WBITS)
            out += d.decompress(rest)
        if out:
            yield out
    if d is not None:
        tail = d.flush()
        if tail:
            yield tail
        state['gzip_eof'] = d.eof
    else:
        state['gzip_eof'] = None


def run_pipeline(parser: TopsParser, blocks, progress: Progress, queue_depth: int = 16) -> None:
    """Producer thread downloads + decompresses (both release the GIL); this thread parses."""
    q: queue.Queue = queue.Queue(maxsize=queue_depth)
    done = object()

    def produce():
        try:
            for block in blocks:
                q.put(block)
            q.put(done)
        except BaseException as exc:   # surface network / gzip errors to the parser thread
            q.put(exc)

    worker = threading.Thread(target=produce, name='iex-hist-download', daemon=True)
    worker.start()
    clock = time.perf_counter
    while True:
        t0 = clock()
        item = q.get()
        t1 = clock()
        progress.wait_seconds += t1 - t0
        if item is done:
            break
        if isinstance(item, BaseException):
            raise item
        parser.feed(item)
        progress.parse_seconds += clock() - t1
        progress.report(parser)
    worker.join()


# ----------------------------------------------------------------------------- main

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description='Stream one IEX HIST TOPS 1.6 day and write 1-minute OHLCV CSVs.')
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument('--date', help="Trading day YYYYMMDD from the IEX HIST listing, or 'latest'.")
    src.add_argument('--file', type=Path, help='Local .pcap / .pcap.gz / .pcapng(.gz) capture (tests, re-runs).')
    ap.add_argument('--symbols', default='GME,SPY', help='Comma-separated symbols (default GME,SPY).')
    ap.add_argument('--out', type=Path, help='Output directory (default local-data/imports/iex-<date>[-partial]).')
    ap.add_argument('--max-bytes', type=int, help='Stop after this many compressed bytes (testing guard).')
    ap.add_argument('--progress', type=Path, help='Write a JSON progress file here every --interval seconds.')
    ap.add_argument('--interval', type=float, default=15.0, help='Progress interval in seconds (default 15).')
    ap.add_argument('--file-date', help='YYYY-MM-DD trading date for --file inputs (labels and date check).')
    args = ap.parse_args(argv)

    symbols = [s.strip().upper() for s in args.symbols.split(',') if s.strip()]
    parser = TopsParser(symbols)
    started = time.time()
    run: dict = {'listing_url': None, 'file_url': None, 'local_file': None, 'feed': 'TOPS', 'feed_version': '1.6',
                 'protocol': 'IEXTP1', 'retrieval_started_utc': utc_iso(started)}
    entry = None
    if args.date:
        listing = fetch_listing()
        entry = pick_tops(listing, args.date)
        day = entry['date']
        file_date_iso = f'{day[:4]}-{day[4:6]}-{day[6:]}'
        run.update(listing_url=LISTING_URL, file_url=entry['link'], listed_size_bytes=int(entry['size']),
                   file_date=file_date_iso, feed_version=entry['version'], protocol=entry['protocol'])
        total = int(entry['size'])
    else:
        file_date_iso = args.file_date
        run.update(local_file=str(args.file), file_date=file_date_iso)
        total = args.file.stat().st_size
    if args.max_bytes is not None and args.max_bytes < 1:
        ap.error('--max-bytes must be positive.')
    out_dir = args.out or (REPO_ROOT / 'local-data' / 'imports' /
                           f"iex-{file_date_iso or 'unknown'}{'-partial' if args.max_bytes else ''}")
    progress = Progress(args.progress, min(total, args.max_bytes) if args.max_bytes else total, args.interval)
    progress.started = started
    gz: dict = {}
    raw = compressed_chunks(entry['link'] if entry else None, None if entry else args.file, progress, args.max_bytes)
    try:
        run_pipeline(parser, decompressed_blocks(raw, gz), progress)
    except BaseException as exc:
        progress.report(parser, state=f'failed: {exc!r}', force=True)
        raise
    finished = time.time()
    complete = (args.max_bytes is None and gz.get('gzip_eof') is not False
                and (total is None or progress.compressed == total))
    st = dict(parser.stats)
    st['first_send_time_utc'] = ns_iso(st.pop('first_send_time_ns'))
    st['last_send_time_utc'] = ns_iso(st.pop('last_send_time_ns'))
    st['unparsed_tail_bytes'] = len(parser._buf)
    run.update({
        'retrieval_finished_utc': utc_iso(finished), 'elapsed_seconds': round(finished - started, 1),
        'compressed_bytes_streamed': progress.compressed, 'reconnects_with_range_resume': progress.reconnects,
        'parser_busy_seconds': round(progress.parse_seconds, 1),
        'parser_waiting_on_download_seconds': round(progress.wait_seconds, 1),
        'gzip': gz.get('gzip'), 'gzip_members': gz.get('gzip_members', 1 if gz.get('gzip') else 0),
        'gzip_stream_complete': gz.get('gzip_eof'), 'max_bytes_guard': args.max_bytes, 'complete_day': complete,
        'symbols_requested': symbols, 'capture': st,
        'note': None if complete else 'PARTIAL: stream stopped before the end of the file; bars cover only the part read.',
    })
    results = write_outputs(parser, out_dir, run, file_date_iso)
    progress.report(parser, state='done' if complete else 'done-partial', force=True,
                    extra={'complete_day': complete, 'outputs': results})
    print(json.dumps({'out_dir': str(out_dir), 'complete_day': complete,
                      'compressed_bytes_streamed': progress.compressed,
                      'elapsed_seconds': run['elapsed_seconds'], 'results': results,
                      'suggested_source_label': suggested_label(run, file_date_iso)}, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
