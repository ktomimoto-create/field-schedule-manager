#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""FC の依頼一覧 (lst_detail.php) を Supabase fc_requests へ同期する。

使い方:
  python sync_fc_requests.py              # 直近3日分（定期実行用）
  python sync_fc_requests.py --days 60    # バックフィル（10日刻み・2秒間隔）

環境変数:
  FC_USER / FC_PASS         FC のログインID・パスワード（必須）
  FSM_SUPABASE_URL / FSM_SUPABASE_KEY   省略時は ../frontend/.env.local から読む

設計書: docs/superpowers/specs/2026-09-11-fc-request-autofill-design.md
負荷ルール（厳守）: 照会は10日刻み・2秒間隔。status=6 指定の照会は行わない。
ログイン方式は Daily exclusive possession/tools/fc_taio_plan.py の実績方式。
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

BASE = 'http://fcweb.ftsosa/fc/main/'
ENC = 'cp932'


def log(msg):
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


def die(msg):
    log(f"ERROR: {msg}")
    sys.exit(1)


# ---------- パース（ネットワーク非依存・単体テスト対象） ----------

def date_from_refno(refno):
    """依頼番号の 2〜7 桁目が依頼日 YYMMDD。"""
    m = re.match(r'^\d(\d{2})(\d{2})(\d{2})\d{4}$', refno)
    if not m:
        return None
    return f"20{m.group(1)}-{m.group(2)}-{m.group(3)}"


def _clean(cell_html):
    t = re.sub(r'<[^>]*>', ' ', cell_html)
    t = t.replace('&nbsp;', ' ')
    # 全角スペース(U+3000)は物件名の一部（例: THE　PLACE　KYODO）なので潰さない
    return re.sub(r'\s+', ' ', t, flags=re.ASCII).strip()


def parse_list(html):
    """lst_detail の生 HTML → 行 dict のリスト。
    fc-ops browser/06_bulk_lst_detail.js の FC.parseList を移植。
    No 列ではなく hidden refno を正とする。DOMParser 相当は使わない（巨大HTML対策）。
    列: No|日付|号機|物件名|住所|症状・指示|対応状況|緊急|未連絡|詳細
    """
    out = []
    for chunk in re.split(r'<tr[\s>]', html, flags=re.I)[1:]:
        m = re.search(r'name=["\']?refno["\']?[^>]*value=["\']?(\d+)', chunk, re.I)
        if not m:
            continue
        refno = m.group(1)
        cells = [_clean(c) for c in re.findall(r'<td[^>]*>([\s\S]*?)</td>', chunk, re.I)]
        if len(cells) < 5 or not cells[2]:
            continue
        out.append({
            'refno': refno,
            'unit_number': cells[2],
            'property_name': cells[3],
            'address': cells[4],
            'request_date': date_from_refno(refno),
        })
    return out


# ---------- FC アクセス ----------

def make_opener():
    jar = CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    op.addheaders = [('User-Agent', 'Mozilla/5.0 (fsm_sync_fc_requests)')]
    return op


def fc_post(op, url, data, timeout=45):
    body = urllib.parse.urlencode(data, encoding=ENC, errors='replace').encode('ascii')
    req = urllib.request.Request(url, data=body,
                                 headers={'Content-Type': 'application/x-www-form-urlencoded'})
    with op.open(req, timeout=timeout) as r:
        return r.read().decode(ENC, errors='replace')


def fc_get(op, url, timeout=30):
    with op.open(url, timeout=timeout) as r:
        return r.read().decode(ENC, errors='replace')


def fc_login(op):
    user = os.environ.get('FC_USER')
    pw = os.environ.get('FC_PASS')
    if not user or not pw:
        die('環境変数 FC_USER / FC_PASS を設定してください（SETUP_SYNC.md 参照）')
    fc_get(op, BASE + 'login.php')
    fc_post(op, BASE + 'login.php', {'txt_LoginID': user, 'txt_PassWord': pw})
    if 'menu.php' not in fc_get(op, BASE + 'main.php'):
        die('FC ログイン失敗（ID/パスワードを確認）')
    log(f'FC ログインOK ({user})')


# ---------- Supabase ----------

def supabase_conf():
    url = os.environ.get('FSM_SUPABASE_URL')
    key = os.environ.get('FSM_SUPABASE_KEY')
    if not url or not key:
        env_path = Path(__file__).resolve().parent.parent / 'frontend' / '.env.local'
        if not env_path.exists():
            die('FSM_SUPABASE_URL/KEY 未設定かつ frontend/.env.local が見つかりません')
        kv = dict(l.split('=', 1) for l in env_path.read_text('utf-8').splitlines() if '=' in l)
        url = url or kv.get('VITE_SUPABASE_URL', '').strip()
        key = key or kv.get('VITE_SUPABASE_ANON_KEY', '').strip()
    if not url or not key:
        die('Supabase 接続情報を解決できませんでした')
    return url.rstrip('/'), key


def upsert_rows(rows):
    url, key = supabase_conf()
    total = 0
    for i in range(0, len(rows), 500):
        batch = rows[i:i + 500]
        req = urllib.request.Request(
            f'{url}/rest/v1/fc_requests?on_conflict=refno',
            data=json.dumps(batch).encode('utf-8'),
            headers={
                'apikey': key, 'Authorization': f'Bearer {key}',
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=minimal',
            })
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                if r.status not in (200, 201, 204):
                    die(f'Supabase upsert 失敗: HTTP {r.status}')
        except urllib.error.HTTPError as e:
            die(f'Supabase upsert 失敗: HTTP {e.code} {e.read().decode("utf-8", "replace")[:300]}')
        total += len(batch)
    return total


# ---------- メイン ----------

def yymmdd(d):
    return d.strftime('%y%m%d')


def date_chunks(days):
    """今日から days 日前までを 10 日刻みの (from, to) YYMMDD ペアに分割。"""
    end = dt.date.today()
    start = end - dt.timedelta(days=days)
    out = []
    cur = start
    while cur <= end:
        to = min(cur + dt.timedelta(days=9), end)
        out.append((yymmdd(cur), yymmdd(to)))
        cur = to + dt.timedelta(days=1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--days', type=int, default=3, help='さかのぼる日数（既定3。バックフィルは60など）')
    a = ap.parse_args()

    op = make_opener()
    fc_login(op)

    rows = []
    chunks = date_chunks(a.days)
    for n, (f, t) in enumerate(chunks):
        if n > 0:
            time.sleep(2)  # FC負荷ルール: 連続照会は2秒間隔
        html = fc_post(op, BASE + 'lst_detail.php',
                       {'iraidt_f': f, 'iraidt_t': t, 'iniflg': '0'})
        got = parse_list(html)
        rows.extend(got)
        log(f'lst_detail {f}-{t}: {len(got)} 件')

    if not rows:
        log('対象0件（休日明け等はあり得る）。終了')
        return
    # refno 重複排除（レンジ境界の重複対策）
    uniq = {r['refno']: r for r in rows}
    total = upsert_rows(list(uniq.values()))
    log(f'upsert 完了: {total} 件')


if __name__ == '__main__':
    main()
