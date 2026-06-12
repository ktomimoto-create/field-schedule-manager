import express from 'express';
import cors from 'cors';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// データベースのセットアップ
const dbPath = path.join(__dirname, 'database.sqlite');
let db: any;

async function initDb() {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // 物件マスタテーブルの作成
  await db.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_number TEXT NOT NULL,
      property_name TEXT NOT NULL,
      address TEXT,
      box_count INTEGER,
      model_type TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec('CREATE INDEX IF NOT EXISTS idx_properties_unit_number ON properties(unit_number)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_properties_property_name ON properties(property_name)');

  // 物件マスタが空の場合はダミーデータを投入（10,000件）
  const propCount = await db.get('SELECT COUNT(*) as count FROM properties');
  if (propCount.count === 0) {
    console.log('Generating dummy property master data (10,000 items)...');
    await db.run('BEGIN TRANSACTION');
    const prefectures = ['東京', '神奈川', '埼玉', '千葉', '長野'];
    const cities = ['世田谷区', '川崎市宮前区', 'さいたま市大宮区', '船橋市', '松本市'];
    const models = ['Type-A', 'Type-B', 'Type-C', 'Type-D'];
    
    const names = [
      'エル・コモド', 'ドレッセ', 'サンライズ', 'グリーンヒル', 'メゾン・ド', 
      'パークハイツ', 'コンフォート', 'グランディール', 'シャトー', 'ビューハイツ'
    ];
    const suffixes = ['葛西', '下馬', '宮前平', '大宮', '松本', '船橋', '世田谷', '渋谷', '新宿', '横浜'];

    for (let i = 1; i <= 10000; i++) {
      const unitNum = String(100000 + i);
      const nameBase = names[i % names.length];
      const nameSuffix = suffixes[(i + Math.floor(i / names.length)) % suffixes.length];
      const propName = `${nameBase}${nameSuffix}第${Math.ceil(i / 100)}棟`;
      
      const pref = prefectures[i % prefectures.length];
      const city = cities[i % cities.length];
      const address = `${pref}${city} ${i % 10}-${i % 3}`;
      
      const boxCount = 4 + (i % 16);
      const modelType = models[i % models.length];

      await db.run(
        'INSERT INTO properties (unit_number, property_name, address, box_count, model_type) VALUES (?, ?, ?, ?, ?)',
        [unitNum, propName, address, boxCount, modelType]
      );
    }
    await db.run('COMMIT');
    console.log('Property master dummy data generation completed.');
  }

  // スタッフ（対応者）テーブルの作成
  await db.exec(`
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      default_course TEXT,
      is_active INTEGER DEFAULT 1,
      role TEXT DEFAULT 'user'
    )
  `);

  // スケジュール（予定）テーブルの作成
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL, -- 'draft' (仮), 'confirmed' (確定), 'cancelled' (キャンセル)
      division TEXT, -- 区分
      type TEXT, -- タイプ
      box TEXT, -- BOX
      unit_number TEXT, -- 号機
      property_name TEXT NOT NULL, -- 物件名
      work_type TEXT, -- 種別 (フリー、定期、工事、保守、障害対応など)
      description TEXT, -- 作業内容
      target_time TEXT, -- 時間
      date TEXT NOT NULL, -- YYYY-MM-DD
      staff_id INTEGER, -- 対応者
      area TEXT, -- エリア
      prefecture TEXT, -- 県別
      transport TEXT, -- 移動
      co_worker TEXT, -- 同行者
      request_number TEXT, -- 依頼番号 (旧 他部署等)
      time_limit TEXT, -- TIME
      course TEXT, -- コース
      result TEXT, -- 結果 (空欄 または '完了' など)
      started_at TEXT, -- 開始時刻 (HH:MM)
      completed_at TEXT, -- 完了時刻 (HH:MM)
      notes TEXT, -- 備考
      report_notes TEXT, -- 対応報告メモ
      disorder_type TEXT, -- 障害区分
      level TEXT, -- level
      level_3 TEXT, -- level 3
      sort_order INTEGER DEFAULT 0,
      is_transferred INTEGER DEFAULT 0, -- 行動予定表へ移行済みフラグ
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (staff_id) REFERENCES staff (id)
    )
  `);

  // 操作履歴テーブルの作成
  await db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER,
      action TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      property_name TEXT,
      details TEXT,
      timestamp TEXT DEFAULT (DATETIME('now', 'localtime'))
    )
  `);

  // インデックスの作成
  await db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_schedule_id ON audit_logs(schedule_id)');

  // 項目（種別）マスタテーブルの作成
  await db.exec(`
    CREATE TABLE IF NOT EXISTS work_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_internal INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    )
  `);

  // 既存のテーブルに対して sort_order カラムを安全に追加
  try {
    await db.exec('ALTER TABLE work_types ADD COLUMN sort_order INTEGER DEFAULT 0');
  } catch (err) {
    // カラムが既に存在する場合はエラーを無視
  }

  // 「休み」「公休」を「休暇」に移行・統合
  try {
    const hasVacation = await db.get("SELECT id FROM work_types WHERE name = '休暇'");
    if (!hasVacation) {
      await db.run("UPDATE work_types SET name = '休暇' WHERE name = '休み'");
    }
    await db.run("DELETE FROM work_types WHERE name = '公休'");
    
    // スケジュールデータも移行
    await db.run("UPDATE schedules SET work_type = '休暇' WHERE work_type IN ('休み', '公休', '休')");
    await db.run("UPDATE schedules SET property_name = '（休暇）' WHERE property_name IN ('（休み）', '(休み)')");
  } catch (err) {
    console.error('Failed to migrate holiday types:', err);
  }

  // 初期種別（work_types）の投入
  const initialTypes = [
    { name: '休暇', is_internal: 1, sort_order: 1 },
    { name: 'ミーティング', is_internal: 1, sort_order: 2 },
    { name: '会議', is_internal: 1, sort_order: 3 },
    { name: '研修', is_internal: 1, sort_order: 4 },
    { name: '社内', is_internal: 1, sort_order: 5 },
    { name: '面談', is_internal: 1, sort_order: 6 },
    { name: '障害', is_internal: 0, sort_order: 1 },
    { name: '工事', is_internal: 0, sort_order: 2 },
    { name: '定期', is_internal: 0, sort_order: 3 },
    { name: '保守', is_internal: 0, sort_order: 4 },
    { name: '依頼有/非認可', is_internal: 0, sort_order: 5 },
    { name: 'フリー', is_internal: 0, sort_order: 6 }
  ];
  for (const item of initialTypes) {
    await db.run(
      'INSERT OR IGNORE INTO work_types (name, is_internal, sort_order) VALUES (?, ?, ?)',
      [item.name, item.is_internal, item.sort_order]
    );
  }

  // 90日より古いログの自動削除
  await db.exec("DELETE FROM audit_logs WHERE timestamp < DATETIME('now', '-90 days')");

  // 初期スタッフの投入
  const initialStaff = [
    { name: '平本', email: 'hiramoto@example.com', course: '1', role: 'user' },
    { name: '築地', email: 'tsukiji@example.com', course: '2', role: 'user' },
    { name: '藤井', email: 'fujii@example.com', course: '3', role: 'user' },
    { name: '神崎', email: 'kanzaki@example.com', course: '4', role: 'user' },
    { name: '原',   email: 'hara@example.com', course: '5', role: 'user' },
    { name: '土橋', email: 'dobashi@example.com', course: '6', role: 'user' },
    { name: '藤田', email: 'fujita@example.com', course: '7', role: 'user' },
    { name: '佐藤', email: 'sato@example.com', course: '8', role: 'admin' }, // 佐藤さんを管理者に設定
    { name: '吉沼', email: 'yoshinuma@example.com', course: '9', role: 'user' },
    { name: '小山', email: 'koyama@example.com', course: '10', role: 'user' },
    { name: '高橋', email: 'takahashi@example.com', course: '11', role: 'user' },
    { name: '畦崎', email: 'unezaki@example.com', course: '12', role: 'user' },
    { name: 'フーギー', email: 'foogy@example.com', course: '13', role: 'user' },
    { name: '松下', email: 'matsushita@example.com', course: '14', role: 'user' },
    { name: '淺沼', email: 'asanuma@example.com', course: '15', role: 'user' },
    { name: '山内', email: 'yamauchi@example.com', course: '16', role: 'user' },
    { name: '中川', email: 'nakagawa@example.com', course: '17', role: 'user' },
    { name: '阿部', email: 'abe@example.com', course: '18', role: 'user' },
    { name: '藤崎', email: 'fujisaki@example.com', course: '19', role: 'user' },
    { name: '本間', email: 'homma@example.com', course: '20', role: 'user' },
    { name: '丸山', email: 'maruyama@example.com', course: '21', role: 'user' },
    { name: '清水', email: 'shimizu@example.com', course: '22', role: 'user' },
    { name: '塙',   email: 'hanawa@example.com', course: '23', role: 'user' },
    { name: '伊比', email: 'ibi@example.com', course: '24', role: 'user' },
    { name: '石山', email: 'ishiyama@example.com', course: '25', role: 'user' },
    { name: '平井', email: 'hirai@example.com', course: '26', role: 'user' },
    { name: 'FE武田', email: 'takeda@example.com', course: '90', role: 'user' },
    { name: 'SF濱田', email: 'hamada@example.com', course: '91', role: 'user' },
    { name: 'FR岡崎', email: 'okazaki@example.com', course: '92', role: 'user' },
    { name: 'FR土屋', email: 'tsuchiya@example.com', course: '93', role: 'user' },
    { name: 'FR宮本', email: 'miyamoto@example.com', course: '94', role: 'user' },
    { name: 'FR金谷', email: 'kanaya@example.com', course: '95', role: 'user' }
  ];

  const staffCount = await db.get('SELECT COUNT(*) as count FROM staff');
  if (staffCount.count === 0) {
    for (const member of initialStaff) {
      await db.run(
        'INSERT INTO staff (name, email, default_course, role) VALUES (?, ?, ?, ?)',
        [member.name, member.email, member.course, member.role]
      );
    }
  }

  // 既存のテーブルに対して is_transferred カラムを安全に追加
  try {
    await db.exec('ALTER TABLE schedules ADD COLUMN is_transferred INTEGER DEFAULT 0');
  } catch (err) {
    // カラムが既に存在する場合はエラーを無視
  }

  // デモ用予定データの初期投入 (schedules テーブルが空の時のみ)
  const schedulesCount = await db.get('SELECT COUNT(*) as count FROM schedules');
  if (schedulesCount.count === 0) {
    console.log('Generating demo schedule data (with course values)...');
    const demoSchedules = [
      {
        status: 'confirmed',
        division: 'FTS',
        type: '',
        box: '22420',
        unit_number: '',
        property_name: 'フランセ',
        work_type: '障害',
        description: '定期メンテナンス完了報告。全ボックス。署名/居住者ともボックス内の消防用注意シールが一部剥がれており',
        target_time: '',
        date: '2026-06-12',
        staff_name: '原',
        co_worker: '',
        request_number: '12604010057',
        time_limit: '',
        course: '5',
        result: '完了',
        completed_at: '10:30',
        notes: '',
        disorder_type: '貼り紙・シール貼り（剥がれ',
        level: 'E',
        level_3: ''
      },
      {
        status: 'confirmed',
        division: 'FTS',
        type: '',
        box: '',
        unit_number: '2902',
        property_name: 'エル・コモド葛西',
        work_type: '依頼有/非認可',
        description: '＜2次対応＞ 通信モデム＋CPUボード基板',
        target_time: '09:00',
        date: '2026-06-12',
        staff_name: '原',
        co_worker: '',
        request_number: '1260520224',
        time_limit: '',
        course: '5',
        result: '',
        completed_at: null,
        notes: '',
        disorder_type: '停止画面',
        level: 'B',
        level_3: ''
      },
      {
        status: 'confirmed',
        division: 'FTS',
        type: '',
        box: '60630',
        unit_number: '',
        property_name: 'Sオカステーロ宮前台',
        work_type: '障害',
        description: 'バーコードリーダーランプ点灯するが読み取らない',
        target_time: '必ず',
        date: '2026-06-12',
        staff_name: '原',
        co_worker: '',
        request_number: '12605280122',
        time_limit: '',
        course: '5',
        result: '',
        completed_at: null,
        notes: '',
        disorder_type: 'デバイス（LCD/CR',
        level: 'D',
        level_3: ''
      },
      {
        status: 'confirmed',
        division: 'FTS',
        type: '',
        box: '722310',
        unit_number: '',
        property_name: 'Le Plus八潮',
        work_type: '障害',
        description: '運用開始日：2026/05/25 ＜遮断対応＞ 簡易テスト時開かない',
        target_time: '12:00',
        date: '2026-06-12',
        staff_name: '小山',
        co_worker: '',
        request_number: '12605050275',
        time_limit: '',
        course: '10',
        result: '',
        completed_at: null,
        notes: '',
        disorder_type: 'メールポスト関連',
        level: 'C',
        level_3: ''
      },
      {
        status: 'confirmed',
        division: 'FTS',
        type: '',
        box: '50175',
        unit_number: '',
        property_name: '世田谷アインス東の街',
        work_type: '依頼有/非認可',
        description: 'スタンド一体型スタンプ',
        target_time: '17:00まで',
        date: '2026-06-12',
        staff_name: '藤田',
        co_worker: '',
        request_number: '12605290205',
        time_limit: '',
        course: '7',
        result: '',
        completed_at: null,
        notes: '',
        disorder_type: 'デバイス（LCD/CR',
        level: 'D',
        level_3: ''
      },
      {
        status: 'confirmed',
        division: 'FTS',
        type: '',
        box: '560249',
        unit_number: '',
        property_name: 'ドレッセ世田谷下馬',
        work_type: '依頼有/非認可',
        description: '【2次対応】t-rental用BOXバッテリーBOXユニット',
        target_time: '14:00迄',
        date: '2026-06-12',
        staff_name: '藤田',
        co_worker: '渡辺',
        request_number: '12605180159',
        time_limit: '',
        course: '7',
        result: '',
        completed_at: null,
        notes: '清田さんここ終わったら帰社',
        disorder_type: 't-rent関連',
        level: 'D',
        level_3: ''
      },
      {
        status: 'confirmed',
        division: 'FTS',
        type: 'KU',
        box: '12',
        unit_number: '540554',
        property_name: '林光久庵コープ',
        work_type: '工事',
        description: '既存機物件 6/9 朝〜脱着 システムチェック。保守なし（増設及び管理機追加13時〜）',
        target_time: 'AM',
        date: '2026-06-12',
        staff_name: '神崎',
        co_worker: '清田',
        request_number: '',
        time_limit: '',
        course: '4',
        result: '完了',
        completed_at: '15:15',
        notes: '',
        disorder_type: '点検・清掃',
        level: 'E',
        level_3: ''
      },
      {
        status: 'confirmed',
        division: 'FTS',
        type: 'PU',
        box: '14',
        unit_number: '410071',
        property_name: 'サーパス高宮',
        work_type: '工事',
        description: '管理機増設案件（ロッカー入れ替え、リニューアル）（設置はソシオを担当）【依頼有】',
        target_time: '14:00',
        date: '2026-06-13',
        staff_name: '平本',
        co_worker: '',
        request_number: '',
        time_limit: '',
        course: '1',
        result: '',
        completed_at: null,
        notes: '',
        disorder_type: '',
        level: '',
        level_3: ''
      }
    ];

    for (const item of demoSchedules) {
      const matchedStaff = await db.get('SELECT id FROM staff WHERE name = ?', [item.staff_name]);
      const staffId = matchedStaff ? matchedStaff.id : null;

      await db.run(`
        INSERT INTO schedules (
          status, division, type, box, unit_number, property_name, work_type, description,
          target_time, date, staff_id, area, prefecture, transport, co_worker,
          request_number, time_limit, course, result, completed_at, notes, disorder_type, level, level_3,
          is_transferred
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `, [
        item.status, item.division, item.type, item.box, item.unit_number, item.property_name, item.work_type, item.description,
        item.target_time, item.date, staffId,
        item.staff_name === '原' ? '宮前区' : (item.staff_name === '小山' ? '八潮市' : (item.staff_name === '藤田' ? '世田谷区' : (item.staff_name === '神崎' ? '横浜市' : (item.staff_name === '平本' ? '松本市' : '')))),
        item.staff_name === '原' ? '神奈川' : (item.staff_name === '小山' ? '埼玉' : (item.staff_name === '藤田' ? '東京' : (item.staff_name === '神崎' ? '神奈川' : (item.staff_name === '平本' ? '長野' : '')))),
        item.staff_name === '平本' ? '車' : '',
        item.co_worker, item.request_number, item.time_limit, item.course, item.result, item.completed_at, item.notes, item.disorder_type, item.level, item.level_3
      ]);
    }
    console.log('Demo schedule data generation completed.');
  }
}

async function writeAuditLog(scheduleId: number | string | null, action: string, changedBy: string, propertyName: string | null, details: string) {
  try {
    const sId = scheduleId ? Number(scheduleId) : null;
    await db.run(
      'INSERT INTO audit_logs (schedule_id, action, changed_by, property_name, details) VALUES (?, ?, ?, ?, ?)',
      [sId, action, changedBy || 'system', propertyName || null, details]
    );
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

// --- API エンドポイント ---

// 0. 操作履歴一覧の取得 (Paging対応)
app.get('/api/audit_logs', async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const logs = await db.all(
      'SELECT * FROM audit_logs ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 1. スタッフ一覧の取得
app.get('/api/staff', async (req, res) => {
  try {
    const staff = await db.all('SELECT * FROM staff');
    res.json(staff);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. スケジュール一覧の取得
app.get('/api/schedules', async (req, res) => {
  try {
    const { start_date, end_date, staff_id, status } = req.query;
    
    let query = `
      SELECT s.*, st.name as staff_name, st.email as staff_email, st.default_course as staff_course 
      FROM schedules s
      LEFT JOIN staff st ON s.staff_id = st.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (start_date) {
      query += ' AND s.date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND s.date <= ?';
      params.push(end_date);
    }
    if (staff_id) {
      query += ' AND s.staff_id = ?';
      params.push(Number(staff_id));
    }
    if (status) {
      query += ' AND s.status = ?';
      params.push(status);
    }

    query += ' ORDER BY s.date ASC, s.sort_order ASC, s.target_time ASC';

    const schedules = await db.all(query, params);
    res.json(schedules);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. スケジュール詳細
app.get('/api/schedules/:id', async (req, res) => {
  try {
    const schedule = await db.get(`
      SELECT s.*, st.name as staff_name, st.email as staff_email, st.default_course as staff_course 
      FROM schedules s
      LEFT JOIN staff st ON s.staff_id = st.id
      WHERE s.id = ?
    `, [req.params.id]);

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    res.json(schedule);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. スケジュールの作成
app.post('/api/schedules', async (req, res) => {
  try {
    const { 
      status, division, type, box, unit_number, property_name, work_type, description, 
      target_time, date, staff_id, staff_name, area, prefecture, transport, co_worker, 
      request_number, time_limit, course, result, started_at, completed_at, notes, report_notes, disorder_type, level, level_3,
      is_transferred
    } = req.body;
    
    if (property_name === undefined || property_name === null || !status || !date) {
      return res.status(400).json({ error: 'Property name, status, and date are required' });
    }

    // 手動入力スタッフ対応
    let finalStaffId = staff_id ? Number(staff_id) : null;
    if (!finalStaffId && staff_name && staff_name.trim() !== '') {
      const name = staff_name.trim();
      const cVal = course ? String(course).trim() : '';

      let existingStaff = null;
      if (cVal !== '') {
        // 優先度1: name と default_course が一致するスタッフ
        existingStaff = await db.get(
          'SELECT id FROM staff WHERE name = ? AND default_course = ?',
          [name, cVal]
        );
        
        // 優先度2: name が一致して default_course が null のスタッフ
        if (!existingStaff) {
          existingStaff = await db.get(
            'SELECT id FROM staff WHERE name = ? AND default_course IS NULL',
            [name]
          );
          if (existingStaff) {
            // nullだったdefault_courseを、今回指定されたコースで更新
            await db.run(
              'UPDATE staff SET default_course = ? WHERE id = ?',
              [cVal, existingStaff.id]
            );
          }
        }
      } else {
        // コース未指定の場合は、default_course が null のスタッフを優先し、なければどれか1人を割り当て
        existingStaff = await db.get(
          'SELECT id FROM staff WHERE name = ? ORDER BY CASE WHEN default_course IS NULL THEN 0 ELSE 1 END ASC LIMIT 1',
          [name]
        );
      }

      if (existingStaff) {
        finalStaffId = existingStaff.id;
      } else {
        // 新規スタッフの自動マスタ登録
        const insertStaffResult = await db.run(
          'INSERT INTO staff (name, default_course) VALUES (?, ?)',
          [name, cVal !== '' ? cVal : null]
        );
        finalStaffId = insertStaffResult.lastID;
      }
    }

    let finalStartedAt = started_at || null;
    let finalCompletedAt = completed_at || null;
    if (result === '作業中' && !finalStartedAt) {
      finalStartedAt = new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });
    }
    if (result === '完了' && !finalCompletedAt) {
      finalCompletedAt = new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });
    }

    const resultDb = await db.run(`
      INSERT INTO schedules (
        status, division, type, box, unit_number, property_name, work_type, description, 
        target_time, date, staff_id, area, prefecture, transport, co_worker, 
        request_number, time_limit, course, result, started_at, completed_at, notes, report_notes, disorder_type, level, level_3,
        is_transferred
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      status, division || null, type || null, box || null, unit_number || null, property_name, work_type || null, description || null,
      target_time || null, date, finalStaffId, area || null, prefecture || null, transport || null, 
      co_worker || null, request_number || null, time_limit || null, course || null, result || null, finalStartedAt, finalCompletedAt, notes || null, report_notes || null,
      disorder_type || null, level || null, level_3 || null,
      is_transferred !== undefined ? Number(is_transferred) : 0
    ]);

    const changedBy = (req.headers['x-user-email'] as string) || '不明なユーザー';
    await writeAuditLog(
      resultDb.lastID,
      'INSERT',
      changedBy,
      property_name,
      `予定を追加しました。日付: ${date}, 種別: "${work_type || '一般'}"`
    );

    const newSchedule = await db.get('SELECT * FROM schedules WHERE id = ?', [resultDb.lastID]);
    res.status(201).json(newSchedule);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 9. スケジュールの並び順（sort_order）を一括更新
app.put('/api/schedules/reorder', async (req, res) => {
  try {
    const { orders } = req.body; // [{ id: 1, sort_order: 0 }, { id: 2, sort_order: 1 }]
    if (!orders || !Array.isArray(orders)) {
      return res.status(400).json({ error: 'orders array is required' });
    }

    await db.run('BEGIN TRANSACTION');
    for (const item of orders) {
      await db.run(
        'UPDATE schedules SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [Number(item.sort_order), Number(item.id)]
      );
    }
    await db.run('COMMIT');

    res.json({ success: true });
  } catch (error: any) {
    await db.run('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

// 5. スケジュールの更新
app.put('/api/schedules/:id', async (req, res) => {
  try {
    const { 
      status, division, type, box, unit_number, property_name, work_type, description, 
      target_time, date, staff_id, staff_name, area, prefecture, transport, co_worker, 
      request_number, time_limit, course, result, started_at, completed_at, notes, report_notes, disorder_type, level, level_3,
      is_transferred
    } = req.body;
    const scheduleId = req.params.id;

    const existing = await db.get('SELECT * FROM schedules WHERE id = ?', [scheduleId]);
    if (!existing) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // 手動入力スタッフ対応
    let finalStaffId = staff_id !== undefined ? (staff_id ? Number(staff_id) : null) : existing.staff_id;
    if (staff_name !== undefined && staff_name !== null && staff_name.trim() !== '') {
      const name = staff_name.trim();
      const cVal = (course !== undefined && course !== null) ? String(course).trim() : (existing.course ? String(existing.course).trim() : '');

      let existingStaff = null;
      if (cVal !== '') {
        // 優先度1: name と default_course が一致するスタッフ
        existingStaff = await db.get(
          'SELECT id FROM staff WHERE name = ? AND default_course = ?',
          [name, cVal]
        );
        
        // 優先度2: name が一致して default_course が null のスタッフ
        if (!existingStaff) {
          existingStaff = await db.get(
            'SELECT id FROM staff WHERE name = ? AND default_course IS NULL',
            [name]
          );
          if (existingStaff) {
            await db.run(
              'UPDATE staff SET default_course = ? WHERE id = ?',
              [cVal, existingStaff.id]
            );
          }
        }
      } else {
        existingStaff = await db.get(
          'SELECT id FROM staff WHERE name = ? ORDER BY CASE WHEN default_course IS NULL THEN 0 ELSE 1 END ASC LIMIT 1',
          [name]
        );
      }

      if (existingStaff) {
        finalStaffId = existingStaff.id;
      } else {
        const insertStaffResult = await db.run(
          'INSERT INTO staff (name, default_course) VALUES (?, ?)',
          [name, cVal !== '' ? cVal : null]
        );
        finalStaffId = insertStaffResult.lastID;
      }
    }

    let finalStartedAt = started_at !== undefined ? started_at : existing.started_at;
    if (result !== undefined) {
      if (result === '作業中') {
        if (existing.result !== '作業中' || !existing.started_at) {
          finalStartedAt = new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });
        }
      } else if (result !== '完了' && result !== '作業中') {
        finalStartedAt = null;
      }
    }

    let finalCompletedAt = existing.completed_at;
    if (result !== undefined) {
      if (result === '完了') {
        if (existing.result !== '完了' || !existing.completed_at) {
          finalCompletedAt = new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });
        }
      } else {
        finalCompletedAt = null;
      }
    }

    await db.run(`
      UPDATE schedules 
      SET 
        status = ?, division = ?, type = ?, box = ?, unit_number = ?, property_name = ?, work_type = ?, description = ?, 
        target_time = ?, date = ?, staff_id = ?, area = ?, prefecture = ?, transport = ?, co_worker = ?, 
        request_number = ?, time_limit = ?, course = ?, result = ?, started_at = ?, completed_at = ?, notes = ?, report_notes = ?, disorder_type = ?, level = ?, level_3 = ?,
        is_transferred = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      status !== undefined ? status : existing.status,
      division !== undefined ? division : existing.division,
      type !== undefined ? type : existing.type,
      box !== undefined ? box : existing.box,
      unit_number !== undefined ? unit_number : existing.unit_number,
      property_name !== undefined ? property_name : existing.property_name,
      work_type !== undefined ? work_type : existing.work_type,
      description !== undefined ? description : existing.description,
      target_time !== undefined ? target_time : existing.target_time,
      date !== undefined ? date : existing.date,
      finalStaffId,
      area !== undefined ? area : existing.area,
      prefecture !== undefined ? prefecture : existing.prefecture,
      transport !== undefined ? transport : existing.transport,
      co_worker !== undefined ? co_worker : existing.co_worker,
      request_number !== undefined ? request_number : existing.request_number,
      time_limit !== undefined ? time_limit : existing.time_limit,
      course !== undefined ? course : existing.course,
      result !== undefined ? result : existing.result,
      finalStartedAt,
      finalCompletedAt,
      notes !== undefined ? notes : existing.notes,
      report_notes !== undefined ? report_notes : existing.report_notes,
      disorder_type !== undefined ? disorder_type : existing.disorder_type,
      level !== undefined ? level : existing.level,
      level_3 !== undefined ? level_3 : existing.level_3,
      is_transferred !== undefined ? Number(is_transferred) : existing.is_transferred,
      scheduleId
    ]);

    const updatedSchedule = await db.get('SELECT * FROM schedules WHERE id = ?', [scheduleId]);

    // 変更履歴の生成
    const changedBy = (req.headers['x-user-email'] as string) || '不明なユーザー';
    const changeList: string[] = [];
    if (existing.property_name !== updatedSchedule.property_name) changeList.push(`物件名: "${existing.property_name}" -> "${updatedSchedule.property_name}"`);
    if (existing.date !== updatedSchedule.date) changeList.push(`日付: "${existing.date}" -> "${updatedSchedule.date}"`);
    if (existing.work_type !== updatedSchedule.work_type) changeList.push(`種別: "${existing.work_type || 'なし'}" -> "${updatedSchedule.work_type || 'なし'}"`);
    if (existing.target_time !== updatedSchedule.target_time) changeList.push(`指定時間: "${existing.target_time || 'なし'}" -> "${updatedSchedule.target_time || 'なし'}"`);
    if (existing.result !== updatedSchedule.result) changeList.push(`結果: "${existing.result || '未対応'}" -> "${updatedSchedule.result || '未対応'}"`);
    if (existing.started_at !== updatedSchedule.started_at) changeList.push(`開始時刻: "${existing.started_at || 'なし'}" -> "${updatedSchedule.started_at || 'なし'}"`);
    if (existing.completed_at !== updatedSchedule.completed_at) changeList.push(`完了時刻: "${existing.completed_at || 'なし'}" -> "${updatedSchedule.completed_at || 'なし'}"`);
    if (existing.report_notes !== updatedSchedule.report_notes) changeList.push(`報告メモを変更しました`);
    if (existing.staff_id !== updatedSchedule.staff_id) {
      const oldStaff = existing.staff_id ? (await db.get('SELECT name FROM staff WHERE id = ?', [existing.staff_id]))?.name || '不明' : 'なし';
      const newStaff = updatedSchedule.staff_id ? (await db.get('SELECT name FROM staff WHERE id = ?', [updatedSchedule.staff_id]))?.name || '不明' : 'なし';
      changeList.push(`担当者: "${oldStaff}" -> "${newStaff}"`);
    }

    const logDetails = changeList.length > 0 ? `予定を更新しました。(${changeList.join(', ')})` : '予定を更新しました（詳細変更なし）。';
    await writeAuditLog(scheduleId, 'UPDATE', changedBy, updatedSchedule.property_name, logDetails);

    res.json(updatedSchedule);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. スケジュールの一括登録・更新 (Bulk Upsert)
app.post('/api/schedules/bulk', async (req, res) => {
  try {
    const { schedules: items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Schedules array is required' });
    }

    // トランザクションの開始
    await db.run('BEGIN TRANSACTION');

    const results = [];
    for (const item of items) {
      const { 
        id, status, division, type, box, unit_number, property_name, work_type, description, 
        target_time, date, staff_id, staff_name, area, prefecture, transport, co_worker, 
        request_number, time_limit, course, result, notes, disorder_type, level, level_3,
        is_transferred
      } = item;

      if (!property_name || !date) {
        // 必須項目（物件名、日付）がない行はスキップ
        continue;
      }

      // 手動入力された対応者名からスタッフIDを解決・新規登録
      let finalStaffId = staff_id ? Number(staff_id) : null;
      if (!finalStaffId && staff_name && staff_name.trim() !== '') {
        const name = staff_name.trim();
        const cVal = course ? String(course).trim() : '';

        let existingStaff = null;
        if (cVal !== '') {
          // 優先度1: name と default_course が一致するスタッフ
          existingStaff = await db.get(
            'SELECT id FROM staff WHERE name = ? AND default_course = ?',
            [name, cVal]
          );
          
          // 優先度2: name が一致して default_course が null のスタッフ
          if (!existingStaff) {
            existingStaff = await db.get(
              'SELECT id FROM staff WHERE name = ? AND default_course IS NULL',
              [name]
            );
            if (existingStaff) {
              await db.run(
                'UPDATE staff SET default_course = ? WHERE id = ?',
                [cVal, existingStaff.id]
              );
            }
          }
        } else {
          existingStaff = await db.get(
            'SELECT id FROM staff WHERE name = ? ORDER BY CASE WHEN default_course IS NULL THEN 0 ELSE 1 END ASC LIMIT 1',
            [name]
          );
        }

        if (existingStaff) {
          finalStaffId = existingStaff.id;
        } else {
          const insertStaffResult = await db.run(
            'INSERT INTO staff (name, default_course) VALUES (?, ?)',
            [name, cVal !== '' ? cVal : null]
          );
          finalStaffId = insertStaffResult.lastID;
        }
      }

      // 重複チェック: 指定されたID、または同一日付・同一物件名・同一対応者で既存レコードがあるか
      let existingSchedule = null;
      if (id) {
        existingSchedule = await db.get('SELECT * FROM schedules WHERE id = ?', [id]);
      } else {
        existingSchedule = await db.get(
          'SELECT * FROM schedules WHERE date = ? AND property_name = ? AND (staff_id = ? OR (staff_id IS NULL AND ? IS NULL))',
          [date, property_name, finalStaffId, finalStaffId]
        );
      }

      if (existingSchedule) {
        // 更新 (UPDATE)
        let finalCompletedAt = existingSchedule.completed_at;
        if (result !== undefined) {
          if (result === '完了') {
            if (existingSchedule.result !== '完了' || !existingSchedule.completed_at) {
              finalCompletedAt = new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });
            }
          } else {
            finalCompletedAt = null;
          }
        }

        await db.run(`
          UPDATE schedules 
          SET 
            status = ?, division = ?, type = ?, box = ?, unit_number = ?, work_type = ?, description = ?, 
            target_time = ?, staff_id = ?, area = ?, prefecture = ?, transport = ?, co_worker = ?, 
            request_number = ?, time_limit = ?, course = ?, result = ?, completed_at = ?, notes = ?, disorder_type = ?, level = ?, level_3 = ?,
            is_transferred = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [
          status || 'confirmed', division || null, type || null, box || null, unit_number || null, work_type || null, description || null,
          target_time || null, finalStaffId, area || null, prefecture || null, transport || null, 
          co_worker || null, request_number || null, time_limit || null, course || null, result || null, finalCompletedAt, notes || null,
          disorder_type || null, level || null, level_3 || null,
          is_transferred !== undefined ? Number(is_transferred) : existingSchedule.is_transferred,
          existingSchedule.id
        ]);
        results.push({ id: existingSchedule.id, action: 'updated' });
      } else {
        // 新規挿入 (INSERT)
        let finalCompletedAt = null;
        if (result === '完了') {
          finalCompletedAt = new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });
        }

        const resultDb = await db.run(`
          INSERT INTO schedules (
            status, division, type, box, unit_number, property_name, work_type, description, 
            target_time, date, staff_id, area, prefecture, transport, co_worker, 
            request_number, time_limit, course, result, completed_at, notes, disorder_type, level, level_3,
            is_transferred
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          status || 'confirmed', division || null, type || null, box || null, unit_number || null, property_name, work_type || null, description || null,
          target_time || null, date, finalStaffId, area || null, prefecture || null, transport || null, 
          co_worker || null, request_number || null, time_limit || null, course || null, result || null, finalCompletedAt, notes || null,
          disorder_type || null, level || null, level_3 || null,
          is_transferred !== undefined ? Number(is_transferred) : 0
        ]);
        results.push({ id: resultDb.lastID, action: 'created' });
      }
    }

    // コミット
    await db.run('COMMIT');

    const changedBy = (req.headers['x-user-email'] as string) || '不明なユーザー';
    const totalCount = results.length;
    const createdCount = results.filter(r => r.action === 'created').length;
    const updatedCount = results.filter(r => r.action === 'updated').length;
    await writeAuditLog(
      null, 
      'INSERT', 
      changedBy, 
      null, 
      `スプレッドシートから予定を一括インポートしました。(合計: ${totalCount}件, 新規: ${createdCount}件, 更新: ${updatedCount}件)`
    );

    res.status(200).json({ success: true, count: results.length, details: results });
  } catch (error: any) {
    // エラー時はロールバック
    await db.run('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

// 6.5. 指定日の全予定を移行済みに更新する API
app.post('/api/schedules/transfer', async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }
    await db.run(
      'UPDATE schedules SET is_transferred = 1, updated_at = CURRENT_TIMESTAMP WHERE date = ?',
      [date]
    );
    
    const changedBy = (req.headers['x-user-email'] as string) || '不明なユーザー';
    await writeAuditLog(null, 'UPDATE', changedBy, null, `${date} の予定をすべて行動予定表へ移行しました。`);
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. スケジュールの削除
app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const scheduleId = req.params.id;
    const changedBy = (req.headers['x-user-email'] as string) || '不明なユーザー';

    // 削除前に対象レコードの詳細を取得
    const existing = await db.get('SELECT * FROM schedules WHERE id = ?', [scheduleId]);

    const result = await db.run('DELETE FROM schedules WHERE id = ?', [scheduleId]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    if (existing) {
      await writeAuditLog(
        scheduleId,
        'DELETE',
        changedBy,
        existing.property_name,
        `予定を削除しました。日付: ${existing.date}, 種別: "${existing.work_type || '一般'}"`
      );
    }

    res.json({ message: 'Schedule deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8. スケジュールの結果（完了ステータスなど）のみを更新
app.patch('/api/schedules/:id/result', async (req, res) => {
  try {
    const { result, started_at, completed_at, report_notes } = req.body;
    const scheduleId = req.params.id;

    const existing = await db.get('SELECT * FROM schedules WHERE id = ?', [scheduleId]);
    if (!existing) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    let finalStartedAt = started_at !== undefined ? started_at : existing.started_at;
    if (result !== undefined) {
      if (result === '作業中') {
        if (existing.result !== '作業中' || !existing.started_at) {
          finalStartedAt = new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });
        }
      } else if (result !== '完了' && result !== '作業中') {
        finalStartedAt = null;
      }
    }

    let finalCompletedAt = completed_at !== undefined ? completed_at : existing.completed_at;
    if (result !== undefined) {
      if (result === '完了') {
        if (existing.result !== '完了' || !existing.completed_at) {
          finalCompletedAt = new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });
        }
      } else {
        finalCompletedAt = null;
      }
    }

    await db.run(`
      UPDATE schedules 
      SET result = ?, started_at = ?, completed_at = ?, report_notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      result !== undefined ? result : existing.result, 
      finalStartedAt, 
      finalCompletedAt, 
      report_notes !== undefined ? report_notes : existing.report_notes, 
      scheduleId
    ]);

    const updatedSchedule = await db.get('SELECT * FROM schedules WHERE id = ?', [scheduleId]);

    const changedBy = (req.headers['x-user-email'] as string) || '不明なユーザー';
    const changeList: string[] = [];
    if (existing.result !== updatedSchedule.result) changeList.push(`結果: "${existing.result || '未設定'}" -> "${updatedSchedule.result || '未設定'}"`);
    if (existing.started_at !== updatedSchedule.started_at) changeList.push(`開始: "${existing.started_at || 'なし'}" -> "${updatedSchedule.started_at || 'なし'}"`);
    if (existing.completed_at !== updatedSchedule.completed_at) changeList.push(`完了: "${existing.completed_at || 'なし'}" -> "${updatedSchedule.completed_at || 'なし'}"`);
    if (existing.report_notes !== updatedSchedule.report_notes) changeList.push(`報告メモ更新`);

    const logDetails = changeList.length > 0 ? `対応結果を更新しました。(${changeList.join(', ')})` : '対応結果を更新しました。';
    await writeAuditLog(scheduleId, 'UPDATE', changedBy, updatedSchedule.property_name, logDetails);

    res.json(updatedSchedule);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8.5. メール送信ログの記録 API
app.post('/api/schedules/:id/email-log', async (req, res) => {
  try {
    const scheduleId = req.params.id;
    const { recipient } = req.body;
    const schedule = await db.get('SELECT * FROM schedules WHERE id = ?', [scheduleId]);
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const changedBy = (req.headers['x-user-email'] as string) || '不明なユーザー';
    await writeAuditLog(
      scheduleId,
      'EMAIL',
      changedBy,
      schedule.property_name,
      `対応者へ緊急連絡メールを起動しました。(宛先: ${recipient || '未設定'})`
    );

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 10. 種別一覧の取得
app.get('/api/work_types', async (req, res) => {
  try {
    const types = await db.all('SELECT * FROM work_types ORDER BY is_internal DESC, sort_order ASC, id ASC');
    res.json(types);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 11. 種別の追加
app.post('/api/work_types', async (req, res) => {
  try {
    const { name, is_internal } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    // 現在の最大 sort_order を取得して自動設定
    const maxOrderRow = await db.get('SELECT MAX(sort_order) as max_order FROM work_types WHERE is_internal = ?', [is_internal !== undefined ? Number(is_internal) : 1]);
    const nextOrder = (maxOrderRow?.max_order || 0) + 1;

    const result = await db.run(
      'INSERT INTO work_types (name, is_internal, sort_order) VALUES (?, ?, ?)',
      [name.trim(), is_internal !== undefined ? Number(is_internal) : 1, nextOrder]
    );

    const changedBy = (req.headers['x-user-email'] as string) || '不明なユーザー';
    await writeAuditLog(
      null,
      'INSERT',
      changedBy,
      null,
      `予定種目「${name.trim()}」を追加しました。`
    );

    const newType = await db.get('SELECT * FROM work_types WHERE id = ?', [result.lastID]);
    res.status(201).json(newType);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 12. 種別の削除
app.delete('/api/work_types/:id', async (req, res) => {
  try {
    const typeId = req.params.id;
    const target = await db.get('SELECT * FROM work_types WHERE id = ?', [typeId]);
    if (!target) {
      return res.status(404).json({ error: 'Work type not found' });
    }

    await db.run('DELETE FROM work_types WHERE id = ?', [typeId]);

    const changedBy = (req.headers['x-user-email'] as string) || '不明なユーザー';
    await writeAuditLog(
      null,
      'DELETE',
      changedBy,
      null,
      `予定種目「${target.name}」を削除しました。`
    );

    res.json({ message: 'Work type deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 12.2. 種別の一括並び替え
app.put('/api/work_types/reorder', async (req, res) => {
  try {
    const { orders } = req.body; // [{ id: 1, sort_order: 0 }, { id: 2, sort_order: 1 }]
    if (!orders || !Array.isArray(orders)) {
      return res.status(400).json({ error: 'orders array is required' });
    }
    
    await db.run('BEGIN TRANSACTION');
    for (const item of orders) {
      await db.run(
        'UPDATE work_types SET sort_order = ? WHERE id = ?',
        [Number(item.sort_order), Number(item.id)]
      );
    }
    await db.run('COMMIT');
    
    const changedBy = (req.headers['x-user-email'] as string) || '不明なユーザー';
    await writeAuditLog(
      null,
      'UPDATE',
      changedBy,
      null,
      `予定項目の並び順を一括更新しました。`
    );
    
    res.json({ success: true });
  } catch (error: any) {
    await db.run('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

// 12.1. 種別の更新
app.put('/api/work_types/:id', async (req, res) => {
  try {
    const { name, is_internal } = req.body;
    const typeId = req.params.id;
    const existing = await db.get('SELECT * FROM work_types WHERE id = ?', [typeId]);
    if (!existing) {
      return res.status(404).json({ error: 'Work type not found' });
    }
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    await db.run(
      'UPDATE work_types SET name = ?, is_internal = ? WHERE id = ?',
      [name.trim(), is_internal !== undefined ? Number(is_internal) : existing.is_internal, typeId]
    );
    
    const changedBy = (req.headers['x-user-email'] as string) || '不明なユーザー';
    await writeAuditLog(
      null,
      'UPDATE',
      changedBy,
      null,
      `予定種目「${existing.name}」を「${name.trim()}」(分類: ${is_internal ? '社内' : '現場'})に更新しました。`
    );
    
    const updated = await db.get('SELECT * FROM work_types WHERE id = ?', [typeId]);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 13. スタッフの新規登録
app.post('/api/staff', async (req, res) => {
  try {
    const { name, email, default_course, is_active, role } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await db.run(
      'INSERT INTO staff (name, email, default_course, is_active, role) VALUES (?, ?, ?, ?, ?)',
      [
        name.trim(),
        email && email.trim() !== '' ? email.trim() : null,
        default_course && String(default_course).trim() !== '' ? String(default_course).trim() : null,
        is_active !== undefined ? Number(is_active) : 1,
        role || 'user'
      ]
    );

    const changedBy = (req.headers['x-user-email'] as string) || '不明なユーザー';
    await writeAuditLog(
      null,
      'INSERT',
      changedBy,
      null,
      `スタッフ「${name.trim()}」を追加しました。`
    );

    const newStaff = await db.get('SELECT * FROM staff WHERE id = ?', [result.lastID]);
    res.status(201).json(newStaff);
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed: staff.email')) {
      return res.status(400).json({ error: 'このメールアドレスは既に登録されています。' });
    }
    res.status(500).json({ error: error.message });
  }
});

// 14. スタッフの更新
app.put('/api/staff/:id', async (req, res) => {
  try {
    const { name, email, default_course, is_active, role } = req.body;
    const staffId = req.params.id;

    const existing = await db.get('SELECT * FROM staff WHERE id = ?', [staffId]);
    if (!existing) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }

    await db.run(
      'UPDATE staff SET name = ?, email = ?, default_course = ?, is_active = ?, role = ? WHERE id = ?',
      [
        name.trim(),
        email && email.trim() !== '' ? email.trim() : null,
        default_course && String(default_course).trim() !== '' ? String(default_course).trim() : null,
        is_active !== undefined ? Number(is_active) : 1,
        role || 'user',
        staffId
      ]
    );

    const updated = await db.get('SELECT * FROM staff WHERE id = ?', [staffId]);
    
    const changeList: string[] = [];
    if (existing.name !== updated.name) changeList.push(`名前: "${existing.name}" -> "${updated.name}"`);
    if ((existing.email || '') !== (updated.email || '')) changeList.push(`メール: "${existing.email || ''}" -> "${updated.email || ''}"`);
    if ((existing.default_course || '') !== (updated.default_course || '')) changeList.push(`デフォルトコース: "${existing.default_course || ''}" -> "${updated.default_course || ''}"`);
    if (existing.is_active !== updated.is_active) changeList.push(`状態: "${existing.is_active === 1 ? '有効' : '無効'}" -> "${updated.is_active === 1 ? '有効' : '無効'}"`);
    if (existing.role !== updated.role) changeList.push(`権限: "${existing.role}" -> "${updated.role}"`);

    const changedBy = (req.headers['x-user-email'] as string) || '不明なユーザー';
    const logDetails = changeList.length > 0 ? `スタッフ情報を更新しました。(${changeList.join(', ')})` : 'スタッフ情報を更新しました（変更なし）。';
    await writeAuditLog(null, 'UPDATE', changedBy, null, logDetails);

    res.json(updated);
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed: staff.email')) {
      return res.status(400).json({ error: 'このメールアドレスは既に登録されています。' });
    }
    res.status(500).json({ error: error.message });
  }
});

// 15. スタッフの削除
app.delete('/api/staff/:id', async (req, res) => {
  try {
    const staffId = req.params.id;

    const existing = await db.get('SELECT * FROM staff WHERE id = ?', [staffId]);
    if (!existing) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    // 関連する予定レコードがあるかチェック
    const relatedSchedules = await db.get('SELECT COUNT(*) as count FROM schedules WHERE staff_id = ?', [staffId]);
    if (relatedSchedules.count > 0) {
      return res.status(409).json({ error: 'このスタッフは既に予定（実績データ）が登録されているため、削除できません。代わりに「無効（非アクティブ）」に設定してください。' });
    }

    await db.run('DELETE FROM staff WHERE id = ?', [staffId]);

    const changedBy = (req.headers['x-user-email'] as string) || '不明なユーザー';
    await writeAuditLog(
      null,
      'DELETE',
      changedBy,
      null,
      `スタッフ「${existing.name}」を削除しました。`
    );

    res.json({ message: 'Staff deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 16. 物件マスタ検索API (サジェスト用)
app.get('/api/properties/search', async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : '';
    if (q === '') {
      return res.json([]);
    }
    
    // 号機（部分一致）、物件名（部分一致）、住所（部分一致）で検索
    const query = `
      SELECT * FROM properties 
      WHERE unit_number LIKE ? OR property_name LIKE ? OR address LIKE ?
      LIMIT 15
    `;
    const searchVal = `%${q}%`;
    const results = await db.all(query, [searchVal, searchVal, searchVal]);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 17. インポートデータ突合API (マスタ突合と補正判定)
app.post('/api/schedules/validate-import', async (req, res) => {
  try {
    const { schedules: items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'schedules array is required' });
    }

    const validatedItems = [];

    for (const item of items) {
      const unitNumber = item.unit_number ? String(item.unit_number).trim() : '';
      const propertyName = item.property_name ? String(item.property_name).trim() : '';

      let status = 'not_found';
      let masterData = null;

      if (unitNumber !== '' && propertyName !== '') {
        // 1. 完全一致チェック
        const exactMatch = await db.get(
          'SELECT * FROM properties WHERE unit_number = ? AND property_name = ?',
          [unitNumber, propertyName]
        );

        if (exactMatch) {
          status = 'match';
          masterData = exactMatch;
        } else {
          // 2. 号機一致・物件名不一致（表記ゆれ）チェック
          const unitMatch = await db.get(
            'SELECT * FROM properties WHERE unit_number = ?',
            [unitNumber]
          );

          if (unitMatch) {
            status = 'name_mismatch';
            masterData = unitMatch;
          } else {
            // 3. 号機不一致・物件名一致チェック
            const nameMatch = await db.get(
              'SELECT * FROM properties WHERE property_name = ?',
              [propertyName]
            );

            if (nameMatch) {
              status = 'unit_number_mismatch';
              masterData = nameMatch;
            }
          }
        }
      } else if (unitNumber !== '') {
        // 号機のみある場合
        const unitMatch = await db.get(
          'SELECT * FROM properties WHERE unit_number = ?',
          [unitNumber]
        );
        if (unitMatch) {
          status = 'name_mismatch';
          masterData = unitMatch;
        }
      } else if (propertyName !== '') {
        // 物件名のみある場合
        const nameMatch = await db.get(
          'SELECT * FROM properties WHERE property_name = ?',
          [propertyName]
        );
        if (nameMatch) {
          status = 'unit_number_mismatch';
          masterData = nameMatch;
        }
      }

      validatedItems.push({
        original_data: item,
        status,
        master_data: masterData
      });
    }

    res.json(validatedItems);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// サーバー起動
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
});
