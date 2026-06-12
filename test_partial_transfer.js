const http = require('http');

const testDate = '2026-06-20';
const createdIds = [];

// ヘルパー関数: HTTP POST
function postJSON(url, data) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
        } else {
          reject(new Error(`Status: ${res.statusCode}, Body: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

// ヘルパー関数: HTTP GET
function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`Status: ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

// ヘルパー関数: HTTP DELETE
function deleteRequest(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: 'DELETE'
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(`Status: ${res.statusCode}, Body: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const assert = (cond, msg) => {
  if (cond) {
    console.log(`[PASS] ${msg}`);
  } else {
    console.error(`[FAIL] ${msg}`);
    process.exitCode = 1;
  }
};

async function runTests() {
  console.log('--- 未反映予定の追加移行（UI/UX判定）シナリオテスト開始 ---');

  // --- シナリオ 1: 初回登録 (未反映のみ) ---
  console.log('\n--- 1. カレンダーから予定を2件新規登録 (is_transferred = 0) ---');
  const resA = await postJSON('http://localhost:5000/api/schedules', {
    status: 'draft',
    property_name: '初回移行テスト物件A',
    work_type: '一般',
    date: testDate,
    is_transferred: 0
  });
  if (resA && resA.id) createdIds.push(resA.id);

  const resB = await postJSON('http://localhost:5000/api/schedules', {
    status: 'draft',
    property_name: '初回移行テスト物件B',
    work_type: '一般',
    date: testDate,
    is_transferred: 0
  });
  if (resB && resB.id) createdIds.push(resB.id);

  let schedules = await getJSON(`http://localhost:5000/api/schedules?start_date=${testDate}&end_date=${testDate}`);
  let displaySchedules = schedules.filter(s => s.work_type !== '休み' && s.work_type !== '公休');

  let hasRealSchedules = displaySchedules.length > 0;
  let unprocessedCount = displaySchedules.filter(s => s.is_transferred !== 1).length;
  let transferredCount = displaySchedules.filter(s => s.is_transferred === 1).length;
  let hasUnprocessedTransfer = unprocessedCount > 0;
  let isAllTransferred = hasRealSchedules && !hasUnprocessedTransfer;
  let isPartiallyTransferred = transferredCount > 0 && hasUnprocessedTransfer;

  console.log(`実予定あり: ${hasRealSchedules}, 未移行件数: ${unprocessedCount}, 移行済み件数: ${transferredCount}`);
  assert(unprocessedCount === 2, '未移行件数が 2 件であること');
  assert(transferredCount === 0, '移行済み件数が 0 件であること');
  assert(hasUnprocessedTransfer === true, '未反映の移行予定があること (hasUnprocessedTransfer = true)');
  assert(isAllTransferred === false, 'すべて移行済みではないこと (isAllTransferred = false)');
  assert(isPartiallyTransferred === false, '一部移行済み状態ではないこと (isPartiallyTransferred = false)');
  console.log('=> 青色ボタン「行動予定へ移行 (2件)」が表示される条件に合致しています。');

  // --- シナリオ 2: 初回移行の実行 ---
  console.log('\n--- 2. 初回移行の実行 ---');
  await postJSON('http://localhost:5000/api/schedules/transfer', { date: testDate });

  schedules = await getJSON(`http://localhost:5000/api/schedules?start_date=${testDate}&end_date=${testDate}`);
  displaySchedules = schedules.filter(s => s.work_type !== '休み' && s.work_type !== '公休');

  hasRealSchedules = displaySchedules.length > 0;
  unprocessedCount = displaySchedules.filter(s => s.is_transferred !== 1).length;
  transferredCount = displaySchedules.filter(s => s.is_transferred === 1).length;
  hasUnprocessedTransfer = unprocessedCount > 0;
  isAllTransferred = hasRealSchedules && !hasUnprocessedTransfer;
  isPartiallyTransferred = transferredCount > 0 && hasUnprocessedTransfer;

  console.log(`実予定あり: ${hasRealSchedules}, 未移行件数: ${unprocessedCount}, 移行済み件数: ${transferredCount}`);
  assert(unprocessedCount === 0, '未移行件数が 0 件であること');
  assert(transferredCount === 2, '移行済み件数が 2 件であること');
  assert(hasUnprocessedTransfer === false, '未反映の移行予定がないこと (hasUnprocessedTransfer = false)');
  assert(isAllTransferred === true, 'すべて移行済みであること (isAllTransferred = true)');
  assert(isPartiallyTransferred === false, '一部移行済み状態ではないこと (isPartiallyTransferred = false)');
  console.log('=> 「✓ 移行済み」バッジが表示される条件に合致しています。');

  // --- シナリオ 3: 移行後にカレンダーから予定を1件追加登録 ---
  console.log('\n--- 3. カレンダーから追加で予定を1件登録 (is_transferred = 0) ---');
  const resC = await postJSON('http://localhost:5000/api/schedules', {
    status: 'draft',
    property_name: '追加移行テスト物件C',
    work_type: '一般',
    date: testDate,
    is_transferred: 0
  });
  if (resC && resC.id) createdIds.push(resC.id);

  schedules = await getJSON(`http://localhost:5000/api/schedules?start_date=${testDate}&end_date=${testDate}`);
  displaySchedules = schedules.filter(s => s.work_type !== '休み' && s.work_type !== '公休');

  hasRealSchedules = displaySchedules.length > 0;
  unprocessedCount = displaySchedules.filter(s => s.is_transferred !== 1).length;
  transferredCount = displaySchedules.filter(s => s.is_transferred === 1).length;
  hasUnprocessedTransfer = unprocessedCount > 0;
  isAllTransferred = hasRealSchedules && !hasUnprocessedTransfer;
  isPartiallyTransferred = transferredCount > 0 && hasUnprocessedTransfer;

  console.log(`実予定あり: ${hasRealSchedules}, 未移行件数: ${unprocessedCount}, 移行済み件数: ${transferredCount}`);
  assert(unprocessedCount === 1, '未移行件数が 1 件であること');
  assert(transferredCount === 2, '移行済み件数が 2 件であること');
  assert(hasUnprocessedTransfer === true, '未反映の移行予定があること (hasUnprocessedTransfer = true)');
  assert(isAllTransferred === false, 'すべて移行済みではないこと (isAllTransferred = false)');
  assert(isPartiallyTransferred === true, '一部移行済み状態であること (isPartiallyTransferred = true)');
  console.log('=> オレンジ色ボタン「未反映分を移行 (1件)」が表示される条件に合致しています。');

  // --- シナリオ 4: 追加分の移行実行 ---
  console.log('\n--- 4. 追加分の移行処理の実行 ---');
  await postJSON('http://localhost:5000/api/schedules/transfer', { date: testDate });

  schedules = await getJSON(`http://localhost:5000/api/schedules?start_date=${testDate}&end_date=${testDate}`);
  displaySchedules = schedules.filter(s => s.work_type !== '休み' && s.work_type !== '公休');

  hasRealSchedules = displaySchedules.length > 0;
  unprocessedCount = displaySchedules.filter(s => s.is_transferred !== 1).length;
  transferredCount = displaySchedules.filter(s => s.is_transferred === 1).length;
  hasUnprocessedTransfer = unprocessedCount > 0;
  isAllTransferred = hasRealSchedules && !hasUnprocessedTransfer;
  isPartiallyTransferred = transferredCount > 0 && hasUnprocessedTransfer;

  console.log(`実予定あり: ${hasRealSchedules}, 未移行件数: ${unprocessedCount}, 移行済み件数: ${transferredCount}`);
  assert(unprocessedCount === 0, '未移行件数が 0 件であること');
  assert(transferredCount === 3, '移行済み件数が 3 件であること');
  assert(hasUnprocessedTransfer === false, '未反映の移行予定がないこと (hasUnprocessedTransfer = false)');
  assert(isAllTransferred === true, 'すべて移行済みであること (isAllTransferred = true)');
  assert(isPartiallyTransferred === false, '一部移行済み状態ではないこと (isPartiallyTransferred = false)');
  console.log('=> 「✓ 移行済み」バッジが表示される条件に合致しています。');

  // クリーンアップ
  console.log('\n--- 5. テスト用データのクリーンアップ ---');
  for (const id of createdIds) {
    await deleteRequest(`http://localhost:5000/api/schedules/${id}`);
  }
  console.log(`作成したテスト用スケジュール (計 ${createdIds.length} 件) を削除しました。`);

  console.log('\n--- すべてのテスト完了 ---');
}

runTests().catch(err => {
  console.error('テスト実行エラー:', err);
  process.exit(1);
});
