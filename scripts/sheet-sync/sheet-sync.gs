/**
 * 現地対応予定・行動管理システム: スプレッドシートの行動予定表を本番の予定へ取り込む（Google Apps Script）。
 * Google のクラウドで動くので、PC が止まっていても動く。シートは読むだけで書き換えない。
 * 設計: docs/sheet-sync-design.md、DB 側: sql/sheet_sync.sql（関数 fsm_sync_sheet_day）
 *
 * 使い方（scripts/sheet-sync/README.md）:
 *   1. script.google.com で新しいプロジェクトを作り、このファイルの中身を貼る
 *   2. setup() を 1 回実行して権限を許可 → 実行ログのハッシュ値を DB に登録してもらう
 *   3. dryRunOctober() で 10 月分を「試し」に流し、件数を確かめる（DB は変わらない）
 *   4. 件数に問題なければ backfillOctober() で 10 月分を本番に入れ、startSchedule() で定期実行を始める
 */

var CONFIG = {
  // 予定管理システムの Supabase（anon キーは公開してよいもの。画面のアプリにも入っている）
  SUPABASE_URL: 'https://llbefroolkndlyziiqgi.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsYmVmcm9vbGtuZGx5emlpcWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NjkzOTMsImV4cCI6MjA5NzA0NTM5M30.AZxib5DLF_QlSzkdPE_Ly8xEjDL_Za6_dat9ROHzuSg',
  // マイドライブ「1．行動予定表」（中に 2026年/10月/1019 の形で日ごとのスプレッドシートがある）
  SCHEDULE_ROOT_FOLDER_ID: '1ygU3DA6EUeZc-G2of2kixGVAYBNSdFPO',
  TZ: 'Asia/Tokyo',
};

// 見出し（3 行目）の文字 → 送る項目。見出しの文字で列を探すので、列の並びが変わっても読める
var COLUMNS = {
  '区分': 'division',
  'タイプ': 'type',
  'ボックス': 'box',
  'BOX': 'box',
  '号機': 'unit_number',
  '物件名': 'property_name',
  '種別': 'work_type',
  '作業内容': 'description',
  '時間': 'target_time',
  '対応者': 'staff_name',
  'エリア': 'area',
  '県別': 'prefecture',
  '移動手段': 'transport',
  '移動': 'transport',
  '同行者': 'co_worker',
  '依頼番号': 'request_number',
  '結果': 'result',
  '備考': 'notes',
  '障害区分': 'disorder_type',
  'level': 'level',
  'level②': 'level_3',
};
// 1 行目のうち、取り込まないラベル（障害の当番・同行の並びはアルコールチェックが別に使う）
var HEADER_SKIP_LABELS = ['障害', '同行'];

/* ---------------- 最初の設定 ---------------- */

/** 1 回だけ実行: 取り込み用トークンを作って保存し、DB に登録するハッシュ値を実行ログに出す */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('FSM_SHEET_SYNC_TOKEN');
  if (!token) {
    token = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('FSM_SHEET_SYNC_TOKEN', token);
  }
  Logger.log('DB に登録するハッシュ値（トークンそのものではありません）: ' + sha256Hex_(token));
  Logger.log("SQL: insert into public.fsm_ingest_tokens (name, token_hash) values ('gas-sheet-sync', '" + sha256Hex_(token) +
    "') on conflict (name) do update set token_hash = excluded.token_hash;");
}

/** 定期実行を始める（5 分ごと。夜 20 時〜翌 7 時は 15 分ごとに間引く） */
function startSchedule() {
  stopSchedule();
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(5).create();
  Logger.log('5 分ごとの取り込みを始めました');
}

/** 定期実行を止める */
function stopSchedule() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sync') ScriptApp.deleteTrigger(t);
  });
}

/* ---------------- 定期実行 ---------------- */

/** 今日と明日のシートを取り込む */
function sync() {
  var now = new Date();
  var hour = Number(Utilities.formatDate(now, CONFIG.TZ, 'H'));
  var minute = Number(Utilities.formatDate(now, CONFIG.TZ, 'm'));
  if ((hour < 7 || hour >= 20) && minute % 15 >= 5) return;
  [0, 1].forEach(function (offset) {
    var d = new Date(now.getTime() + offset * 24 * 3600 * 1000);
    syncDay_(d, false);
  });
}

/* ---------------- 10 月分のさかのぼり ---------------- */

/** 10 月分を「試し」で流す（DB は変わらない）。日ごとの件数を実行ログに出す */
function dryRunOctober() {
  runMonth_(2026, 10, true);
}

/** 10 月分を本番に入れる（試しの件数を確かめてから実行する） */
function backfillOctober() {
  runMonth_(2026, 10, false);
}

function runMonth_(year, month, dryRun) {
  var folder = monthFolder_(year, month);
  if (!folder) throw new Error(year + '年/' + month + '月 のフォルダが見つかりません');
  var names = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (/^\d{4}$/.test(f.getName()) && f.getMimeType() === MimeType.GOOGLE_SHEETS) names.push(f.getName());
  }
  names.sort();
  var total = { sheet_rows: 0, inserted: 0, linked: 0, updated: 0, unchanged: 0, conflicts: 0, cancelled: 0, restored: 0, removed_header: 0 };
  var unresolved = {};
  Logger.log((dryRun ? '【試し】' : '【本番】') + year + '年' + month + '月: ' + names.length + ' 日分');
  Logger.log('日付        行数  追加  結び付け  更新  変わらず  食い違い  キャンセル');
  names.forEach(function (name) {
    var d = new Date(year, Number(name.slice(0, 2)) - 1, Number(name.slice(2, 4)));
    var res = syncDay_(d, dryRun);
    if (!res) return;
    Object.keys(total).forEach(function (k) { total[k] += res[k] || 0; });
    (res.unresolved_staff || []).forEach(function (n) { unresolved[n] = true; });
    Logger.log([res.date, pad_(res.sheet_rows, 4), pad_(res.inserted, 4), pad_(res.linked, 8), pad_(res.updated, 4),
      pad_(res.unchanged, 8), pad_(res.conflicts, 8), pad_(res.cancelled, 10)].join('  '));
  });
  Logger.log('合計: ' + JSON.stringify(total));
  Logger.log('名簿で見つからなかった名前: ' + Object.keys(unresolved).join('、'));
}

/* ---------------- 1 日分 ---------------- */

/** その日のシートを読んで送る。シートが無ければ null */
function syncDay_(date, dryRun) {
  var token = PropertiesService.getScriptProperties().getProperty('FSM_SHEET_SYNC_TOKEN');
  if (!token) throw new Error('setup() を先に実行してください');
  var day = Utilities.formatDate(date, CONFIG.TZ, 'yyyy-MM-dd');
  var rows;
  try {
    rows = readDay_(date);
  } catch (e) {
    reportError_(token, day, e);
    Logger.log(day + ' 読めませんでした: ' + e);
    return null;
  }
  if (rows === null) return null; // まだシートが無い
  var res = rpc_('fsm_sync_sheet_day', { p_token: token, p_date: day, p_rows: rows, p_dry_run: dryRun });
  return res;
}

/** 1．行動予定表/YYYY年/M月/MMDD を読む。行（予定）と 1 行目の休暇・社内予定を返す */
function readDay_(date) {
  var folder = monthFolder_(Number(Utilities.formatDate(date, CONFIG.TZ, 'yyyy')), Number(Utilities.formatDate(date, CONFIG.TZ, 'M')));
  if (!folder) return null;
  var name = Utilities.formatDate(date, CONFIG.TZ, 'MMdd');
  var files = folder.getFilesByName(name);
  if (!files.hasNext()) return null;
  var ss = SpreadsheetApp.openById(files.next().getId());
  var sheet = ss.getSheetByName(name) || ss.getSheets()[0];
  var values = sheet.getDataRange().getDisplayValues();

  // 見出しの行（「号機」と「物件名」がある行）を探す
  var headerRow = -1;
  for (var r = 0; r < Math.min(values.length, 10); r++) {
    if (values[r].indexOf('号機') >= 0 && values[r].indexOf('物件名') >= 0) { headerRow = r; break; }
  }
  if (headerRow < 0) throw new Error(name + ': 見出しの行（号機・物件名）が見つかりません');
  var colOf = {};
  values[headerRow].forEach(function (h, c) {
    var key = COLUMNS[String(h).trim()];
    if (key && colOf[key] === undefined) colOf[key] = c;
  });
  if (colOf.property_name === undefined || colOf.staff_name === undefined) throw new Error(name + ': 物件名・対応者の列が見つかりません');

  var out = [];
  for (var i = headerRow + 1; i < values.length; i++) {
    var row = values[i];
    var get = function (k) { return colOf[k] === undefined ? '' : String(row[colOf[k]] || '').trim(); };
    if (!get('property_name') && !get('unit_number')) continue; // 空の行・「追加」だけの行
    var item = { kind: 'row' };
    Object.keys(colOf).forEach(function (k) { item[k] = get(k); });
    // 同行者がセルの中で改行されている（「佐藤\n高倉」）→ カンマ区切りに
    item.co_worker = item.co_worker ? item.co_worker.split(/\s*\n\s*/).filter(String).join(',') : '';
    out.push(item);
  }

  // 1 行目（A1）の 1 行目: 「健康診断：下田（8:30）池宮(10:00)…　棚卸：淺沼/佐藤　休暇：藤田/FR金谷/…」
  var a1 = String(values[0] && values[0][0] || '');
  parseHeader_(a1.split(/\r?\n/)[0] || '').forEach(function (h) { out.push(h); });
  return out;
}

/** 「ラベル：名前/名前（時刻）…」を、名前ごとの休暇・社内予定に分ける */
function parseHeader_(line) {
  var out = [];
  var re = /([^\s　：:\/／、,]+)[：:]/g;
  var marks = [];
  var m;
  while ((m = re.exec(line)) !== null) marks.push({ label: m[1], start: m.index, end: re.lastIndex });
  marks.forEach(function (mk, idx) {
    if (HEADER_SKIP_LABELS.indexOf(mk.label) >= 0) return;
    var body = line.slice(mk.end, idx + 1 < marks.length ? marks[idx + 1].start : line.length);
    var nameRe = /([^\s　\/／、,（(）)]+)\s*(?:[（(]([^）)]*)[）)])?/g;
    var n;
    while ((n = nameRe.exec(body)) !== null) {
      var person = n[1].trim();
      if (!person) continue;
      out.push({ kind: 'header', label: mk.label, staff_name: person, target_time: (n[2] || '').trim() });
    }
  });
  return out;
}

/* ---------------- 共通 ---------------- */

function monthFolder_(year, month) {
  var root = DriveApp.getFolderById(CONFIG.SCHEDULE_ROOT_FOLDER_ID);
  var y = child_(root, year + '年');
  return y ? child_(y, month + '月') : null;
}

function child_(folder, name) {
  var it = folder.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function rpc_(name, body) {
  var res = UrlFetchApp.fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/' + name, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CONFIG.SUPABASE_ANON_KEY },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code >= 300) throw new Error(name + ' HTTP ' + code + ': ' + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

function reportError_(token, day, e) {
  try {
    rpc_('fsm_sync_error', { p_token: token, p_date: day, p_error: String(e && e.message || e).slice(0, 500) });
  } catch (ignore) { /* 記録にも失敗したら、実行ログだけに残る */ }
}

function sha256Hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function pad_(n, w) {
  var s = String(n === undefined ? '' : n);
  while (s.length < w) s = ' ' + s;
  return s;
}
