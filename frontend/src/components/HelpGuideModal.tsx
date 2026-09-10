import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, 
  HelpCircle, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Lightbulb, 
  Info,
  CheckCircle2
} from 'lucide-react';
import './HelpGuideModal.css';

export interface HelpGuideItem {
  id: string;
  title: string;
  category: 'bulk' | 'schedule' | 'import' | 'print' | 'coworker' | 'rules';
  categoryName: string;
  targetScreen: string;
  summary: string;
  steps: string[];
  tips?: string;
  keywords: string[];
}

export const HELP_GUIDE_DATA: HelpGuideItem[] = [
  // === 複数選択・一括操作 ===
  {
    id: 'bulk-status',
    title: '複数の予定をまとめて「確定」「仮」「キャンセル」にしたい',
    category: 'bulk',
    categoryName: '複数選択・一括操作',
    targetScreen: '月間予定表',
    summary: 'CtrlキーやShiftキーを押しながら複数の予定行を選択し、画面下部のボタンからワンクリックでステータスを一括更新できます。',
    steps: [
      'カレンダー上で Ctrl キー（Macは Cmd）を押しながら、対象の予定行をクリックします（離れた行をいくつでも追加・解除可能）。',
      '連続する範囲を選択する場合は、最初の行をクリックした後、Shift キーを押しながら最後の行をクリックします。',
      '選択すると、画面下部の中央に「一括操作バー」が表示されます。',
      '「一括【確定】（赤）」「一括【仮】（黄）」「一括【キャンセル】（グレー）」のボタンをクリックすると、選択した予定が一括更新されます。'
    ],
    tips: '選択した行の上で右クリックして表示されるコンテキストメニューからも、一括ステータス変更が可能です。',
    keywords: ['複数選択', '一括', 'まとめて', '確定', '仮', 'キャンセル', 'ctrl', 'shift', '複数行', '選択', 'ステータス']
  },
  {
    id: 'bulk-move',
    title: '予定をキャンセルして別の日付に移動（振替）したい',
    category: 'bulk',
    categoryName: '複数選択・一括操作',
    targetScreen: '月間予定表',
    summary: '予定をキャンセルした際、同じ内容（物件名、号機、種別、時間、担当者等）を保ったままスムーズに別の日付へ移動・振替できます。',
    steps: [
      '移動したい予定を右クリックするか、複数選択して画面下部の一括バーの「別日へ移動」ボタンをクリックします。',
      '「別日へ移動」ダイアログが表示されます。',
      '「移動先の日付」カレンダーピッカーから、移動先の日付を選択します。',
      '「元の予定を【キャンセル】として残す（振替・履歴保持）」のチェックボックスを確認します。',
      '「別日へ移動を実行」をクリックすると、移動処理が完了します。'
    ],
    tips: 'チェックON（推奨）の場合、元の予定はキャンセルとして履歴に残り、移動先に同一内容の新規フリー予定が作成されます。チェックOFFにすると日付のみが直接スライド移動します。',
    keywords: ['別日へ移動', '移動', '別日', '振替', 'スライド', '日程変更', 'キャンセル', '日付変更', '履歴', '延期']
  },
  {
    id: 'bulk-delete',
    title: '複数の予定をまとめて一括削除したい',
    category: 'bulk',
    categoryName: '複数選択・一括操作',
    targetScreen: '月間予定表',
    summary: '不要になった複数の予定を一度の操作でまとめて安全に削除できます。',
    steps: [
      'Ctrl キーまたは Shift キーを押しながら、削除したい予定行をクリックして複数選択します。',
      '画面下部の一括操作バーの「一括削除」ボタン、または右クリックメニューの「選択した予定を一括削除」をクリックします。',
      '削除確認のメッセージが表示されたら「OK」をクリックすると、一括削除されます。'
    ],
    tips: '削除前に確認ダイアログが表示されるため、誤って削除してしまう心配を防ぎます。',
    keywords: ['一括削除', 'まとめて削除', '複数削除', '削除', 'クリア', '消去']
  },

  // === 予定の登録・編集 ===
  {
    id: 'inline-edit',
    title: 'カレンダー上で予定の内容（物件名や作業内容等）を直接すばやく編集したい',
    category: 'schedule',
    categoryName: '予定の登録・編集',
    targetScreen: '月間予定表',
    summary: 'セルをダブルクリックするだけで、Excelのようにその場で直接テキストや種別を書き換えられます。',
    steps: [
      '編集したいセル（物件名、作業内容、時間、備考、対応者など）を「ダブルクリック」します。',
      'セルの枠が入力ボックスまたは選択プルダウンに切り替わります。',
      '内容をキーボードで入力・修正します。',
      'Enter キーを押すか、枠外の別の場所をクリックすると自動で保存されます。'
    ],
    tips: 'Esc キーを押すと、変更を保存せずに元の値に戻す（編集キャンセル）ことができます。',
    keywords: ['インライン編集', '直接入力', 'ダブルクリック', '文字入力', '修正', '編集', '物件名', '作業内容', '備考']
  },
  {
    id: 'modal-edit',
    title: '予定の詳細情報（エリア・県別・依頼番号など）をモーダルで編集したい',
    category: 'schedule',
    categoryName: '予定の登録・編集',
    targetScreen: '月間予定表 / 予定表 (グリッド)',
    summary: '予定の全項目を一覧できる編集モーダルを開き、詳細情報をまとめて編集・確認できます。',
    steps: [
      'カレンダーの「物件名」セルにマウスを合わせると、右端に小さな「鉛筆アイコン」が表示されるのでクリックします。',
      'または、対象の予定を右クリックして「詳細を編集 (モーダル)」を選択します。',
      '予定の詳細編集モーダルが開きます。',
      'エリア、県別、移動手段、同行者、依頼番号、備考などの項目を修正し、「保存」をクリックします。'
    ],
    tips: 'モーダル最下部の「管理情報」セクションでは、この予定を誰がいつ作成し、誰が最後に更新したかの履歴も確認できます。',
    keywords: ['詳細編集', 'モーダル', '鉛筆', 'アイコン', 'エリア', '県別', '移動', '依頼番号', '同行者', '修正']
  },
  {
    id: 'quick-add',
    title: '休暇や社内予定（会議・健康診断など）を手軽にクイック登録したい',
    category: 'schedule',
    categoryName: '予定の登録・編集',
    targetScreen: '月間予定表',
    summary: 'カレンダー各日の上部にあるクイック追加ボタンから、複数スタッフの休暇や会議等を一度に登録できます。',
    steps: [
      'カレンダーの各日付ヘッダー（曜日・日付の直下）にある「＋ 休暇・社内予定を追加」ボタンをクリックします。',
      '簡易登録フォームが開きます。',
      '予定種別（休暇、有休、会議、健康診断、その他など）を選択します。',
      '対象スタッフのチェックボックスにチェックを入れます（複数人の同時チェックが可能です）。',
      '「登録」ボタンを押すと、チェックした全員の行に予定が一括登録されます。'
    ],
    tips: '「その他」を選択すると、独自の予定名を自由に入力して登録することも可能です。',
    keywords: ['休暇', '有休', '社内予定', '会議', '健康診断', 'クイック登録', '簡易登録', '休み', '追加']
  },
  {
    id: 'calendar-search',
    title: 'カレンダー内で特定の物件名や対応者、号機番号を検索・ハイライトしたい',
    category: 'schedule',
    categoryName: '予定の登録・編集',
    targetScreen: '月間予定表',
    summary: 'カレンダー右上の検索窓に入力するだけで、一致する予定が黄色くハイライトされ、該当の予定を瞬時に見つけ出せます。',
    steps: [
      'カレンダー右上の「号機・物件名・対応者」と書かれた検索ボックスをクリックします。',
      '探したい物件名、号機、スタッフの苗字などを入力します（リアルタイムで反映されます）。',
      '一致する文字が含まれるセルが黄色くハイライトされ、一致しない行は自動的に薄くフェード表示されます。',
      '検索窓の右端にある「✕」ボタンを押すか、文字を消去すると検索状態が解除されます。'
    ],
    tips: '文字入力後、Escape キーを押すと検索窓からフォーカスを外せます。',
    keywords: ['検索', 'ハイライト', '探す', '号機', '物件名', '対応者', '絞り込み', '黄色', 'フィルター']
  },

  // === インポート・コピペ ===
  {
    id: 'paste-import',
    title: 'Googleスプレッドシートから予定を一括で貼り付けたい（インポート）',
    category: 'import',
    categoryName: 'インポート・コピペ',
    targetScreen: '月間予定表',
    summary: 'スプレッドシートやExcelの表データをコピーして貼り付けるだけで、システムに予定を一括取り込みできます。',
    steps: [
      'Googleスプレッドシート等で、取り込みたい予定行のセル範囲をコピー（Ctrl+C）します。',
      '本システムの画面右上にある「スプレッドシートから貼り付け」ボタンをクリックします。',
      'モーダルが開くので、大きなテキストボックス内で Ctrl+V（貼り付け）を押します。',
      '表のプレビューが表示され、日付、対応者名、号機、コース番号などが正しく自動認識されているか確認します。',
      '右下の「インポートを実行」ボタンをクリックすると、カレンダーに一括反映されます。'
    ],
    tips: '同一スタッフに同日複数件の予定がある場合でも、号機番号を識別して上書きされずに正しく複数件取り込まれます。',
    keywords: ['スプレッドシート', 'エクセル', '貼り付け', 'コピペ', 'インポート', '取込', '一括登録', 'excel', 'スプシ']
  },
  {
    id: 'cell-direct-paste',
    title: 'スプレッドシートの担当者名を、カレンダーのセルに直接貼り付けたい',
    category: 'import',
    categoryName: 'インポート・コピペ',
    targetScreen: '月間予定表',
    summary: 'セルを選択して Ctrl+V を押すだけで、スプレッドシート上のテキストがマスタと照合されて自動入力されます。',
    steps: [
      'スプレッドシート等から対応者名（例:「吉沼」）を Ctrl+C でコピーします。',
      'カレンダー上の対応者セルをクリックして選択状態（枠線表示）にします。',
      'キーボードの Ctrl+V（貼り付け）を押します。',
      'スタッフマスタと自動照合され、正式な氏名・ID・デフォルトコース番号・区分が自動でセットされて保存されます。'
    ],
    tips: 'マスタに登録されている氏名であれば、苗字だけのコピーでも正しく自動照合されます。',
    keywords: ['セル貼り付け', '直貼り', 'ctrl+v', 'ショートカット', '対応者コピペ', 'ペースト']
  },
  {
    id: 'schedule-copy-paste',
    title: '登録済みの予定を別の枠や別の日付にコピー＆ペーストしたい',
    category: 'import',
    categoryName: 'インポート・コピペ',
    targetScreen: '月間予定表',
    summary: 'カレンダー内の予定を右クリックでコピーし、別のセルへ貼り付けることで、同じ予定を素早く複製できます。',
    steps: [
      'コピーしたい予定を右クリックし、「予定をコピー」を選択します（または選択して Ctrl+C）。',
      '画面下部に「コピー中: 物件名」というインジケーターが表示されます。',
      '貼り付け先の日付・枠のセルを右クリックし、「コピーした予定を貼り付け」を選択します（または選択して Ctrl+V）。',
      '同一内容の予定が貼り付け先に複製されます。'
    ],
    tips: '画面下部インジケーターの「解除」ボタンを押すと、コピー状態をクリアできます。',
    keywords: ['予定コピー', '複製', 'コピペ', 'ペースト', '貼り付け', 'コピー']
  },

  // === 印刷・Excel出力 ===
  {
    id: 'personal-print',
    title: '自分の予定だけを絞り込んで紙に印刷したい（個人用印刷プレビュー）',
    category: 'print',
    categoryName: '印刷・Excel出力',
    targetScreen: '予定表 (グリッド)',
    summary: '全体の予定表から自分の担当分だけを抽出し、A4用紙に最適化された綺麗なレイアウトで印刷できます。',
    steps: [
      '上部ナビゲーションタブで「予定表 (グリッド)」を開きます。',
      '上部の「担当者」プルダウンで自分の名前を選択し、自分の予定のみを表示させます。',
      '画面右上の「印刷プレビュー」ボタンをクリックします。',
      '全画面の印刷プレビューモーダルが起動し、選択したスタッフの予定のみが一覧表示されます。',
      'プレビュー画面右上の「印刷する」ボタンをクリックすると、ブラウザの印刷ダイアログが開きます。'
    ],
    tips: '他の人の予定を誤って書き換える心配がなく、各自で安心して自分の予定だけを出力できます。',
    keywords: ['印刷', 'プリント', 'プレビュー', '個人印刷', '自分の予定', '紙', '出力', 'A4']
  },
  {
    id: 'temporary-memo-print',
    title: '印刷用紙にだけ一時的な連絡メモや手書き事項を添えて印刷したい',
    category: 'print',
    categoryName: '印刷・Excel出力',
    targetScreen: '予定表 (グリッド) ➔ 印刷プレビュー',
    summary: '共有データベースを一切汚さずに、印刷用紙にだけ反映される「印刷用使い捨てメモ」を入力できます。',
    steps: [
      '「印刷プレビュー」モーダルを開きます。',
      'プレビュー表の右端にある「印刷用備考（使い捨て）」列の入力欄に、自由に連絡事項やメモを入力します。',
      '「印刷する」ボタンをクリックします。',
      '印刷時は入力枠線が消え、綺麗なインラインテキストとして用紙に印刷されます。'
    ],
    tips: 'このメモは画面を閉じると自動で消去され、サーバーや他のユーザーの共有データには一切保存されないため、100%安全です。',
    keywords: ['使い捨てメモ', '印刷メモ', 'メモ', '手書き', '連絡事項', '備考', '印刷用メモ']
  },
  {
    id: 'excel-export',
    title: '予定データをExcelで開きたい / ダウンロードしたい',
    category: 'print',
    categoryName: '印刷・Excel出力',
    targetScreen: '予定表 (グリッド)',
    summary: '現在の表示条件（日付や絞り込み）の予定一覧を、Excelで直接開けるファイル形式でワンクリック出力できます。',
    steps: [
      '上部ナビゲーションタブで「予定表 (グリッド)」を開きます。',
      '必要に応じて、日付や担当者の絞り込みを行います。',
      '画面右上の「Excelで開く」ボタンをクリックします。',
      'Excel対応ファイルが自動でダウンロードされるので、ファイルを開きます。'
    ],
    tips: 'Excel出力時、対応者や同行者の氏名は見やすい苗字表記に自動統一されます。',
    keywords: ['excel', 'エクセル', 'ダウンロード', '出力', 'スプレッドシート', '開く', '表']
  },

  // === 同行者・連携 ===
  {
    id: 'coworker-sync',
    title: '他のスタッフを同行者として登録し、相手のカレンダーにも自動反映させたい',
    category: 'coworker',
    categoryName: '同行者・連携',
    targetScreen: '月間予定表 / 予定表 (グリッド)',
    summary: '同行者を指定すると、相手の予定表にも同じ物件名・内容の予定が「同行」バッジ付きで自動登録されます。',
    steps: [
      '予定の追加または編集モーダルを開きます。',
      '「同行者」入力欄の直下に表示されているスタッフの「トグルバッジ」をクリックして選択します（手入力も可能）。',
      '「相手の予定表にも自動登録する（連動登録）」のチェックボックスがONになっていることを確認します。',
      '「保存」をクリックします。',
      '同行者に指定されたスタッフのカレンダー行にも、同一内容の予定が自動的に登録されます。'
    ],
    tips: '親のメイン予定を更新・削除すると、連動登録された同行予定も自動的に一緒に連動して更新・削除されます。',
    keywords: ['同行者', '同行', '相番', 'ペア', '連動登録', '自動登録', '相手の予定', 'バッジ']
  },
  {
    id: 'coworker-no-sync',
    title: '1日同行などの際に、相手の予定表を埋めないようにしたい（連動登録の解除）',
    category: 'coworker',
    categoryName: '同行者・連携',
    targetScreen: '月間予定表 / 予定表 (グリッド)',
    summary: '「連動登録」チェックをOFFにすることで、自分の予定の同行者欄に名前を残しつつ、相手のカレンダーに予定を増やさない運用ができます。',
    steps: [
      '予定の追加または編集モーダルを開きます。',
      '同行者を指定します。',
      '同行者欄の下にある「相手の予定表にも自動登録する（連動登録）」のチェックボックスを「OFF（チェックを外す）」にします。',
      '「保存」をクリックします。',
      '自分の予定表には同行者名が表示されますが、相手のカレンダーには新規行は作成されません。'
    ],
    tips: '既に自動作成されていた同行予定がある場合でも、チェックを外して保存すると不要な同行予定が自動で削除されます。',
    keywords: ['連動解除', '自動登録しない', '連動オフ', '同行者', '行数を増やさない', '1日同行']
  },
  {
    id: 'coworker-badge',
    title: '物件名の横にある紫色の「同行」バッジは何を意味している？',
    category: 'coworker',
    categoryName: '同行者・連携',
    targetScreen: '月間予定表',
    summary: '他のスタッフがメイン担当の予定に、自分が同行者として参加している予定であることを示しています。',
    steps: [
      'カレンダーの物件名左側に紫色の「同行」バッジが付いている予定は、自動連動された同行予定です。',
      'この予定の内容は、メイン担当者（親予定）の更新に自動で追従します。',
      'メイン担当者が予定を変更または削除した際、こちらの同行予定も自動的に反映されます。'
    ],
    tips: '同行予定をダブルクリックまたはモーダル編集した際も、内部の連携データは保護されるため親子関係が壊れる心配はありません。',
    keywords: ['同行バッジ', '紫バッジ', 'マーク', '同行', '意味', '親子']
  },

  // === 画面の見方・基本ルール ===
  {
    id: 'status-colors',
    title: 'カレンダーの予定の色（赤、黄、グレー等）にはどんな意味がある？',
    category: 'rules',
    categoryName: '画面の見方・基本ルール',
    targetScreen: '全画面',
    summary: '予定の進行状態（ステータス）が一目でわかるよう、色分けで管理されています。',
    steps: [
      '【確定（赤色）】: 左端に赤帯が付き、背景が薄い赤になります。日時や担当者が本決まりした確定予定です。',
      '【仮（黄色）】: 左端に黄帯が付き、斜線ストライプが入ります。日程調整中や依頼確認待ちの状態です。',
      '【フリー（通常）】: 通常の背景色です。通常予定や枠のみ確保された状態です。',
      '【キャンセル（グレー）】: テキストに打ち消し線が入り、グレーアウト表示されます。中止・キャンセルされた予定です。'
    ],
    tips: '画面下部の一括操作バーやコンテキストメニューのボタン色も、このステータス色（確定: 赤、仮: 黄、キャンセル: グレー）と完全に一致しています。',
    keywords: ['色', 'カラー', '赤', '黄色', 'グレー', 'ステータス', '確定', '仮', 'フリー', 'キャンセル', '意味']
  },
  {
    id: 'timeline-sort',
    title: '「当日行動予定表」のスタッフの並び順はどう決まっている？',
    category: 'rules',
    categoryName: '画面の見方・基本ルール',
    targetScreen: '当日行動予定表',
    summary: '各スタッフのデフォルトコース番号順に自動で整列し、見やすい順番で表示されます。',
    steps: [
      '当日行動予定表に表示される各スタッフの列（ボード）は、コース番号（1, 2, ..., 26, 90...）の数値昇順で左から右へ自動で並びます。',
      'コース番号が未設定のスタッフは、リストの末尾に配置されます。',
      '表示される予定は、「確定」「仮」だけでなく「通常（フリー）」の予定もすべて表示されます。'
    ],
    tips: 'スタッフマスタ管理画面で各スタッフのデフォルトコース番号を設定することで、並び順を調整できます。',
    keywords: ['並び順', '順番', 'コース', 'ソート', '当日行動予定表', '左から右', '整列']
  },
  {
    id: 'hoogi-rule',
    title: '「フーギー」さんの予定登録・検索について知りたい',
    category: 'rules',
    categoryName: '画面の見方・基本ルール',
    targetScreen: '全画面',
    summary: '通称「フーギー」と入力するだけで、本名の「ナルマンダフ・フスレンバヤル（コース13）」に自動で名寄せされます。',
    steps: [
      '入力欄やコピペで「フーギー」と入力すると、システムが自動的に本名「ナルマンダフ・フスレンバヤル」と紐付けます。',
      'コース番号13が自動的に割り当てられ、カレンダーや当日予定表でもコース13の位置に配置されます。',
      '画面上の表示は自動的に「フーギー」として親しみやすい表記に最適化されます。'
    ],
    tips: 'スプレッドシートからの貼り付け時や同行者トグルバッジでも、すべて同様に自動判別されます。',
    keywords: ['フーギー', 'ナルマンダフ', 'フスレンバヤル', 'コース13', '別名', '通称', 'スタッフ名']
  },
  {
    id: 'audit-tracking',
    title: 'この予定を「誰が登録したか」「最後に誰が変更したか」を確認したい',
    category: 'rules',
    categoryName: '画面の見方・基本ルール',
    targetScreen: '全画面',
    summary: '各予定には作成者と最終更新者のアカウント名・日時が自動記録されており、いつでも確認できます。',
    steps: [
      '確認したい予定の編集モーダルを開きます。',
      'モーダル最下部の「管理情報」セクションを確認します。',
      '「登録者」: 予定を最初に登録したユーザーの氏名・メールアドレス・日時が表示されます。',
      '「最終更新」: 直近で変更を加えたユーザーの氏名・メールアドレス・日時が表示されます。'
    ],
    tips: 'スプレッドシートからインポートした予定についても、取り込み操作を行ったユーザーが記録されます。',
    keywords: ['登録者', '更新者', '履歴', '誰が', '変更者', '監査ログ', '作成者', 'トラッキング']
  }
];

interface HelpGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpGuideModal: React.FC<HelpGuideModalProps> = ({ isOpen, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // モーダルが開かれたら検索窓にフォーカス
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      setSearchQuery('');
      setExpandedId(null);
    }
  }, [isOpen]);

  // Escキーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // カテゴリ一覧定義
  const categories = [
    { id: 'all', label: 'すべて' },
    { id: 'bulk', label: '複数選択・一括操作' },
    { id: 'schedule', label: '予定の登録・編集' },
    { id: 'import', label: 'インポート・コピペ' },
    { id: 'print', label: '印刷・Excel出力' },
    { id: 'coworker', label: '同行者・連携' },
    { id: 'rules', label: '画面の見方・基本ルール' }
  ];

  // フィルタリング処理（全文＋キーワード＋シノニム照合）
  const filteredGuides = useMemo(() => {
    let list = HELP_GUIDE_DATA;

    // カテゴリフィルター
    if (selectedCategory !== 'all') {
      list = list.filter(item => item.category === selectedCategory);
    }

    // 検索ワードフィルター
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;

    const terms = q.split(/\s+/).filter(Boolean);

    return list.filter(item => {
      const targetText = [
        item.title,
        item.summary,
        item.targetScreen,
        item.categoryName,
        item.tips || '',
        ...item.steps,
        ...item.keywords
      ].join(' ').toLowerCase();

      // すべての検索語句が含まれているか
      return terms.every(term => targetText.includes(term));
    });
  }, [searchQuery, selectedCategory]);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  if (!isOpen) return null;

  return (
    <div className="help-modal-overlay" onClick={onClose}>
      <div className="help-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className="help-modal-header">
          <div className="help-header-title">
            <HelpCircle size={22} className="help-header-icon" />
            <div>
              <h3>操作ガイド・よくある質問（FAQ）</h3>
              <p className="help-header-sub">操作方法ややりたいことから機能を逆引き検索できます</p>
            </div>
          </div>
          <button type="button" className="help-modal-close-btn" onClick={onClose} title="閉じる (Esc)">
            <X size={20} />
          </button>
        </div>

        {/* 検索バーエリア */}
        <div className="help-search-section">
          <div className="help-search-box">
            <Search size={18} className="help-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="help-search-input"
              placeholder="やりたい操作やキーワードを入力（例: 印刷、コピペ、振替、確定、同行、複数選択）..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button 
                type="button" 
                className="help-search-clear" 
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                title="クリア"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* カテゴリクイックタブ */}
          <div className="help-category-tabs">
            {categories.map(cat => (
              <button
                key={cat.id}
                type="button"
                className={`help-cat-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* ガイド一覧ボディ */}
        <div className="help-modal-body">
          <div className="help-results-info">
            <span>該当する操作ガイド: <strong>{filteredGuides.length}件</strong></span>
            {searchQuery && <span className="help-search-query-tag">「{searchQuery}」で検索中</span>}
          </div>

          {filteredGuides.length === 0 ? (
            <div className="help-no-results">
              <Info size={36} className="help-no-results-icon" />
              <p className="help-no-results-text">一致する操作ガイドが見つかりませんでした。</p>
              <p className="help-no-results-sub">別のキーワード（例: 「印刷」「コピペ」「確定」「同行」など）でお試しください。</p>
            </div>
          ) : (
            <div className="help-accordion-list">
              {filteredGuides.map(item => {
                const isExpanded = expandedId === item.id;
                return (
                  <div key={item.id} className={`help-accordion-item ${isExpanded ? 'is-open' : ''}`}>
                    <div 
                      className="help-item-header" 
                      onClick={() => toggleExpand(item.id)}
                    >
                      <div className="help-item-title-col">
                        <div className="help-item-badges">
                          <span className="help-badge-category">{item.categoryName}</span>
                          <span className="help-badge-screen">対象: {item.targetScreen}</span>
                        </div>
                        <h4 className="help-item-title">{item.title}</h4>
                      </div>
                      <div className="help-item-arrow">
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="help-item-content">
                        <p className="help-item-summary">{item.summary}</p>
                        
                        <div className="help-steps-container">
                          <h5 className="help-steps-heading">
                            <CheckCircle2 size={16} className="help-steps-icon" />
                            操作手順
                          </h5>
                          <ol className="help-steps-list">
                            {item.steps.map((step, idx) => (
                              <li key={idx}>
                                <span className="help-step-number">{idx + 1}</span>
                                <span className="help-step-text">{step}</span>
                              </li>
                            ))}
                          </ol>
                        </div>

                        {item.tips && (
                          <div className="help-tips-box">
                            <Lightbulb size={18} className="help-tips-icon" />
                            <div className="help-tips-text">
                              <strong>💡 便利なポイント / Tips:</strong>
                              <p>{item.tips}</p>
                            </div>
                          </div>
                        )}

                        <div className="help-keywords-box">
                          <span className="help-keywords-label">関連キーワード:</span>
                          {item.keywords.map((kw, kidx) => (
                            <span 
                              key={kidx} 
                              className="help-kw-tag"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSearchQuery(kw);
                              }}
                            >
                              #{kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="help-modal-footer">
          <span className="help-footer-hint">
            キーボードの <strong>?</strong> キーを押すと、いつでもこのヘルプを呼び出せます（Escで閉じます）
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
