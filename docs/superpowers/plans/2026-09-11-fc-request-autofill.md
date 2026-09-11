# 依頼番号による自動補完（FC連携）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 予定入力モーダルで依頼番号を入れると、FC 由来の同期データと物件マスタから タイプ / BOX / 号機 / 物件名 / エリア / 県別 が自動で埋まる。

**Architecture:** アプリは Supabase だけを見る。FC（社内専用）へのアクセスは、社内 PC 上の Python 同期スクリプトが5分おきに `fc_requests` テーブルへ写す。物件マスタ `properties` はダミーを捨てて FC 物件リスト実データに入れ替える。詳細は `docs/superpowers/specs/2026-09-11-fc-request-autofill-design.md`。

**Tech Stack:** Node 24（マスタ投入・依存追加なし）/ Python 3 標準ライブラリ（FC同期）/ React 19 + supabase-js（アプリ）

**前提（実行環境の注意）:**
- 本番 Supabase (`llbefroolkndlyziiqgi`) に直接書き込む。`frontend/.env.local` が存在すること（`.env.example` のコピー）。
- FC への照会は社内ネット必須。負荷ルール: 連続照会は2秒間隔、`status=6` 指定の照会は禁止。
- コミットはブランチ `feature/fc-request-autofill` 上で行う。

---

## File Structure

- Create: `scripts/load_properties.mjs` — 物件マスタ全洗い替え（CSV → properties）
- Create: `sql/fc_requests.sql` — fc_requests テーブル DDL
- Create: `scripts/sync_fc_requests.py` — FC → fc_requests 同期（定期実行の本体）
- Create: `scripts/test_sync_fc_requests.py` — 同期スクリプトのパーサ単体テスト
- Create: `scripts/sync_fc_requests.bat` — 手動即時同期用ランチャ
- Create: `scripts/SETUP_SYNC.md` — 富本さん向けセットアップ手順
- Modify: `frontend/src/components/ScheduleModal.tsx` — 依頼番号 onBlur 補完（号機補完ロジックの共通化を含む）

---

### Task 1: 物件マスタ投入スクリプト `scripts/load_properties.mjs`

**Files:**
- Create: `scripts/load_properties.mjs`

- [ ] **Step 1: スクリプトを作成**

```js
#!/usr/bin/env node
/* FC「物件リスト」Export CSV を Supabase properties へ全洗い替え投入する。
 *
 * 使い方:
 *   node scripts/load_properties.mjs --csv <path> --dry-run   # 内容確認のみ
 *   node scripts/load_properties.mjs --csv <path>             # 全削除→投入
 *
 * CSV ヘッダ（UTF-8 BOM、fc-ops equipment_import 形式）:
 *   machine_number,property_name,prefectures,rooms,box_count,case_count,
 *   address,start_date,model,type_name,program,service
 *
 * 列マッピング（設計書①）:
 *   unit_number   <- machine_number（ゼロ埋めなし文字列）
 *   property_name <- property_name
 *   address       <- prefectures + address（addressResolver が県名開始前提のため連結）
 *   box_count     <- box_count（整数、空は null）
 *   model_type    <- type_name（=アプリの「タイプ」欄）
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import readline from 'node:readline/promises';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const csvIdx = args.indexOf('--csv');
if (csvIdx === -1 || !args[csvIdx + 1]) {
  console.error('使い方: node scripts/load_properties.mjs --csv <path> [--dry-run]');
  process.exit(1);
}
const csvPath = args[csvIdx + 1];

// Supabase 接続情報は frontend/.env.local から読む（値の手打ち禁止・タイプミス事故防止）
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  readFileSync(join(root, 'frontend', '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const BASE = `${env.VITE_SUPABASE_URL}/rest/v1`;
const HEADERS = {
  apikey: env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

/** 最小限の CSV パーサ（ダブルクォート対応） */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function rest(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE}/${path}`, {
    method,
    headers: { ...HEADERS, Prefer: 'return=minimal', ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  return res;
}

async function countOf(table) {
  const res = await fetch(`${BASE}/${table}?select=id`, {
    method: 'HEAD',
    headers: { ...HEADERS, Prefer: 'count=exact', Range: '0-0' },
    signal: AbortSignal.timeout(30000),
  });
  return Number((res.headers.get('content-range') || '/0').split('/')[1]);
}

const raw = readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
const [header, ...lines] = parseCsv(raw).filter((r) => r.length > 1);
const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
for (const need of ['machine_number', 'property_name', 'prefectures', 'box_count', 'address', 'type_name']) {
  if (!(need in col)) { console.error(`CSV に列 ${need} がありません`); process.exit(1); }
}

const records = lines
  .filter((r) => (r[col.machine_number] || '').trim() !== '')
  .map((r) => ({
    unit_number: r[col.machine_number].trim(),
    property_name: r[col.property_name].trim(),
    address: `${r[col.prefectures].trim()}${r[col.address].trim()}`,
    box_count: r[col.box_count].trim() === '' ? null : Number(r[col.box_count]),
    model_type: r[col.type_name].trim(),
  }));

console.log(`CSV: ${records.length} 件`);
console.log('サンプル3件:', JSON.stringify(records.slice(0, 3), null, 2));

const before = await countOf('properties');
console.log(`現在の properties: ${before} 件（全削除して入れ替えます）`);

if (dryRun) { console.log('[dry-run] 書き込みはしていません'); process.exit(0); }

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ans = await rl.question(`本番 properties ${before} 件を削除し ${records.length} 件を投入します。yes で続行: `);
rl.close();
if (ans.trim() !== 'yes') { console.log('中止しました'); process.exit(1); }

await rest('DELETE', 'properties?id=gt.0');
console.log('削除完了。投入中…');
for (let i = 0; i < records.length; i += 1000) {
  await rest('POST', 'properties', records.slice(i, i + 1000));
  process.stdout.write(`\r${Math.min(i + 1000, records.length)}/${records.length}`);
}
const after = await countOf('properties');
console.log(`\n投入完了: DB=${after} 件 / CSV=${records.length} 件 ${after === records.length ? 'OK' : '★件数不一致'}`);
if (after !== records.length) process.exit(1);
```

- [ ] **Step 2: dry-run で検証**

Run: `node scripts/load_properties.mjs --csv "C:/Users/000367/dev/fc-ops/out/equipment_import_2026-08-25.csv" --dry-run`
Expected: `CSV: 40000件前後`、サンプル3件の `address` が「神奈川県横浜市…」のように県名から始まる。`現在の properties: 10000 件`。書き込みなし。

- [ ] **Step 3: 本実行**

Run: `node scripts/load_properties.mjs --csv "C:/Users/000367/dev/fc-ops/out/equipment_import_2026-08-25.csv"` → `yes`
Expected: `投入完了: DB=N 件 / CSV=N 件 OK`（件数一致）

- [ ] **Step 4: 実号機で検算**

Run（bash）:
```bash
cd frontend && K=$(grep ANON_KEY= .env.local | cut -d= -f2-) && curl -s -H "apikey: $K" -H "Authorization: Bearer $K" "https://llbefroolkndlyziiqgi.supabase.co/rest/v1/properties?select=*&unit_number=eq.507278"
```
Expected: 実在物件（サンデュエル東鷲宮）が1件返り、`box_count` / `model_type` / `address` が埋まっている。

- [ ] **Step 5: Commit**

```bash
git add scripts/load_properties.mjs
git commit -m "feat: 物件マスタをFC物件リスト実データへ入れ替える投入スクリプトを追加"
```

---

### Task 2: `fc_requests` テーブル作成

**Files:**
- Create: `sql/fc_requests.sql`

- [ ] **Step 1: DDL ファイルを作成**

```sql
-- FC 依頼の同期テーブル（scripts/sync_fc_requests.py が upsert する）
-- 実行方法: Supabase Dashboard の SQL Editor にコピー＆ペーストして実行
CREATE TABLE IF NOT EXISTS fc_requests (
  refno TEXT PRIMARY KEY,          -- 依頼番号（11桁）
  unit_number TEXT NOT NULL,       -- 号機
  property_name TEXT,              -- 物件名
  address TEXT,                    -- 住所（lst_detail の住所列）
  request_date TEXT,               -- 依頼日 YYYY-MM-DD（refno の 2〜7桁目 YYMMDD 由来）
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fc_requests_unit_number ON fc_requests(unit_number);
```

- [ ] **Step 2: テーブルを実際に作成**

Supabase MCP の `list_projects` で `llbefroolkndlyziiqgi` が自分のアカウント配下にあるか確認。
- あれば `apply_migration` で上記 SQL を適用。
- **無ければ**（富本さんのアカウント管理）: ユーザーに SQL を渡し、Supabase Dashboard の SQL Editor での実行を依頼して結果を待つ。勝手に進めない。

- [ ] **Step 3: 作成確認**

Run（bash）:
```bash
cd frontend && K=$(grep ANON_KEY= .env.local | cut -d= -f2-) && curl -s -o /dev/null -w "%{http_code}" -H "apikey: $K" -H "Authorization: Bearer $K" "https://llbefroolkndlyziiqgi.supabase.co/rest/v1/fc_requests?select=refno&limit=1"
```
Expected: `200`（404/42P01 ならテーブル未作成）

- [ ] **Step 4: Commit**

```bash
git add sql/fc_requests.sql
git commit -m "feat: fc_requests テーブルのDDLを追加"
```

---

### Task 3: FC 同期スクリプト（パーサのテストから）

**Files:**
- Create: `scripts/sync_fc_requests.py`
- Create: `scripts/test_sync_fc_requests.py`
- Create: `scripts/sync_fc_requests.bat`
- Create: `scripts/SETUP_SYNC.md`

- [ ] **Step 1: パーサの失敗するテストを書く**

`scripts/test_sync_fc_requests.py`:
```python
import unittest
from sync_fc_requests import parse_list, date_from_refno

# lst_detail.php の応答を模した最小 HTML（列: No|日付|号機|物件名|住所|症状・指示|対応状況|緊急|未連絡|詳細）
FIXTURE = """
<table>
<tr><td>No</td><td>日付</td><td>号機</td><td>物件名</td><td>住所</td><td>症状</td><td>対応状況</td></tr>
<tr><input type="hidden" name="refno" value="12609110001">
<td>1</td><td>26/09/11</td><td>507278</td><td>サンデュエル東鷲宮</td><td>埼玉県久喜市桜田2-2-2</td>
<td>BOX開かない</td><td>対応中</td></tr>
<tr><input type=hidden name=refno value=12609110002>
<td>2</td><td>26/09/11</td><td>17603</td><td>THE　PLACE　KYODO</td><td>東京都世田谷区経堂1-1-1</td>
<td>&nbsp;液晶 <b>不良</b></td><td></td></tr>
<tr><td>ヘッダ行や refno の無い行は無視される</td></tr>
</table>
"""

class TestParseList(unittest.TestCase):
    def test_parse_two_rows(self):
        rows = parse_list(FIXTURE)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0], {
            'refno': '12609110001',
            'unit_number': '507278',
            'property_name': 'サンデュエル東鷲宮',
            'address': '埼玉県久喜市桜田2-2-2',
            'request_date': '2026-09-11',
        })

    def test_tags_and_nbsp_stripped(self):
        rows = parse_list(FIXTURE)
        self.assertEqual(rows[1]['property_name'], 'THE　PLACE　KYODO')
        self.assertEqual(rows[1]['unit_number'], '17603')

    def test_date_from_refno(self):
        self.assertEqual(date_from_refno('12609110001'), '2026-09-11')
        self.assertEqual(date_from_refno('bad'), None)

if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd scripts && python -m unittest test_sync_fc_requests -v`
Expected: FAIL（`ModuleNotFoundError: No module named 'sync_fc_requests'`）

- [ ] **Step 3: 同期スクリプト本体を書く**

`scripts/sync_fc_requests.py`:
```python
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
    return re.sub(r'\s+', ' ', t).strip()


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
        with urllib.request.urlopen(req, timeout=30) as r:
            if r.status not in (200, 201, 204):
                die(f'Supabase upsert 失敗: HTTP {r.status}')
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
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd scripts && python -m unittest test_sync_fc_requests -v`
Expected: `OK`（3 tests passed）

- [ ] **Step 5: 実環境で1回実行（社内ネット必須）**

Run: `cd scripts && python sync_fc_requests.py`
（`FC_USER`/`FC_PASS` はユーザーに設定してもらう。**Claude がパスワード値を扱わない・ファイルに書かないこと**）
Expected: `FC ログインOK` → `lst_detail ...: N 件` → `upsert 完了: N 件`

- [ ] **Step 6: DB 側を確認**

Run（bash）:
```bash
cd frontend && K=$(grep ANON_KEY= .env.local | cut -d= -f2-) && curl -s -H "apikey: $K" -H "Authorization: Bearer $K" "https://llbefroolkndlyziiqgi.supabase.co/rest/v1/fc_requests?select=refno,unit_number,property_name,request_date&order=refno.desc&limit=5"
```
Expected: 直近の実依頼が返る。再度 `python sync_fc_requests.py` を実行しても件数が二重にならない（upsert 冪等）。

- [ ] **Step 7: bat とセットアップ手順を作成**

`scripts/sync_fc_requests.bat`:
```bat
@echo off
rem FC依頼同期の手動実行（急ぎで同期したいとき用）。定期実行はタスクスケジューラ登録済み。
cd /d "%~dp0"
python sync_fc_requests.py
pause
```

`scripts/SETUP_SYNC.md`:
```markdown
# FC依頼同期のセットアップ（k_ueda / 富本 各自のPCで実施）

アプリの「依頼番号→自動補完」は、このPC上の同期スクリプトが5分おきに
FC の依頼一覧を Supabase (fc_requests) へ写すことで動きます。
2台のどちらかが起動していれば同期は継続します（同時実行しても衝突しません）。

## 前提
- 社内ネットに接続された Windows PC / Python 3 インストール済み
- このリポジトリを clone 済み / `frontend/.env.local` を `.env.example` からコピー済み

## 1. FC 資格情報を環境変数に設定（各自のIDで）
PowerShell（自分のユーザー環境変数に保存。リポジトリには絶対に書かない）:
    [Environment]::SetEnvironmentVariable('FC_USER', '<社員番号>', 'User')
    [Environment]::SetEnvironmentVariable('FC_PASS', '<FCパスワード>', 'User')

## 2. 動作確認（新しいターミナルで）
    cd <リポジトリ>\scripts
    python sync_fc_requests.py
「upsert 完了: N 件」が出ればOK。

## 3. タスクスケジューラ登録（平日 8:00-19:00 を5分間隔）
管理者不要。PowerShell:
    schtasks /Create /TN "FSM_FC_Sync" /TR "\"<リポジトリ>\scripts\sync_fc_requests_task.bat\"" /SC MINUTE /MO 5 /ST 08:00 /ET 19:00 /K /F
※ `sync_fc_requests_task.bat` は pause 無し版（下記）。手動用の `sync_fc_requests.bat` とは別。

## 4. 初回バックフィル（どちらか1台で1回だけ）
    python sync_fc_requests.py --days 60
過去60日分を10日刻み・2秒間隔で取り込みます（1〜2分）。

## トラブル時
- 「FC ログイン失敗」: FC_USER/FC_PASS を再設定（コピペで。目視手打ち禁止）
- 「Supabase upsert 失敗」: frontend/.env.local の URL/KEY を確認
```

`scripts/sync_fc_requests_task.bat`（タスクスケジューラ用・pause 無し）:
```bat
@echo off
cd /d "%~dp0"
python sync_fc_requests.py >> "%TEMP%\fsm_fc_sync.log" 2>&1
```

- [ ] **Step 8: Commit**

```bash
git add scripts/sync_fc_requests.py scripts/test_sync_fc_requests.py scripts/sync_fc_requests.bat scripts/sync_fc_requests_task.bat scripts/SETUP_SYNC.md
git commit -m "feat: FC依頼一覧をfc_requestsへ同期するスクリプトとセットアップ手順を追加"
```

---

### Task 4: アプリ側 — 依頼番号 onBlur 補完（ScheduleModal）

**Files:**
- Modify: `frontend/src/components/ScheduleModal.tsx`
  - 状態追加: 88行目付近（既存の補完用 state の下）
  - 共通化 + 新ハンドラ: `handleUnitNumberBlur`（122–165行）を分解して追加
  - JSX: 依頼番号入力（858–868行）に onBlur とヒント表示を追加

- [ ] **Step 1: 状態とタイムアウトヘルパを追加**

`const [activeHoverId, setActiveHoverId] = useState<number | null>(null);`（88行目）の直後に追加:

```tsx
  // 依頼番号→FC同期データ補完用
  const [requestNumberHint, setRequestNumberHint] = useState('');

  // 読み取りにもタイムアウトを付ける（無限ハング防止・ユーザー運用ルール）
  const withTimeout = <T,>(p: PromiseLike<T>, ms = 15000): Promise<T> =>
    Promise.race([
      Promise.resolve(p),
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ]);
```

- [ ] **Step 2: 号機→マスタ補完を関数に切り出す（DRY）**

既存 `handleUnitNumberBlur`（122–165行）の中の「Supabase 検索〜setState」部分を関数化する。
`handleUnitNumberBlur` の**前**に以下を追加し、`handleUnitNumberBlur` 本体は
`await autofillFromUnitNumber(val);` を呼ぶだけに書き換える（`needsNameAutoFill` 等の判定は関数内に移す）:

```tsx
  /** 号機をキーに物件マスタを引き、未入力の項目だけ補完する。
   *  fallback: マスタに号機が無いときに使う FC 同期データ（物件名・住所）。
   *  戻り値: マスタ or fallback で何かしら補完できたら true */
  const autofillFromUnitNumber = async (
    val: string,
    fallback?: { property_name?: string | null; address?: string | null }
  ): Promise<boolean> => {
    const needsNameAutoFill = !propertyName || propertyName.trim() === '' || propertyName === '（物件名未定）';
    const needsAreaAutoFill = !area || area.trim() === '';
    const needsPrefAutoFill = !prefecture || prefecture.trim() === '';

    try {
      const { data, error } = await withTimeout(
        supabase.from('properties').select('*').eq('unit_number', val).limit(1)
      );
      if (!error && data && data.length > 0) {
        const matched = data[0];
        if (needsNameAutoFill) {
          setPropertyName(matched.property_name || '');
        }
        setBox(matched.box_count ? String(matched.box_count) : '');
        setType(matched.model_type || '');
        if (matched.address) {
          const { area: determinedArea, prefecture: determinedPref } = resolveAddress(matched.address);
          if (needsAreaAutoFill && determinedArea) setArea(determinedArea);
          if (needsPrefAutoFill && determinedPref) setPrefecture(determinedPref);
        }
        return true;
      }
    } catch (err) {
      console.error('Failed to auto-complete property:', err);
    }

    // マスタ未登録の号機: FC 同期データの物件名・住所で最低限を埋める
    if (fallback) {
      if (needsNameAutoFill && fallback.property_name) setPropertyName(fallback.property_name);
      if (fallback.address) {
        const { area: determinedArea, prefecture: determinedPref } = resolveAddress(fallback.address);
        if (needsAreaAutoFill && determinedArea) setArea(determinedArea);
        if (needsPrefAutoFill && determinedPref) setPrefecture(determinedPref);
      }
      return Boolean(fallback.property_name || fallback.address);
    }
    return false;
  };
```

書き換え後の `handleUnitNumberBlur`:

```tsx
  const handleUnitNumberBlur = async () => {
    // サジェストを非表示（200msの遅延を設けることでリスト項目のクリックを可能にする）
    setTimeout(() => setShowSuggestions(false), 200);

    const val = unitNumber.trim();
    if (val === '') return;
    await autofillFromUnitNumber(val);
  };
```

- [ ] **Step 3: 依頼番号の onBlur ハンドラを追加**

`handleUnitNumberBlur` の直後に追加:

```tsx
  /** 依頼番号→FC同期テーブル(fc_requests)→号機→マスタ補完 */
  const handleRequestNumberBlur = async () => {
    setRequestNumberHint('');
    const val = toHalfWidth(requestNumber).trim();
    if (val === '') return;
    if (val !== requestNumber) setRequestNumber(val);

    try {
      const { data, error } = await withTimeout(
        supabase.from('fc_requests').select('*').eq('refno', val).limit(1)
      );
      if (error) throw error;
      if (!data || data.length === 0) {
        setRequestNumberHint('FC同期にまだ無い番号です。号機を入力すると残りが補完されます');
        return;
      }
      const req = data[0];
      if (!unitNumber.trim() && req.unit_number) {
        setUnitNumber(req.unit_number);
      }
      await autofillFromUnitNumber(
        (unitNumber.trim() || req.unit_number || '').trim(),
        { property_name: req.property_name, address: req.address }
      );
    } catch (err) {
      // 補完失敗は入力の妨げにしない（保存動作には無関係）
      console.error('Failed to look up fc_requests:', err);
    }
  };
```

- [ ] **Step 4: JSX に onBlur とヒントを追加**

依頼番号の input（860–867行）を次に変更:

```tsx
                <input
                  type="text"
                  id="request_number"
                  className="form-control"
                  value={requestNumber}
                  onChange={(e) => { setRequestNumber(e.target.value); setRequestNumberHint(''); }}
                  onBlur={handleRequestNumberBlur}
                  autoComplete="off"
                  disabled={isSubmitting}
                />
                {requestNumberHint && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #64748b)', marginTop: '4px' }}>
                    {requestNumberHint}
                  </div>
                )}
```

- [ ] **Step 5: モーダル初期化時にヒントをクリア**

`setRequestNumber(selectedSchedule.request_number || '');`（249行付近）を含む useEffect の
編集モード分岐と新規モード分岐（263行付近の `setType('')` 群）の両方に
`setRequestNumberHint('');` を1行ずつ追加する。

- [ ] **Step 6: ビルド確認**

Run: `npm --prefix frontend run build`
Expected: tsc + vite build がエラーなしで完了。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ScheduleModal.tsx
git commit -m "feat: 依頼番号入力でFC同期データから号機・物件情報を自動補完"
```

---

### Task 5: ローカル動作確認（本番DBに繋がる点に注意）

**Files:** なし（検証のみ）

- [ ] **Step 1: dev サーバーで確認**

`preview_start`（launch.json `field-schedule-manager`）→ 管理者デモログイン → 予定追加モーダルを開く。

- [ ] **Step 2: 依頼番号補完の確認**

fc_requests に入っている実依頼番号（Task 3 Step 6 で確認したもの）を依頼番号欄に入力しフォーカスを外す。
Expected: 号機・物件名・タイプ・BOX・エリア・県別が埋まる。**保存はしない**（本番 schedules を汚さない）。

- [ ] **Step 3: 上書きしないことの確認**

物件名に手入力で任意の文字を入れてから依頼番号を入力。
Expected: 手入力の物件名が保持される（タイプ・BOXのみ更新）。

- [ ] **Step 4: 未同期番号のヒント確認**

存在しない番号（例: `19999999999`）を入力。
Expected: 「FC同期にまだ無い番号です。…」が表示され、alert は出ない。

- [ ] **Step 5: 号機単体補完の回帰確認**

依頼番号を空のまま号機に実号機（例: 507278）を入力しフォーカスを外す。
Expected: 従来どおり物件名・BOX・タイプ・エリア・県別が補完される（Task 4 の共通化でのデグレなし）。

- [ ] **Step 6: スクリーンショットをユーザーに共有し、完了報告**

補完が埋まった状態のモーダルのスクリーンショットを撮って共有。
その後の main へのマージ / PR / 富本さんへの連携（SETUP_SYNC.md・fc_requests.sql）はユーザーの指示を仰ぐ。
```

---

## Self-Review 済みメモ

- 仕様①→Task 1、②→Task 2・3、③→Task 4、テスト→各 Task + Task 5 に対応。
- fc_requests テーブル作成は権限が自分に無い可能性があるため Task 2 Step 2 で分岐（勝手に進めない）。
- 依頼番号の全角入力対策に既存 `toHalfWidth`（types.ts）を使用。
- Task 4 Step 2 の共通化で既存 `handleUnitNumberBlur` の挙動（BOX/タイプは常に上書き、物件名/エリア/県別は未入力時のみ）を変えていない。
