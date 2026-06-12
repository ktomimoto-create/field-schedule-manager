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
  console.log('--- コース番号基準区分 & ソート 動作テスト開始 ---');

  // 1. スタッフマスタの取得
  console.log('スタッフマスタを取得中...');
  const staffs = await getJSON('http://localhost:5000/api/staff');
  const sato = staffs.find(s => s.name === '佐藤');
  console.log(`佐藤さんのデフォルトコース: ${sato ? sato.default_course : '見つかりません'}`);
  if (!sato) {
    console.error('佐藤さんが見つかりません。テストを中断します。');
    return;
  }

  // 2. 一括インポートデータのシミュレーションと補正ロジックの適用
  console.log('\n--- テスト1: フロントエンドにおけるコースと区分の自動補正シミュレーション ---');
  const originalImportData = [
    { work_type: '設置', property_name: 'テスト設置物件A', staff_name: '佐藤', date: '2026-06-12' },
    { work_type: '委託', property_name: 'テスト委託物件B', staff_name: '佐藤', date: '2026-06-12' },
    { work_type: '障害', property_name: 'テスト障害物件C', staff_name: '佐藤', date: '2026-06-12' },
    { work_type: '保守', property_name: 'テスト保守物件D', staff_name: '佐藤', date: '2026-06-12' }
  ];

  // フロントエンドで実装したコース番号および区分自動決定ロジック
  const finalItems = originalImportData.map(original => {
    let finalItem = { ...original, status: 'confirmed' };
    
    // コース自動判定
    const workType = finalItem.work_type ? finalItem.work_type.trim() : '';
    if (workType === '設置') {
      finalItem.course = '100';
    } else if (workType === '委託') {
      finalItem.course = '121';
    } else {
      const staffName = finalItem.staff_name ? finalItem.staff_name.trim() : '';
      if (staffName) {
        const matchedStaff = staffs.find(s => s.name === staffName);
        if (matchedStaff && matchedStaff.default_course) {
          finalItem.course = matchedStaff.default_course;
        } else {
          finalItem.course = original.course || '';
        }
      } else {
        finalItem.course = original.course || '';
      }
    }

    // 区分自動判定（コース番号基準: 1〜26 は FTS、それ以外は 委託）
    const courseStr = String(finalItem.course).trim();
    const courseNum = Number(courseStr);
    if (courseStr !== '' && !isNaN(courseNum) && courseNum >= 1 && courseNum <= 26) {
      finalItem.division = 'FTS';
    } else {
      finalItem.division = '委託';
    }

    return finalItem;
  });

  console.log('補正後の登録予定データ:');
  finalItems.forEach(item => {
    console.log(`物件名: ${item.property_name}, 種別: ${item.work_type}, コース: ${item.course}, 区分: ${item.division}`);
  });

  // 検証
  const assert = (cond, msg) => {
    if (cond) console.log(`[PASS] ${msg}`);
    else { console.error(`[FAIL] ${msg}`); process.exitCode = 1; }
  };

  assert(finalItems[0].course === '100' && finalItems[0].division === '委託', '「設置」はコース100、区分「委託」になる');
  assert(finalItems[1].course === '121' && finalItems[1].division === '委託', '「委託」はコース121、区分「委託」になる');
  assert(finalItems[2].course === '8' && finalItems[2].division === 'FTS', '「障害」はコース8、区分「FTS」になる');
  assert(finalItems[3].course === '8' && finalItems[3].division === 'FTS', '「保守」はコース8、区分「FTS」になる');

  // 3. データベースへの登録（インポートAPI呼び出し）
  console.log('\n--- テスト2: インポートAPIの実行とデータベース保存確認 ---');
  try {
    const importRes = await postJSON('http://localhost:5000/api/schedules/bulk', { schedules: finalItems }, { 'X-User-Email': 'test@example.com' });
    console.log('一括登録APIレスポンス:', importRes);
  } catch (err) {
    console.error('一括登録APIでエラーが発生しました:', err.message);
    return;
  }

  // 登録されたスケジュールを取得
  const schedules = await getJSON('http://localhost:5000/api/schedules?start_date=2026-06-12&end_date=2026-06-12');
  console.log('登録済みの予定リスト:');
  schedules.forEach(s => {
    console.log(`ID: ${s.id}, 物件名: ${s.property_name}, コース: ${s.course}, 区分: ${s.division}, 対応者: ${s.staff_name}`);
  });

  const registeredA = schedules.find(s => s.property_name === 'テスト設置物件A');
  const registeredB = schedules.find(s => s.property_name === 'テスト委託物件B');
  const registeredC = schedules.find(s => s.property_name === 'テスト障害物件C');

  assert(registeredA && registeredA.course === '100' && registeredA.division === '委託', 'データベース上: 「設置」物件のコースが100、区分が委託');
  assert(registeredB && registeredB.course === '121' && registeredB.division === '委託', 'データベース上: 「委託」物件のコースが121、区分が委託');
  assert(registeredC && registeredC.course === '8' && registeredC.division === 'FTS', 'データベース上: 「障害」物件のコースが8、区分がFTS');

  // 4. カレンダー表示順ソートのシミュレーション検証
  console.log('\n--- テスト3: カレンダーソート順（FTS優先、委託、その他、それぞれコース順）の検証 ---');

  // テストソートデータ
  const testList = [
    { name: '物件X', division: '委託', course: '92' },
    { name: '物件Y', division: 'FTS', course: '8' },
    { name: '物件Z', division: 'FTS', course: '2' },
    { name: '物件W', division: '委託', course: '90' },
    { name: '物件V', division: 'その他', course: '10' }
  ];

  // カレンダーソートロジック
  testList.sort((a, b) => {
    const getDivPriority = (div) => {
      if (div === 'FTS') return 1;
      if (div === '委託') return 2;
      return 3;
    };

    const aPriority = getDivPriority(a.division);
    const bPriority = getDivPriority(b.division);

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    const aCourse = Number(a.course) || 999;
    const bCourse = Number(b.course) || 999;
    return aCourse - bCourse;
  });

  console.log('ソート結果:');
  testList.forEach(item => {
    console.log(`物件名: ${item.name}, 区分: ${item.division}, コース: ${item.course}`);
  });

  assert(testList[0].name === '物件Z', '1番目は FTS コース2');
  assert(testList[1].name === '物件Y', '2番目は FTS コース8');
  assert(testList[2].name === '物件W', '3番目は 委託 コース90');
  assert(testList[3].name === '物件X', '4番目は 委託 コース92');
  assert(testList[4].name === '物件V', '5番目は その他 コース10');

  console.log('\n--- すべてのテスト完了 ---');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
