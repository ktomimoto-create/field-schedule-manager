console.log('--- 予定表（グリッド）ソート順検証テスト開始 ---');

// 1. テストデータの定義
const schedules = [
  { name: '予定A', course: '3', area: '大田区', unit_number: '1000' },
  { name: '予定B', course: '3', area: '品川区', unit_number: '500' },
  { name: '予定C', course: '3', area: '大田区', unit_number: '200' },
  { name: '予定D', course: '1', area: '世田谷区', unit_number: '3000' },
  { name: '予定E', course: '3', area: '大田区', unit_number: '非数値号機' },
  { name: '予定F', course: '3', area: '大田区', unit_number: '100' }
];

console.log('ソート前のデータ:');
schedules.forEach(s => {
  console.log(`名称: ${s.name}, コース: ${s.course}, エリア: ${s.area}, 号機: ${s.unit_number}`);
});

// 2. 実装したソートロジックの適用
const sortedSchedules = [...schedules].sort((a, b) => {
  // 1. コース番号（course）の昇順
  const aCourse = Number(a.course) || 999;
  const bCourse = Number(b.course) || 999;
  if (aCourse !== bCourse) {
    return aCourse - bCourse;
  }

  // 2. エリア（area）の昇順
  const aArea = a.area || '';
  const bArea = b.area || '';
  if (aArea !== bArea) {
    return aArea.localeCompare(bArea, 'ja');
  }

  // 3. 号機（unit_number）の若い順（数値比較、ダメなら文字列比較）
  const aUnit = Number(a.unit_number);
  const bUnit = Number(b.unit_number);
  const hasAUnit = a.unit_number && !isNaN(aUnit);
  const hasBUnit = b.unit_number && !isNaN(bUnit);

  if (hasAUnit && hasBUnit) {
    return aUnit - bUnit;
  }
  const aUnitStr = a.unit_number || '';
  const bUnitStr = b.unit_number || '';
  return aUnitStr.localeCompare(bUnitStr, 'ja');
});

console.log('\nソート後のデータ:');
sortedSchedules.forEach((s, idx) => {
  console.log(`${idx + 1}番目 - 名称: ${s.name}, コース: ${s.course}, エリア: ${s.area}, 号機: ${s.unit_number}`);
});

const assert = (cond, msg) => {
  if (cond) console.log(`[PASS] ${msg}`);
  else { console.error(`[FAIL] ${msg}`); process.exitCode = 1; }
};

// 検証
assert(sortedSchedules[0].name === '予定D', '1番目はコース1の予定D');
assert(sortedSchedules[1].name === '予定F', '2番目はコース3、大田区、号機100の予定F');
assert(sortedSchedules[2].name === '予定C', '3番目はコース3、大田区、号機200の予定C');
assert(sortedSchedules[3].name === '予定A', '4番目はコース3、大田区、号機1000の予定A');
assert(sortedSchedules[4].name === '予定E', '5番目はコース3、大田区、号機非数値の予定E (文字列ソート判定)');
assert(sortedSchedules[5].name === '予定B', '6番目はコース3、品川区、号機500の予定B (エリア品川区のため一番後ろへ)');

console.log('\n--- すべてのテスト完了 ---');
