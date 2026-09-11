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

const raw = readFileSync(csvPath, 'utf-8').replace(/^﻿/, '');
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

const dupCount = records.length - new Set(records.map((r) => r.unit_number)).size;
if (dupCount > 0) console.log(`★号機の重複: ${dupCount} 件（完全一致検索で複数ヒットし得る）`);

if (dryRun) { console.log('[dry-run] 書き込みはしていません'); process.exitCode = 0; }
else await run();


async function run() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question(`本番 properties ${before} 件を削除し ${records.length} 件を投入します。yes で続行: `);
  rl.close();
  if (ans.trim() !== 'yes') { console.log('中止しました'); process.exitCode = 1; return; }

  await rest('DELETE', 'properties?id=gt.0');
  console.log('削除完了。投入中…');
  for (let i = 0; i < records.length; i += 1000) {
    await rest('POST', 'properties', records.slice(i, i + 1000));
    process.stdout.write(`\r${Math.min(i + 1000, records.length)}/${records.length}`);
  }
  const after = await countOf('properties');
  console.log(`\n投入完了: DB=${after} 件 / CSV=${records.length} 件 ${after === records.length ? 'OK' : '★件数不一致'}`);
  process.exitCode = after === records.length ? 0 : 1;
}
