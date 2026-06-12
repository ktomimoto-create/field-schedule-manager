const http = require('http');

// ヘルパー関数: HTTP POST リクエストの送信
function postJSON(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
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

// ヘルパー関数: HTTP GET リクエストの送信
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

async function runTests() {
  console.log('--- 非連動化＆一括移行機能 動作テスト開始 ---');

  const testDate = '2026-06-15';

  // 1. 月間予定表（is_transferred = 0）から新規登録をシミュレーション
  console.log('\n--- 1. 月間予定表から予定を登録 (is_transferred = 0) ---');
  const calItem = {
    status: 'draft',
    property_name: '月間予定表テスト物件A',
    work_type: '障害',
    date: testDate,
    is_transferred: 0
  };
  const regCalItem = await postJSON('http://localhost:5000/api/schedules', calItem);
  console.log('登録完了:', regCalItem.property_name, ', is_transferred:', regCalItem.is_transferred);

  // 2. 行動予定表（is_transferred = 1）から新規登録をシミュレーション
  console.log('\n--- 2. 行動予定表から予定を登録 (is_transferred = 1) ---');
  const gridItem = {
    status: 'confirmed',
    property_name: '行動予定表直接登録物件B',
    work_type: '工事',
    date: testDate,
    is_transferred: 1
  };
  const regGridItem = await postJSON('http://localhost:5000/api/schedules', gridItem);
  console.log('登録完了:', regGridItem.property_name, ', is_transferred:', regGridItem.is_transferred);

  // 3. データ取得と行動予定表側のフィルタリング検証
  console.log('\n--- 3. 行動予定表(グリッド等)の表示フィルタ検証 ---');
  const allSchedules = await getJSON(`http://localhost:5000/api/schedules?start_date=${testDate}&end_date=${testDate}`);
  console.log(`全登録データ件数: ${allSchedules.length}件`);

  // 行動予定表側 (is_transferred === 1 のみ)
  const gridDisplayList = allSchedules.filter(s => s.is_transferred === 1);
  console.log('行動予定表の表示対象予定:', gridDisplayList.map(s => s.property_name));

  const assert = (cond, msg) => {
    if (cond) console.log(`[PASS] ${msg}`);
    else { console.error(`[FAIL] ${msg}`); process.exitCode = 1; }
  };

  assert(gridDisplayList.length === 1 && gridDisplayList[0].property_name === '行動予定表直接登録物件B', 
    '行動予定表には直接登録された予定のみが表示され、カレンダーから追加した未移行予定は表示されない');

  // 4. カレンダー列ヘッダーの移行条件の検証
  console.log('\n--- 4. カレンダー側の移行ボタン表示条件検証 ---');
  const displaySchedules = allSchedules.filter(s => s.work_type !== '休み' && s.work_type !== '公休');
  const hasRealSchedules = displaySchedules.length > 0;
  const hasUnprocessedTransfer = displaySchedules.some(s => s.is_transferred !== 1);
  const isAllTransferred = hasRealSchedules && !hasUnprocessedTransfer;

  console.log(`実予定あり: ${hasRealSchedules}, 未移行あり: ${hasUnprocessedTransfer}, すべて移行済み: ${isAllTransferred}`);
  assert(hasUnprocessedTransfer === true && isAllTransferred === false, 
    '未移行予定があるため、カレンダー側で「行動予定へ移行」ボタンが表示される判定になる');

  // 5. 移行APIの実行 (POST /api/schedules/transfer)
  console.log('\n--- 5. 移行処理APIの実行 ---');
  const transferRes = await postJSON('http://localhost:5000/api/schedules/transfer', { date: testDate });
  console.log('移行APIレスポンス:', transferRes);

  // 6. 移行後の表示検証
  console.log('\n--- 6. 移行後のフィルタ表示検証 ---');
  const allSchedulesAfter = await getJSON(`http://localhost:5000/api/schedules?start_date=${testDate}&end_date=${testDate}`);
  const gridDisplayListAfter = allSchedulesAfter.filter(s => s.is_transferred === 1);
  console.log('移行後の行動予定表の表示予定:', gridDisplayListAfter.map(s => s.property_name));

  assert(gridDisplayListAfter.length === 2, '移行後はカレンダーから追加した予定も行動予定表に表示されるようになる');

  // 再度カレンダー側の移行ボタン表示条件を検証
  const hasUnprocessedAfter = allSchedulesAfter.some(s => s.is_transferred !== 1);
  const isAllTransferredAfter = allSchedulesAfter.length > 0 && !hasUnprocessedAfter;
  console.log(`移行後の未移行あり: ${hasUnprocessedAfter}, すべて移行済み: ${isAllTransferredAfter}`);
  assert(hasUnprocessedAfter === false && isAllTransferredAfter === true, 
    '移行完了後はカレンダー側で「移行済み」バッジが表示され、移行ボタンが非表示になる判定になる');

  console.log('\n--- すべてのテスト完了 ---');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
