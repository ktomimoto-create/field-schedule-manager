# 変更履歴 (walkthrough.md)

## [2026-06-20] ヘッダーナビゲーションUIの整理（集計分析・マスタ管理のアイコン化と右側への分離配置）

### 変更の目的
1. **主要業務と管理・分析機能の視覚的分離**:
   ヘッダー中央のナビゲーションタブエリアを、主要スケジュール業務である「予定表 (グリッド)」「当日行動予定表」「月間予定表」の3点のみに整理し、日常操作の視認性を高めます。
2. **操作ボタンエリアへの統合**:
   「集計分析」と「マスタ管理」を右上のアクションボタンエリア（ダークモード切替や更新ボタンの並び）に、32pxのコンパクトな正方形アイコンボタンとして分離配置し、システム設定・分析として適切なアライメントに変更します。

### 変更内容

#### 1. フロントエンドUI・ロジックの修正

##### [App.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/App.tsx)
* ヘッダー中央の `nav-tabs` から「集計分析」および「マスタ管理」のタブボタンを削除しました。
* ヘッダー右上の `header-actions` に、管理者権限（`admin`）がある場合にのみ表示される「集計分析（`BarChart3`アイコン）」と「マスタ管理（`Sliders`アイコン）」のボタンを追加しました。
* 現在のアクティブなタブ状態（`activeTab`）と連動し、該当の画面が開かれている際には対応するアイコンボタンがプライマリカラー（`btn-primary`：青紫色）に光り、開かれていないときはセカンダリ（`btn-secondary`：灰色）に戻るインジケーター表示を実装しました。

---

## [2026-06-20] 予定表グリッドへの個人用印刷プレビュー・一時メモ付き印刷機能の追加、および「フーギー」等のスタッフ別名自動照合バグの修正

### 変更の目的
1. **共有データベースの保護と誤操作防止**:
   30人以上の全スタッフの予定が入る共有スプレッドシート画面から、各自が自分の予定だけを印刷したい場合、共有データを直接書き換えてメモを追記すると、他人のデータを誤って上書きしたり全体データが汚れたりする問題がありました。
2. **Excelダウンロード運用の廃止とシステム完結**:
   従来不便に感じられていた「Excelを一度ダウンロードし、メモを追記して印刷する」という手動の工程を排除し、システム内で「特定の担当者を絞り込み」「一時的な印刷メモを追加し」「ワンクリックでA4等に綺麗に印刷」できる機能を完結して提供します。
3. **「フーギー」等の別名照合バグの解消**:
   スタッフマスタ上は本名「ナルマンダフ・フスレンバヤル」で登録されているため、画面上で「フーギー」と入力された場合に照合が失敗し、スタッフIDが空（null）になりコース13として認識されずにカレンダーの最下部に配置されてしまう不具合を解決します。入力値に別名が含まれる場合に本名マスタへ自動で紐付ける共通曖昧マッチングルールを導入します。

### 変更内容

#### 1. フロントエンドUI・ロジックの追加

##### [PrintPreviewModal.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/PrintPreviewModal.tsx) [NEW]
* 印刷プレビューおよび一時メモ入力を行うモーダルコンポーネントを新規作成しました。
* React のローカルステート（`memos`）を用いて、入力された印刷用メモを管理します。このメモデータは Supabase などの共有データベースには一切送信・保存されないため、完全に安全です。
* モーダル内でも印刷対象のスタッフを切り替えられるセレクターを配置し、使い勝手を向上しました。
* **[バグ修正] 印刷時の白紙化不具合の解消 (ポータル化)**:
  - 印刷モーダルを通常のコンポーネントツリーに配置した状態のまま、印刷時に他の要素を非表示にしようとすると、親要素（`app-container` 等）ごと非表示になってしまい、印刷結果が白紙になってしまう不具合がありました。
  - これを解決するため、`react-dom` の `createPortal` を導入し、モーダルコンポーネントを `document.body` 直下にマウントするように設計を変更しました。


##### [GridView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/GridView.tsx)
* 「Excelで開く/印刷」ボタンから印刷機能を分離し、「印刷プレビュー」ボタンを新設、Excel書き出しボタンを「Excelで開く」に簡素化しました。
* 現在の画面での「日付」および「絞り込みスタッフ（自分の予定のみ表示などのトグル状態）」を印刷プレビューモーダルへ初期状態として引き継ぐ制御を追加しました。
* `PrintPreviewModal` コンポーネントを読み込んでフッター直前に配置し、モーダルの開閉ステート（`isPrintPreviewOpen`）を追加しました。

##### [types.ts](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/types.ts)
* スタッフ名を曖昧一致で特定するための共通関数 `findStaffByName` を定義し、エクスポートしました。
* 入力値が「フーギー」「ナルマンダフ」「フスレンバヤル」のいずれかを含む場合に、マスタ「ナルマンダフ・フスレンバヤル（コース13）」を自動的に返すマッピングを実装しました。

##### [CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)
* セルのインライン編集時、コピー＆ペースト時、およびセル描画（アバター・名前表示）時におけるスタッフ特定処理（`staff.find`）を `findStaffByName` に置き換えました。これにより「フーギー」で入力・保存されたデータでも正しくアバターが描画され、コース13として自動ソートされるようになりました。

##### [ScheduleModal.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/ScheduleModal.tsx)
* 予定の追加・編集モーダルの保存処理、変更時のコース番号自動補完、および緊急メール通知の宛先アドレス解決時の照合処理を `findStaffByName` に置き換えました。

##### [App.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/App.tsx)
* 同行者の自動同期生成ロジックにおいて、指定された同行者名からスタッフIDを検索する処理を `findStaffByName` に変更しました。

#### 2. スタイル（CSS）の定義と印刷最適化

##### [PrintPreviewModal.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/PrintPreviewModal.css) [NEW]
* 画面表示用のクリーンな全画面プレビューレイアウトを定義しました。
* 印刷実行時の `@media print` メディアクエリを定義し、以下の印刷最適化を行いました：
  - 画面上部のヘッダー、操作用ボタン、印刷ボタン、テキストエリアの入力枠線やスクロールバーなどをすべて非表示（`display: none`）に設定。
  - **[バグ修正] 印刷用非表示ルールの最適化**:
    - ポータル化に伴い、印刷時にはアプリのメインルート要素である `#root` のみを完全に非表示（`display: none !important`）にするように修正し、ポータル先の印刷プレビュー（`.print-preview-overlay`）だけが紙面に確実に出力されるよう調整しました。
  - テキストエリアの代わりに、入力テキストをプレーンに保持した `span` 要素（`.print-memo-display`）を表示させることで、入力枠線のない自然なメモテキストとしてテーブルのセルに配置。
  - 用紙幅に合わせてテーブル全体を最適化し、静的/絶対配置を使用して黒線の実線罫線でくっきりと印刷されるようにデザイン。

---

## [2026-06-19] 仮想フリーセルの空編集時登録スキップ仕様の実装

### 変更の目的
1. **仮想フリーセルの空編集時新規登録問題の解決**:
   カレンダー（月間予定表）の仮想フリー行（対応者名のみが表示されている空きセル）をダブルクリックしてインライン編集を開始した際、何も値を入力せずに（または空文字にして）フォーカスアウトした場合でも、実予定レコードとして Supabase に新規登録されてしまい、不要な予定レコードが作成されたり、移行予定件数にカウントされたりしていました。
   結果値が空文字（トリム後も空文字）であった場合は、新規予定登録処理（`onSave`）をスキップし、なかったことにします。

### 変更内容

#### 1. フロントエンドロジックの修正

##### [CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)
* `handleInlineSave` 関数の `isTemp === true` （仮想フリー行）の判定ブロックの先頭に、入力値ガードを追加しました。
* `value` が空またはトリム後の値が空文字である場合（`!value || value.trim() === ''`）は、何もしないで早期リターン（`return;`）するようにし、不要な新規登録を防ぐようにしました。

---

## [2026-06-19] 月間予定表の機能拡張（矢印キーセル移動、Ctrl+F連携検索ハイライト、仮/確定予定デザインプレミアム化）

### 変更の目的
1. **スプレッドシート風キーボードナビゲーション**:
   カレンダー（月間予定表）上で、PCの矢印キー（`↑` `↓` `←` `→`）を用いて上下左右の隣接セルにフォーカスをシームレスに切り替えられるようにし、またスクロール範囲外へ移動した際に自動でスムーズスクロール（`scrollIntoView`）する機能を実装して操作性をExcelやGoogleスプレッドシート並みに高めます。
2. **リアルタイム検索ハイライト（Ctrl+F連携）**:
   カレンダー内の膨大な予定データから特定の号機、物件や担当者を素早く見つけられるよう、上部に検索入力窓を設置します。さらに、`Ctrl + F` ショートカットでこの検索窓に自動フォーカスし、検索ワードにヒットした予定行を強調（該当セルを黄色ハイライト）、不一致行を半透明化（グレーアウト）する機能を追加します。
3. **「仮予定」「確定予定」のビジュアルプレミアム化**:
   仮予定と確定予定の表示デザインを見直し、より直感的に状況を把握できるようにします。ユーザーのご要望に合わせ、「仮予定」は上品な「極薄イエロー斜めストライプ背景」とし、「確定予定」は目につきやすい「極薄レッド背景」にすることで、カレンダー上で各ステータスの重要性を瞬時に識別でき、かつ洗練された高級デザインへブラッシュアップします。
4. **号機入力時の物件情報自動補完機能（ハイブリッド仕様）**:
   カレンダーへの手動入力やスプレッドシートからのコピペ登録時に、マスタ（`properties`）に登録されている「号機（`unit_number`）」が入力された際、物件名、エリア、県別を自動で解決・補完する機能を実装します。ただし、コピペや手動で既に物件名などが入力されている場合は上書きせず保護し、かつマスタにない現場はすべて手入力可能にするという「自動補完・コピペ・手動のハイブリッド共存」を実現します。

### 変更内容

#### 1. フロントエンドロジック・UIの修正

##### [CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)
* **キーボードナビゲーション・ショートカットの実装**:
  - `handleKeyDown` イベントリスナーにおいて、矢印キー（`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`）の入力を検知し、現在選択されているセルから隣接するセルへフォーカスを移動するロジックを実装しました。
  - セル移動後、移動先の要素（`id`）を取得し、`scrollIntoView` で画面内へ自動スムーズスクロールする処理を組み込みました。
  - セル選択状態で `Enter` を押すとインライン入力（編集開始）となり、編集中の `Enter`/`Esc` での確定/キャンセルもサポートします。
  - `Ctrl + F` キーの組み合わせをフックし、ブラウザ標準のページ内検索をキャンセルした上で、カレンダー上部の専用検索入力フィールドへフォーカスおよび既存入力テキストを全選択する機能を実装しました。
* **検索ステートおよび検索入力窓の追加**:
  - 検索クエリ用の `searchQuery` ステートと、検索窓フォーカス用の `searchInputRef` を追加しました。
  - カレンダー上部のツールバー右端に、`lucide-react` の `Search` アイコンおよびクリア（✕）ボタンを配したスタイリッシュな検索フィールドを設置しました。
* **レンダリングの拡張**:
  - 予定の一致/不一致状態に基づき、一致行には `row-search-match`、不一致行には `row-search-no-match` クラスを動的に適用するようにしました。
  - 検索一致セル自体にイエローハイライト（`cell-search-match`）を付与するため、`renderEditableCell` 共通関数および `staff_name` の個別 td 描画部分に判定ロジックを追加しました。
  - 自動スクロール用に、すべての td 要素に一意なID `cell-{dateStr}-{rowIndex}-{field}` を付与しました。
  - Lucide icons から `Search` をインポートに追加しました。

#### 2. フロントエンドCSS of 修正

##### [CalendarView.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.css)
* **確定予定・仮予定のプレミアムデザイン更新**:
  - **確定予定 (`.row-cell-confirmed`)**: 背景色を上品で注意を引きやすい薄赤（`rgba(239, 68, 68, 0.06)`）に変更し、左端のアクセントバーを太さ `5px` の赤色（`#ef4444`）に変更。より立体感を出すための調整を施しました。
  - **仮予定 (`.row-cell-draft`)**: 背景に上品な極薄イエロー（`rgba(234, 179, 8, 0.04)`）を敷き、その上に CSS `repeating-linear-gradient` を用いた極細の斜めストライプ（縞模様）をオーバーレイ表示。左端のアクセントバーも太さ `5px` の黄色（`#eab308`）にし、直感的な未確定感と意匠性を両立させました。
* **検索窓およびハイライトスタイルの定義**:
  - カレンダー上部の検索窓コンテナ、半透明入力フィールド（フォーカス時に幅が 200px ➔ 250px へとスムーズにアニメーション伸長する）、検索アイコン、およびクリアボタンの CSS スタイルを追加しました。
  - 検索一致した行・セルのスタイル（`.row-search-match`：薄いゴールド、`.cell-search-match`：明るいイエロー `#fef08a` ＋ 境界線）、および検索非該当行のスタイル（`.row-search-no-match`：`opacity: 0.35` ＋ グレースケールフィルタによるグレーアウト）を追加しました。

---

### 検証結果

1. **ビルド検証**:
   - `frontend` ディレクトリにおいて、`npm run build` を実行し、TypeScriptのコンパイルと Vite のプロダクションビルドがエラーなく成功することを確認済みです。

---

## [2026-06-19] セル選択のパフォーマンス高速化（カクつき解消）・滑らかなアニメーション追加およびカレンダー外枠線・縦スクロールバグ修正

### 変更の目的
1. カレンダー（月間予定表）でセルをクリックして選択する際、描画がミリ秒単位で一瞬フリーズする（カクカクする）不具合を解消するため、再レンダリング時の重いスケジュールソート・フィルタリング処理をキャッシュ（メモ化）して高速化します。
2. セル選択時の背景色の切り替えやホバー時のもっさり感をなくし、ユーザー体験を滑らかにするため、適切なCSSトランジションを追加します。
3. カレンダーで左右にスクロールしきった際に、最初の日付ブロック（木曜日）や最後の日付ブロック（土曜日）の端のセルがスクロールエリアの黒枠線とぴったり密着して窮屈に見えるデザイン上の違和感を解消するため、外枠との間に適切な余白（パディング）を設けます。
4. 日付ブロック（曜日カード）の枠線が薄く、テーブル内のセルの境界線と同化して見づらい不具合を解消するため、曜日カードの枠線を太く（`3px`）し、平日・土曜日・日曜日・今日でそれぞれ枠線色を個別定義することで、カードの輪郭をはっきりと際立たせ、強調表示します。
5. 「100vh固定のFlexbox全体フィットレイアウト」の導入によって、画面全体の縦スクロールを禁止した結果、マスタ管理（`.master-mgmt-container`）、集計分析（`.analytics-container`）、および変更履歴/監査ログ（`.audit-log-container`）の各画面において、データ数が画面の高さを超えた場合に下部が見切れ、縦スクロールできなくなっていたバグを修正します。

### 変更内容

#### 1. フロントエンドロジックの修正 (Reactパフォーマンス改善)

##### [CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)
* 日付ごとのスケジュール取得・ソート処理 `getSortedDaySchedules` が、セルを選択（クリック）するたびにカレンダー全体（数千セル）に対して再計算されてフリーズしていた問題を解決するため、`React.useMemo` を用いたキャッシュマップ `sortedSchedulesMap` を導入しました。
* これにより、選択状態のステート切り替え時など、無駄な計算がすべてスキップされ、ミリ秒単位で高速に応答するように改善されました。

#### 2. フロントエンドCSSの修正 (ビジュアルとスムーズさの向上)

##### [index.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/index.css)
* カレンダーの標準境界線変数 `--border-column-block` のカラーを、より境界線として認識しやすいコントラストの高い色（ライトテーマ：`#cbd5e1`➔`#94a3b8`、ダークテーマ：`#334155`➔`#475569`）に調整しました。

##### [CalendarView.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.css)
* 曜日ブロックを横並びにするコンテナ `.week-days-container` に対し、`padding: 12px` を追加しました。これにより、スクロールした際にも最初と最後の日付カードの端がスクロール枠とぴったり密着せず、周囲にゆとりのあるプレミアムなデザインに改善されました。
* 日付ブロック `.day-column-block` の `border` を `2px` から `3px` へ太く変更し、陰影（`box-shadow`）もより深みのある影へ強化しました。
* 土曜日（`.saturday-column`）、日曜日（`.sunday-column`）の枠線色をそれぞれブランドカラーの透過青・透過赤に個別定義しました。
* 今日（`.today-column`）の枠線を `3px solid var(--primary)` へ太くし、光彩のような強いドロップシャドウをかけることで視認性を最大化しました。
* 通常のセル `.day-calendar-table td`、選択セル `.selected-grid-cell`、および選択行 `.parallel-calendar-row.selected-row` に対して `transition: background-color 0.12s ease;` などのスムーズ変化プロパティを適用し、セル選択移動時やホバー時の背景切り替えをじんわりと滑らかに行うように改善しました。

##### [MasterManagementView.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/MasterManagementView.css)
* ルートコンテナ `.master-mgmt-container` に対して、固定的な最小高さ `min-height: calc(100vh - 200px)` を廃止しました。
* Flexboxの子要素として親コンテナに完全に収まるよう `flex: 1; min-height: 0;` を設定し、`overflow-y: auto` を追加することで、マスタ管理（スタッフ・予定項目・データ管理など）画面で下部へスクロールできるように修正しました。

##### [AnalyticsView.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/AnalyticsView.css)
* ルートコンテナ `.analytics-container` に対して、同様に `flex: 1; min-height: 0; overflow-y: auto;` を設定し、集計分析画面でのスクロールを可能にしました。

##### [AuditLogView.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/AuditLogView.css)
* ルートコンテナ `.audit-log-container` に対して、同様に `flex: 1; min-height: 0; overflow-y: auto;` を設定し、変更履歴（監査ログ）画面でのスクロールを可能にしました。

---

### 検証結果

1. **ビルド検証**:
   - `frontend` ディレクトリにおいて、`npm.cmd run build` を実行し、TypeScriptコンパイルおよびViteビルドが警告なしで正常終了することを確認しました。

---

## [2026-06-18] 外注スタッフ紐付け解除・同期除外およびマスタ表示改善

### 変更の目的
外注スタッフ「SF濱田」や「FR岡崎」などのメンバーについて、マスタ苗字が同じであるという理由から FTS の社員（濱田正貴、岡﨑勝二）と誤って自動名寄せ同期が実行されていた不具合を修正します。外注スタッフのデータを初期化するとともに、今後の自動同期処理から完全に除外します。また、マスタ管理画面の視認性を高めるため、アバターアイコンの表示を追加します。

### 変更内容

#### 1. データベースのデータ修復 (Supabase)
* 誤って FTS 社員のデータが紐付いてしまっていた以下の外注スタッフのデータをリセットしました。
  * **ID 28 (SF濱田)**:
    * `email`: `m_hamada0954@fts.co.jp` ➔ `hamada@example.com` (ダミー)
    * `employee_code`: `000954` ➔ `null`
  * **ID 29 (FR岡崎)**:
    * `email`: `k_okazaki@fts.co.jp` ➔ `okazaki@example.com` (ダミー)
    * `employee_code`: `000863` ➔ `null`

* マスタ上のメールアドレスが同名の別社員のもの（アバター画像なし）になっていたため、アバターが表示されていなかった以下の社員データを正しいメールアドレスおよび社員番号へ修正しました。
  * **ID 8 (佐藤)**:
    * `email`: `y_sato@fts.co.jp` (佐藤裕一氏) ➔ `t_sato@fts.co.jp` (佐藤健文氏: 000861、アバター画像あり)
    * `employee_code`: `null` ➔ `000861`
  * **ID 10 (小山)**:
    * `email`: `t_koyama0901@fts.co.jp` (小山達陽氏) ➔ `n_koyama@fts.co.jp` (小山信行氏: 000711、アバター画像あり)
    * `employee_code`: `null` ➔ `000711`

#### 2. フロントエンドコードの修正

##### [MasterManagementView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/MasterManagementView.tsx)
* **自動同期処理 (`handleSyncMicrosoftAccounts`) での外注メンバー除外**:
  * 同期ループの開始時に、スタッフ名が `FE`, `SF`, `FR` から始まるか、またはコース番号が `90` 以上の場合は同期対象外として `skippedCount` を加算し `continue` するガード条件を追加しました。
  * 同期対象の抽出クエリにおいて、外注メンバーの判定に必要な `default_course` カラムを Supabase からの `select` 対象に追加しました。
* **スタッフ一覧テーブルでのアバター表示**:
  * 氏名カラムにフレックスレイアウトを導入し、アバター画像（`st.avatar_url`）がある場合は画像、ない場合は登録名の頭文字を用いた「丸型イニシャルバッジ」を表示するように修正しました。

---

### 検証結果

1. **データリセット検証**:
   - `node dump_staff.js` を実行し、ID 28 および 29 の `email` と `employee_code` が正しくリセットされたことを確認しました。
2. **ビルド検証**:
   - `frontend` ディレクトリにおいて、`npm.cmd run build` を実行し、TypeScriptの型エラーなく正常にビルド（`tsc -b && vite build`）が完了することを確認しました。

---

## [2026-06-18] 月間予定表ステータス（確定・仮・フリー）のワンクリック切り替えおよびデザイン改善

### 変更の目的
月間予定表（カレンダーグリッド）において、予定セルを右クリックすることによって、いつでも手動でステータス（確定、仮、フリー）を相互に切り替えられるようにし、また視認性のために全体の背景色は「白」としつつ、左端にだけステータス別のアクセント線（緑：確定、オレンジ：仮、線なし：フリー）を出すシンプルなデザインに変更します。

### 変更内容

#### 1. 予定データの型定義拡張 (`types.ts`)
* `ScheduleStatus` 型に `'free'` (フリー/通常予定) を追加し、新規作成やコピペ貼り付け時のデフォルトのステータスとしました。

#### 2. フロントエンドコードの修正

##### [CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)
* **右クリックコンテキストメニューの拡張**:
  - 右クリックした予定の現在のステータスを判定し、それ以外のステータスへ変更するためのアクションボタン（「予定を【フリー】に変更」「予定を【確定】に変更」「予定を【仮】に変更」）を動的に並べました。
  - ワンクリックで `onSave` を呼び出し、直接 Supabase 上の `status` カラムを更新するようにしました。
* **新規・ペースト時のデフォルトステータス変更**:
  - クイック追加、インライン編集での新規作成時の初期ステータスを `'free'` に設定しました。
  - ペースト貼り付け時のステータスは、コピー元予定のステータス（なければ `'free'`) を引き継ぐようにしました。
* **クラス解決ロジックの修正**:
  - ステータスが `free` の場合は `row-cell-free` クラスをセルに付与し、かつ行の最初の列（`type` 列）にのみ `first-status-cell` クラスを渡すようにしました。

##### [CalendarView.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.css)
* **背景色の白統一とアクセント線の定義**:
  - すべての予定ステータス（`row-cell-free`, `row-cell-confirmed`, `row-cell-draft`）の背景色を、共通の白背景（`var(--bg-empty)`）に戻しました。
  - 確定予定 (`.row-cell-confirmed`) かつ先頭セル (`.first-status-cell`) の場合のみ、左端に **グリーンのアクセントバー (#10b981)** を表示します。
  - 仮予定 (`.row-cell-draft`) かつ先頭セル (`.first-status-cell`) の場合のみ、左端に **オレンジのアクセントバー (#f59e0b)** を表示します。

---

### 検証結果

1. **ビルド検証**:
   - `npm.cmd run build` を `frontend` ディレクトリで実行し、エラーなく正常にビルドが完了することを確認しました。

---

## [2026-06-18] 予定追加・編集ドロワーの高級ガラスモルフィズムデザイン適用およびカレンダーの白背景化

### 変更の目的
予定の追加・編集を行う画面を右端からスライドインするサイドバー（ドロワー）方式に変更したことに加え、ライト・ダークの両テーマに対応した美しく高級感のあるガラスモルフィズム（背景ぼかし）デザインを採用します。また、カレンダー予定セルの背景を純白に統一し、ステータス（確定・仮）の視認性を高めます。

### 変更内容

#### 1. フロントエンドCSSの修正
* **[index.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/index.css)**:
  - `.schedule-sidebar-content` の背景を不透明から半透明の `var(--bg-glass)` に変更し、ぼかし強度を `backdrop-filter: blur(20px)` に強化しました。
  - サイドバーの左端影（`box-shadow`）をより広範囲で滑らかな影にチューニングし、立体感と高級感を向上しました。
  - 最上部にグラデーション（`linear-gradient`）を用いた 4px のアクセントバーを設置し、プレミアムな外観にブラッシュアップしました。
* **[CalendarView.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.css)**:
  - 予定セル（`.row-cell-free`, `.row-cell-confirmed`, `.row-cell-draft`）の背景色を、薄いグレー（`var(--bg-empty)`）から、テーマに応じた `var(--bg-secondary)`（ライトテーマでは純白 `#ffffff`、ダークテーマでは `#161e31`）に変更しました。これにより「背景は白がいい」というユーザー要望を満たしつつ、確定（緑）・仮（オレンジ）のアクセントバーが明瞭に引き立つようになりました。

#### 2. フロントエンドUI構造 of 修正
* **[ScheduleModal.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/ScheduleModal.tsx)**:
  - ドロワー内での操作性を最適化するため、ヘッダーと最下部のアクションボタン群（保存、キャンセル、削除、メール通知）の位置を固定し、入力フォーム項目部分のみが独立してスクロールするレイアウト（flexbox構成）へ変更しました。

---

### 検証結果

1. **ビルド検証**:
   - `frontend` ディレクトリにおいて、`npm.cmd run build` を実行し、TypeScriptコンパイルおよびViteビルドが警告なしで正常終了することを確認しました。

---

## [2026-06-18] 小画面（レスポンシブ）でのヘッダーレイアウト崩れ対策

### 変更の目的
ノートPCや狭いブラウザウィンドウなど、画面横幅が不足した際にヘッダーの各要素（ロゴ、タブ、ボタン群、ユーザープロファイル）が押しつぶされて縦書き化したり、表示が大きく崩れて重なってしまう問題を解決し、小さい画面でも美しく整然としたレスポンシブUIを提供します。

### 変更内容

#### 1. フロントエンドUI構造の修正
* **[App.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/App.tsx)**:
  - 右側のアクションボタン群のラッパー `div` からインラインスタイルを排除し、新規の共通CSSクラス `className="header-actions"` に置き換えました。

#### 2. レスポンシブCSSの導入・崩れ防止
* **[index.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/index.css)**:
  - `header` 自体に `flex-wrap: wrap` と `gap: 1rem` を持たせ、画面幅が制限された際の自然な折り返しを可能にしました。
  - ロゴセクション、ナビタブ、アクションボタン群の主要3要素に `flex-shrink: 0` を付与し、かつロゴテキストに `white-space: nowrap` を適用することで、要素が不自然に極小へ潰されて縦書きテキスト化する崩れを完全に防ぎました。
  - `@media (max-width: 1200px)` メディアクエリを定義し、画面幅が 1200px 未満の場合はヘッダーレイアウトを縦積み（ロゴ・環境バッジ ➔ ナビゲーションタブ ➔ アクションボタン・ユーザープロフィール）に最適化しました。
  - タブの数が多い場合でも、`.nav-tabs` を `overflow-x: auto` に設定してスクロールバー自体は非表示（`scrollbar-width: none`, `-webkit-scrollbar: { display: none }`）にすることで、画面幅が狭い場合でも左右フリック/スクロールで快適にタブ切り替えが行えるようにしました。

---

### 検証結果

1. **ビルド検証**:
   - `frontend` ディレクトリにおいて、`npm.cmd run build` を実行し、TypeScriptコンパイルおよびViteビルドが正常に完了することを確認しました。

---

## [2026-06-18] キャンセルされた予定の対応者・コース番号自動クリアおよび最下部移動対応

### 変更の目的
予定のステータスが「キャンセル」に変更された際、以前割り当てられていた対応者（`staff_id`, `staff_name`）やコース番号（`course`）を自動的に空白にクリアし、二重手配を防ぎます。また、カレンダー（月間予定表）や予定表（グリッド）などの表示リストにおいて、キャンセルされた予定が自動的に最下部に移動して表示されるようにソート処理を改善します。

### 変更内容

#### 1. フロントエンドUIおよびデータ保存処理の修正
* **[ScheduleModal.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/ScheduleModal.tsx)**:
  - 予定保存の `handleSubmit` 内で、ステータスが `cancelled`（キャンセル）の場合に、`staff_id: null`、`staff_name: ''`、`course: ''`（空白）にクリアし、かつ区分（`division`）を `'未定'` に設定して Supabase へ保存するロジックを追加しました。
* **[CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)**:
  - 右クリックカスタムコンテキストメニューに「予定を【キャンセル】に変更」を追加しました。
  - 右クリックからキャンセルへ変更した際も、モーダル保存時と同様に `staff_id: null`、`staff_name: ''`、`course: ''`、`division: '未定'` を Supabase へ直接上書き保存する処理を追加しました。

#### 2. カレンダー・グリッド等でのソートロジック調整
* **[CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)**:
  - `getSortedDaySchedules` 内のソートロジックにおいて、`a.status === 'cancelled'` の予定を最優先で最下部にソートする（他の未定予定よりもさらに下にする）判定を追加しました。
* **[GridView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/GridView.tsx)**:
  - 予定表（グリッド）の `sortedSchedules` ソートロジックにおいても同様に、キャンセルされた予定を最下部に配置する判定を追加しました。

---

### 検証結果

1. **ビルド検証**:
   - `frontend` ディレクトリにおいて、`npm.cmd run build` を実行し、TypeScriptの型エラーおよびビルドエラーなくビルドが成功することを確認しました。

---

## [2026-06-18] キャンセルされた予定の強制表示クリアおよび仮想フリー行の復活対応

### 変更の目的
すでにステータスが「キャンセル」としてデータベースに保存されている古いデータにおいて、対応者やコース番号が残ってしまっている場合に、画面上のカレンダーやグリッド表示で強制的に空白として描画し二重手配の表示を防ぎます。また、実予定がキャンセルされた結果、元の対応者スタッフにはその日の割り当て予定がなくなるため、本来のコース順（上部）に仮想フリー行（空き予定枠）が正しく復活して表示されるようにロジックを改善します。

### 変更内容

#### 1. カレンダーの仮想フリー行生成ロジックの改善
* **[CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)**:
  - `getSortedDaySchedules` 内の `hasScheduleForThisCourse` の判定において、`s.status !== 'cancelled'` を追加しました。これにより、ステータスがキャンセルされた予定は実予定なしとみなされるようになり、元の対応者スタッフに対する仮想フリー行が正しく上部（本来のコース順）に自動生成される（フリー枠として戻る）ようになりました。

#### 2. 表示レンダリング時の強制データクレンジング
* **[CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)**:
  - `blended` 配列を生成する段階で、ステータスが `cancelled`（キャンセル）の実予定については、`staff_id: null`、`staff_name: ''`、`course: ''`、`division: '未定'` を強制マッピング（クローンによる書き換え）して表示するようにしました。これにより、データベース上の古い予定レコードに古い割り当て情報が残っていても、画面上では確実に空白化して表示され、かつ最下部にソートされます。
* **[GridView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/GridView.tsx)**:
  - グリッドの `sortedSchedules` を生成する前に、`filteredSchedules` にマップを適用し、カレンダーと同様に `status === 'cancelled'` の予定は対応者、コース、区分を強制クリアしたオブジェクトとして処理するようにしました。

---

### 検証結果

1. **ビルド検証**:
   - `frontend` ディレクトリにおいて、`npm.cmd run build` を実行し、TypeScriptの型エラーやビルドエラーが一切発生せず、本番ビルドが正常終了することを確認しました。

---

## [2026-06-18] 小画面ヘッダー縦積み時のカレンダー高さ自動調整（日付ジャンプ隠れ対策）

### 変更の目的
画面幅が 1200px 未満になり、グローバルヘッダーが縦積み（高さが通常より増加）になった際、カレンダーおよびグリッド全体の高さ制限が大きすぎることで画面全体にスクロールが発生し、カレンダー上部の日付切り替えコントロール（`matrix-header`、日付ジャンプや前の月・次の月ボタン）がグローバルヘッダーの裏側に潜り込んで見えなくなってしまう不具合を解消します。

### 変更内容

#### 1. レスポンシブCSSの調整
* **[index.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/index.css)**:
  - 1200px 以下のメディアクエリ（`@media (max-width: 1200px)`）の末尾に、カレンダーグリッドのコンテナ（`.matrix-board-container`）および予定表グリッドのコンテナ（`.grid-view-container`）の `height` を `calc(100vh - 320px) !important` に、`min-height` を `450px !important` に自動調整する設定を追加しました。
  - これにより、グローバルヘッダーが縦に長くなった分、メインコンテンツ領域の高さが適切に縮小され、画面全体のスクロール発生を防ぎ、日付指定ジャンプやタイトル表示が常にヘッダーのすぐ下に固定表示された状態を維持できるようになりました。

---

### 検証結果

1. **ビルド検証**:
   - `frontend` ディレクトリにおいて、`npm.cmd run build` を実行し、ビルドがエラーなく正常終了することを確認しました。

---

## [2026-06-18] 100vh固定のFlexbox全体フィットレイアウトの導入による日付指定ジャンプ隠れ・横スクロールバー隠れの根本解消

### 変更の目的
画面幅が縮小されたりヘッダーが縦積み（複数行）になった際、画面全体の縦スクロールが発生し、カレンダー上部の日付指定ジャンプ（`.matrix-header`）や、月曜〜日曜日のカレンダー全体を横スクロールするためのバーが画面外（ヘッダーの裏側や画面最下部）に隠れてアクセスできなくなる不具合を、CSS Flexbox を用いた画面全体フィットレイアウトを導入することで根本的に解消します。

### 変更内容

#### 1. フロントエンドCSSの修正
* **[index.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/index.css)**:
  - アプリの最上位コンテナである `.app-container` の高さを `height: 100vh` に設定し、`overflow: hidden` でブラウザ全体の縦スクロールを完全に禁止しました。
  - `header` 要素に `flex-shrink: 0` を付与し、高さが複数行になっても潰れないようにしました。
  - `main` 要素を Flexbox 化（`display: flex; flex-direction: column; overflow: hidden;`）し、ヘッダーを除いた残りの縦幅を自動的に100%占有（`flex: 1; min-height: 0`）させ、余計なパディングも調整しました。
  - 1200px以下のメディアクエリ内のカレンダー・グリッドコンテナの `height: calc(100vh - 320px) !important` などの強硬な高さを削除し、Flexboxに高さを委ねる設定へ移行しました。
* **[CalendarView.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.css)**:
  - `.matrix-board-container` の固定高さ（`height: calc(100vh - 230px); min-height: 350px;`）を廃止し、`flex: 1; min-height: 0; display: flex; flex-direction: column;` に変更することで親要素 (`main`) にピッタリ収まるようにしました。
  - カレンダーのテーブルラッパーである `.matrix-table-wrapper` が、カレンダーコンテナの残りの高さをすべて占有し、自立スクロール（`overflow: auto`）することを徹底しました。
* **[GridView.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/GridView.css)**:
  - カレンダーと同様に、`.grid-view-container` の固定高さを廃止し、`flex: 1; min-height: 0; display: flex; flex-direction: column;` に変更しました。
  - グリッドのテーブルラッパー `.grid-table-wrapper` の自立スクロールを適用しました。

これにより、ヘッダーの高さが変動しても、日付指定ジャンプを含むカレンダーヘッダー（`matrix-header`）は常に画面内に吸着・固定表示された状態になり、スクロールした際にも隠れなくなりました。また、横スクロールバーも画面最下部に見える状態で固定され、カレンダーの操作性が劇的に向上しました。

---

## [2026-06-18] ヘッダーUIのコンパクト化（1行集約）および管理者デモログインへの富本アバターの適用

### 変更の目的
アバター画像が巨大（100px）に表示され、ヘッダーのパディングや要素間のギャップが大きいために折り返しが発生してヘッダーが3段になっていた問題を修正し、デスクトップ解像度で完全に1行にすっきり収まる極薄のヘッダーUIに変更します。また、管理者デモログイン時のアバター画像として、ユーザー様本人（富本夏瑞さん）の実際の登録アバター画像を適用します。

### 変更内容

#### 1. アバター画像不具合の解消とデモ設定の変更
* **[App.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/App.tsx)**:
  - 呼び出し元である `App.tsx` の冒頭に `import './App.css';` を追加。アバター関連のスタイル（丸形化、パディングなど）が正しく適用されるように修正しました。
  - `handleDemoAdminLogin` 内の `avatar_url` を、富本夏瑞さんのアバターURLに変更しました。
    - アバターURL: `https://bvhfmwrjrrqrpqvlzkyd.supabase.co/storage/v1/object/public/avatars/000644_1771487704318.png`

#### 2. ヘッダー全体のコンパクト化（CSSの最適化）
* **[index.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/index.css)**:
  - `header` のパディングを `1rem 2rem` ➔ `0.4rem 1.5rem` に変更し、縦余白を大幅に削減しました。
  - `gap` を `1rem` ➔ `0.75rem` に縮小しました。
  - ロゴセクションの `gap` を `0.5rem` に、ロゴテキスト `h1` のフォントサイズを `1.4rem` ➔ `1.15rem` に縮小しました。
  - ナビゲーションタブボタン `.tab-btn` のパディングを `0.5rem 1.25rem` ➔ `0.35rem 0.75rem` に、フォントサイズを `0.9rem` ➔ `0.82rem` にそれぞれ縮小し、隙間を詰めました。
  - アクションエリアのボタン群のフォントサイズを `0.8rem`、パディングを `0.35rem 0.75rem`、高さを `32px` に統一しました。
  - テーマ切り替えおよびデータ更新用の正方形ボタン（アイコンのみ）のサイズを `32px * 32px` 固定に制限しました。
* **[App.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/App.css)**:
  - アカウント表示部分 `.user-profile-trigger` のパディングを `0.25rem 0.6rem` に、アバター画像 `.user-avatar` およびフォールバック要素のサイズを `28px` ➔ `24px` に縮小しました。
  - 表示されるユーザー名 `.user-name` のフォントサイズを `0.875rem` ➔ `0.8rem` に小さくしました。

これにより、ヘッダーに要素が多数並んだ状態でも折り返されず、綺麗な1行でスマートに収まるスッキリしたUIになりました。

---

## [2026-06-18] 予定追加・貼り付けボタンの各ビューヘッダーへの移動および新規予定の移行ステータス制御

### 変更の目的
「スプレッドシートから貼り付け」および「予定を追加」ボタンをグローバルヘッダーから削除し、それぞれの目的が異なるビュー（月間予定表・予定表グリッド）のヘッダー領域内に移動・分離して配置します。また、それぞれの画面で作成されたデータの移行ステータス（`is_transferred`：0:月間のみ、1:グリッドのみ）が、ユーザー様の要望通りに正しく振る舞うように制御します。

### 変更内容

#### 1. グローバルヘッダーの変更
* **[App.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/App.tsx)**:
  - ヘッダー内の「スプレッドシートから貼り付け」および「予定を追加」のボタン記述を削除し、ヘッダーの横幅とUIを極限までシンプルにしました。
  - 使用されなくなった `Plus` アイコンのインポート文（lucide-react）を削除し、TypeScriptコンパイルエラーを防止しました。
  - `CalendarView` コンポーネントへ、インポートモーダルを開くためのプロップ `onOpenPasteImportModal={() => setIsImportOpen(true)}` を追加しました。

#### 2. 月間予定表（カレンダービュー）の変更
* **[CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)**:
  - `CalendarViewProps` インターフェースに `onOpenPasteImportModal` を追加しました。
  - カレンダーの見出し部分（`matrix-header`）の「日付ナビゲーションボタン群」の末尾に、移動した「スプレッドシートから貼り付け」と「予定を追加」ボタンを挿入しました。
  - 月間予定表内の「予定を追加」をクリックした際は、カレンダー上で現在表示中の基準日付（`currentDate`）が初期選択された状態で新規追加モーダル（`onOpenAddModal`）が開くように設計しました。
  - このボタンから追加、またはスプレッドシートからインポートされた予定は、デフォルトで **`is_transferred: 0` (月間予定表にのみ適用)** として保存されます。

#### 3. 予定表グリッドビューの変更
* **[GridView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/GridView.tsx)**:
  - 予定表グリッドのヘッダー（`grid-view-header`）の「日付ナビゲーションコントロール群」の右隣に、管理者ログイン時限定で新しく「予定を追加」ボタンを追加しました。
  - グリッドビュー内の「予定を追加」をクリックした際は、現在表示中の日付（`selectedDate`）が初期選択された状態で新規追加モーダルが開くようにしました。
  - このボタンから追加された予定は、デフォルトで **`is_transferred: 1` (予定表グリッドにのみ追加/即時反映)** として保存されます。

---

## [2026-06-18] カレンダーヘッダーの凡例ガイド削除・月移動ボタンの動的月名表示・並び順調整

### 変更の目的
日付並列カレンダーグリッドのヘッダー部（`matrix-header`）をさらにすっきりさせるため、不要な凡例文言やガイド（「仮予定 確定予定 ...」）を削除します。また、月移動ボタンの「前の月」「次の月」という表示を「5月」「7月」のような実際の月名（動的算出）に変更し、ボタンの並び順を「[前の月の月名] [次の月の月名] [日付指定] [本日]」に変更して操作性を最適化します。

### 変更内容

#### 1. カレンダービューの変更
* **[CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)**:
  - カレンダーに表示中の現在日付（`currentDate`）を基準に、前後の月名を算出するヘルパー関数 `getPrevMonthName` と `getNextMonthName` を追加しました。
  - 月移動ボタンの表示テキストを動的な月名（例: `<ChevronLeft /> 5月`, `7月 <ChevronRight />`）に変更しました。
  - 各ボタンコントロールの並び順を、「**[前の月名] [次の月名] [日付指定] [本日] [貼り付け] [予定を追加]**」の順に並び替えました。
  - 「日付指定ジャンプ」ボタンの表記を「日付指定」に簡略化し、「今日」ボタンの表記を「本日」に変更しました。
  - タイトル右側に表示されていた凡例ガイド要素（`matrix-legend`）を丸ごと削除し、画面を非常にすっきりさせました。
  - 不要となった `Info` アイコンのインポート文（lucide-react）を削除し、TypeScriptコンパイルエラーを防止しました。








## [2026-06-19] 物件マスタの住所に基づく「県別」および「エリア」自動解決ロジックの改善

### 変更の目的
物件マスタから号機情報を取得して予定を自動補完する際、住所（`address`）から「県別（`prefecture`）」および「エリア（`area`）」を決定するロジックを、ユーザー指定の運用ルールに完全に適合させます。

### 変更内容

#### 1. 自動解決判定ロジックの更新
* **[App.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/App.tsx)**:
  - `handleSaveSchedule` の物件補完ロジックにて、マスタの `prop.address` から以下のルールで「県別」と「エリア」を判定するよう実装を書き換えました。
  - **県別判定**:
    - 基本的には、住所の都道府県から「都/県」を除いた漢字表記（例: `神奈川`, `埼玉`, `千葉`, `静岡`, `栃木`, `長野`, `山梨` など）を設定。
    - **東京に限り**、住所が23区内の場合は **`23`**、23区外の場合は **`都下`** を設定。
  - **エリア判定**:
    - 1都3県（東京、神奈川、埼玉、千葉）および静岡の政令指定都市は、区名（例: `世田谷区`、`港北区`、`大宮区`、`葵区` など）をエリアとして抽出。※ただし、`相模原市` と `浜松市` は例外として、政令指定都市ですが `相模原市`、`浜松市` のように市名（市町村）として抽出。
    - 他県と重複する特定の区（**`中央区`、`北区`、`南区`、`西区`、`緑区`**）については、識別用のアルファベット（東京: `T`、千葉: `C`、埼玉: `S`、神奈川: `K`）を末尾に付与（例: さいたま市西区 ➔ `西区S`、横浜市西区 ➔ `西区K`、千葉市中央区 ➔ `中央区C`、東京都北区 ➔ `北区T`）。
    - 上記の政令指定都市の区に該当しない場合は、住所の先頭から抽出された最初の市区町村または郡全体（例: `八王子市`、`船橋市`、`川越市`、`鎌倉市`、`下高井郡` など）をエリアとして抽出。

#### 2. ビルド確認
- フロントエンドプロジェクトで `npm run build` （実行ポリシーをバイパスして実行）を実行し、型エラー等なく正常にビルドが成功することを確認しました。

## [2026-06-19] カレンダービューのインライン入力遅延解消および右クリックメニュー見切れ防止の対応

### 変更の目的
1. **文字入力遅延の解消**: インライン編集のキー入力（タイピング）時にカレンダーの全セルが再描画されてもっさりしていた問題を、セル内部にステートを閉じ込めることで劇的に動作を高速化させます。
2. **メニュー見切れの修正**: 画面端（下端や右端）で右クリックメニューを表示した際、メニューがウィンドウ外にはみ出て項目が見切れる不具合を、表示座標の自動オフセット補正によって解決します。

### 変更内容

#### 1. インライン入力パフォーマンス改善
* **[CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)**:
  - 入力テキストを自己管理する軽量な `InlineInput` コンポーネントを新しく定義しました。
  - 親の `CalendarView` で保持していた `editingValue` および `setEditingValue` 状態を完全に削除し、キー入力時の無駄な親の再レンダリング（全セルの再描画）を防止しました。
  - 編集状態のセルは、`InlineInput` を使用してローカルに文字入力を管理し、確定（フォーカスアウト/`Enter`）時のみ親に確定値を送信して保存するように設計しました。

#### 2. 右クリックメニュー（コンテキストメニュー）位置自動補正
* **[CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)**:
  - `onContextMenu` イベント発生時に、クリック座標 `clientX`, `clientY` とブラウザウィンドウの有効領域サイズ `window.innerWidth`, `window.innerHeight` を比較する処理を追加しました。
  - メニュー全体のサイズ（想定幅: 220px, 高さ: 320px）が画面の右や下にはみ出る場合、表示位置を上や左に自動でオフセットして、項目が画面外で見切れる不具合を防止しました。

#### 3. ビルド確認
- フロントエンドプロジェクトで `npm run build` を再度実行し、正常にビルドが成功することを確認しました。

## [2026-06-19] カレンダーヘッダー（matrix-header）のレスポンシブ崩れ・ボタン縦潰れ防止の対応

### 変更の目的
画面幅が縮小された際に、カレンダーヘッダーの操作ボタン群（「スプレッドシートから貼り付け」「予定を追加」など）の幅が極端に狭まってテキストが縦1文字並びに潰れてしまう不具合を解決し、狭い画面でもスマートに自動折り返しされるレイアウトを実現します。

### 変更内容

#### 1. レイアウト構造の最適化
* **[CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)**:
  - カレンダーヘッダー（`matrix-header`）の直下を「タイトル・期間」と「操作コントロール群（`matrix-controls`）」の2つに構造分離し、不要な余白や配置のインラインスタイル定義を排除しました。
  - これにより、画面サイズに応じてコントロール群全体が綺麗に下段へと自動折り返しされるようになり、要素が横に詰まって潰れる現象を防ぎます。

#### 2. ボタンの縦潰れ防止・改行抑止ルールの適用
* **[CalendarView.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.css)**:
  - コントロール群のコンテナ `.matrix-controls` を定義し、`flex-wrap: wrap` を有効化して要素の改行落ちを制御しました。
  - ヘッダー内の全ボタン要素に対して `white-space: nowrap` と `flex-shrink: 0` を `!important` で強制適用し、親要素の縮小に伴うボタン自身の変形やテキストの折り返し（縦潰れ）を完全に防止しました。

#### 3. ビルド確認
- フロントエンドプロジェクトで `npm run build` を実行し、ビルドがエラーなく正常に完了することを確認しました。

## [2026-06-19] カレンダーヘッダーコントロールの日付操作（左）と予定アクション（右）の左右分離レイアウト化

### 変更の目的
ナビゲーションである「日付操作」と、アクションである「予定追加・インポート」が並列に混在していた違和感を解消するため、日付操作系を左寄せ、予定操作・検索系を右寄せに明確に分離し、視覚的に整理されたプロ仕様の対比レイアウトに改善します。

### 変更内容

#### 1. HTML構造のグループ分割と整理
* **[CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)**:
  - `.matrix-controls` 内の各コントロールを、**`.matrix-nav-buttons.date-group`**（左側：前月/次月、日付指定、本日）と **`.matrix-nav-buttons.action-group`**（右側：スプレッドシートから貼り付け、予定を追加、検索窓） of 2グループに分割定義しました。
  - 各種ボタンから不要なインライン余白スタイルを排除し、CSSクラスによるレイアウト管理へ集約しました。

#### 2. CSSによる左右分離とレスポンシブ配置の定義
* **[CalendarView.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.css)**:
  - 親コンテナ `.matrix-controls` に対し `justify-content: space-between` を適用しました。
  - 右側の `.matrix-nav-buttons.action-group` に対し `margin-left: auto` を適用し、十分な幅がある環境では自動的に右端へ集約配置されるようにアライメントを設定しました。
  - 画面縮小時にはそれぞれのグループがまとまりを持ったままスマートに折り返されるよう `flex-wrap: wrap` を維持し、レイアウトが崩れないように調整しました。

#### 3. ビルド確認
- フロントエンドプロジェクトで `npm run build` を実行し、ビルドがエラーなく正常に完了することを確認しました。

## [2026-06-19] 住所自動解決ロジックの共通ユーティリティ化およびインポート機能（貼り付けインポート）への適用

### 変更の目的
物件の手動保存処理（`App.tsx`）に適用された最新の住所自動解決仕様（重複区へのアルファベット付加、特定政令市例外処理など）が、「スプレッドシートからの貼り付け」インポート（`PasteImportModal.tsx`）およびそのプレビューUI画面で反映されておらず、古い仕様のままで動作していた不整合を解決します。
住所解決ロジックを共通関数 `resolveAddress` として切り出し、システム全体で一貫した住所解決ルールを統一適用します。

### 変更内容

#### 1. 共通住所解決ユーティリティ関数の新設
* **[NEW] [addressResolver.ts](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/utils/addressResolver.ts)**:
  - 物件マスタの住所表記から「県別」と「エリア」を自動解決する処理を実装しました。
  - 東京23区（`23`）/ 東京23区外（`都下`）の分類、政令指定都市（横浜、川崎、さいたま、千葉、静岡。相模原・浜松は除く）の区名抽出、重複区名（中央、北、南、西、緑）への識別用アルファベット（T, C, S, K）の付与を含む最新の仕様を実装。

#### 2. 手動保存処理での共通関数の適用
* **[MODIFY] [App.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/App.tsx)**:
  - 内部で定義されていた長大な住所解決ロジックを削除し、`resolveAddress` 共通関数をインポートして呼び出す形にリファクタリングしました。

#### 3. 貼り付けインポート処理およびプレビューUIでの共通関数の適用
* **[MODIFY] [PasteImportModal.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/PasteImportModal.tsx)**:
  - インポート時の自動補正およびデータパース処理内の古い住所解決ロジックを `resolveAddress` の呼び出しに変更しました。
  - インポート実行前のプレビュー表示テーブル内の「エリア」表示ロジックも `resolveAddress` に統一し、事前に最新の解決結果が正しくUI上に確認できるよう改善しました。

#### 4. ビルド確認
- フロントエンドプロジェクトで `npm run build` を実行し、ビルドがエラーなく正常に完了することを確認しました。

## [2026-06-19] 予定追加/編集モーダル（サイドバー）手動入力時の号機連動リアルタイム自動補完の追加

### 変更の目的
予定の追加/編集モーダル（サイドバー）で号機を手動入力（またはペースト）した際、サジェストドロップダウンから選択しなければ物件名、エリア、県別が画面上で自動補完されないUX上の課題を解決します。
号機を入力して他の入力欄に移動した（フォーカスアウトした）瞬間、自動で物件マスタを完全一致検索し、物件名・エリア・県別を画面のステートにリアルタイム補完する処理を追加します。あわせて、モーダル内の住所解決処理も最新の共通関数 `resolveAddress` に統合します。

### 変更内容

#### 1. モーダル内住所解決処理の共通化
* **[MODIFY] [ScheduleModal.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/ScheduleModal.tsx)**:
  - モーダル内に個別に定義されていた古い住所判定関数 `determineAreaAndPrefecture` を削除し、共通ユーティリティの `resolveAddress` をインポートして使用するように統一しました。
  - サジェスト選択時（`handleSelectProperty`）の住所解決を `resolveAddress` に置き換えました。

#### 2. フォーカスアウト（onBlur）時のリアルタイム自動補完処理の追加
* **[MODIFY] [ScheduleModal.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/ScheduleModal.tsx)**:
  - 号機入力フィールドからフォーカスアウトした際に呼び出される `handleUnitNumberBlur` 関数を実装しました。
  - 入力された号機番号をキーに物件マスタを検索し、完全一致する物件マスタが存在し、かつ物件名等の項目が空欄（またはデフォルト値）の場合に、物件名、ボックス数、型式、エリア、県別を自動で画面上のステートへ代入補完します。
  - JSX内の号機 `input` タグの `onBlur` イベントハンドラをこの `handleUnitNumberBlur` に変更しました。

#### 3. 検索および自動補完のSupabase直接接続への切り替え
* **[MODIFY] [ScheduleModal.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/ScheduleModal.tsx)**:
  - サジェスト（あいまい検索：`handleUnitNumberChange`）およびフォーカスアウト時の自動補完（完全一致検索：`handleUnitNumberBlur`）のデータ取得方法について、従来のローカルAPI（`localhost:5000`）経由の fetch 処理から、`supabase` クライアントを用いたデータベース（`properties` テーブル）の直接クエリへ移行しました。
  - これにより、バックエンドAPIサーバーが起動していない環境でも、確実に自動補完およびサジェスト表示が動作する強固な構成になりました。

#### 4. ビルド確認
- フロントエンドプロジェクトで `npm run build` を実行し、ビルドがエラーなく正常に完了することを確認しました。

## [2026-06-19] 同行者アサイン機能の自動連動同期、ハイブリッド選択UI、カレンダー表示装飾の実装

### 変更の目的
1. **同行予定の自動同期化**: メイン担当者の予定に同行者（マスタ登録スタッフ）が指定された際、同行者自身のカレンダー行にも連動予定（「〇〇同行: [物件名]」）を自動的に作成・更新・削除し、スケジュールの確保と管理の手間を排除します。
2. **手動・クイック選択のハイブリッドUI化**: 同行者をマスタ内のスタッフから簡単にクリックトグルで追加・削除できるクイック選択ボタンを提供しつつ、マスタ外のメンバーも手動で自由にタイピングしてカンマ区切り入力できるようにします。
3. **カレンダー画面での視認性向上とメタデータ保護**: カレンダー上に自動生成された同行予定の左側に「同行」バッジを表示して視認性を高め、同期のための親子紐付けメタデータ `[__parent_id:...]` を画面表示やインライン編集初期値から完全に隠蔽（かつインライン編集保存時も保護）します。

### 変更内容

#### 1. ハイブリッド同行者入力UIの追加
* **[ScheduleModal.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/ScheduleModal.tsx)**:
  - 同行者入力欄の下部に、スタッフマスタ（`staff`）から選択できるクイック選択タグを表示しました。
  - タグをクリックするとカンマ区切りのリストに動的に追加・削除（トグル）される `handleToggleCoWorker` メソッドを実装しました。
  - テキストボックスから直接の手動タイピングによるカンマ区切り入力も引き続き可能です。

#### 2. 親予定の保存・削除時の「同行予定」自動同期
* **[App.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/App.tsx)**:
  - `handleSaveSchedule` 実行時に、保存完了した親IDを特定し、古い同期予定（`notes` カラムに `[__parent_id:親ID]` を含むもの）を一度削除した上で、新しい同行者リストに基づいて子予定レコードを自動作成・同期保存する処理を実装しました。
  - `handleDeleteSchedule` 実行時にも、同一の親子IDメタデータを持つ同期予定レコードが自動的に一括削除されるように連動処理を実装しました。
  - 親子紐付け用には、DBスキーマ変更不要な `notes` カラム末尾への `[__parent_id:親ID]` 埋め込み方式を採用しました。

#### 3. カレンダー表示・編集時のメタデータ隠蔽・保護および「同行」バッジの表示
* **[CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)**:
  - 画面表示やホバー、インライン編集時の値からメタデータ文字列（`[__parent_id:...]`）を正規表現で除去して完全に隠蔽する `cleanMetadata` ヘルパーを実装しました。
  - カレンダーのセル表示（値、`InlineInput` の `initialValue`、`title` 等）に対して `cleanMetadata` を適用しました。
  - 物件名（`property_name`）セルにおいて、同行予定（`notes` にメタデータが含まれるもの）の場合に紫色の「同行」バッジを表示するスタイルと要素を追加しました。
  - `handleInlineSave` にて、`notes` をインライン編集した際に元のメタデータが存在していた場合はそれを維持して保存するメタデータ保護処理を追加しました。

#### 4. ビルド確認
- フロントエンドプロジェクトで `cmd /c npm run build` を実行し、型エラー等がなくビルドが正常に通過することを確認しました。

## [2026-06-19] インライン編集（部分更新）時の同行予定消失バグの修正

### 変更の目的
カレンダーのセルをダブルクリックしてインライン編集（物件名や作業内容、備考などの部分更新）を行った際、リクエストデータに `co_worker` プロパティが含まれない（`undefined`）ため、自動同期処理が「同行者がいなくなった」と誤認識し、既存の同行予定をすべて削除してしまっていた重大な不具合を解消します。

### 変更内容

#### 1. 保存完了時の最新親レコード取得と同期処理への適用
* **[App.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/App.tsx)**:
  - `handleSaveSchedule` にて、Supabase への INSERT / UPDATE 完了時のレスポンスから、自動採番や未更新フィールドを含む最新の親予定オブジェクト（`finalParentRecord`）を取得するように変更しました。
  - 同行同期ロジックにおいて、画面側の部分更新用データ（`payload`）ではなく、DBから返ってきた最新の完全な親データ（`finalParentRecord`）のプロパティ（`co_worker`, `property_name`, `status`, `date` 等）を参照するように修正しました。
  - これにより、インライン編集による部分更新時でも既存の同行者設定が維持され、親レコードの物件名や日付が変更された場合も同行予定側が正しく連動更新されるようになりました。
  - `names` 分割処理時の `map`, `filter` 内のコールバック引数 `n` に対し、TypeScriptの `noImplicitAny` エラーを防止するため明示的に `string` 型を指定しました。

#### 2. ビルド確認
- フロントエンドプロジェクトで `cmd /c npm run build` を再実行し、型チェックおよびビルドがエラーなく正常に通過することを確認しました。

## [2026-06-19] カレンダービューの作業内容（description）セルの文字色変更

### 変更の目的
カレンダーグリッドにおいて、「作業内容」に入力された文字が意図的に薄グレーで表示されていた仕様を、他のセル項目（タイプ、BOX、号機、種別など）と同様に、はっきりとした通常文字色（黒）で表示されるように統一します。

### 変更内容

#### 1. スタイルクラスの除外
* **[CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)**:
  - `renderEditableCell` を呼び出して `description` カラムをレンダリングする部分から、文字を薄グレーにする `text-muted-cell` スタイルクラスを削除しました。

#### 2. ビルド確認
- フロントエンドプロジェクトで `cmd /c npm run build` を実行し、ビルドが正常に完了することを確認しました。

## [2026-06-20] マスタ管理画面のコンパクト化、プレースホルダー削除、および同期時スタッフ名本名化

### 変更の目的
1. **不要なプレースホルダー（例文）の削除**: マスタ管理画面の登録フォーム内における不要な例文プレースホルダー（「例: 佐藤」など）を削除して画面を整理します。
2. **全体的な余白の削減によるデザイン最適化**: マスタ管理画面のコンテナ、タブ、フォーム、テーブルセル、項目カードなどの余白を小さく調整し、多くの情報を一覧できるコンパクトで実用的なレイアウトにします。
3. **マスタ管理上の氏名を本名（フルネーム）へ更新する同期処理の拡張**: Microsoftアカウント同期の実行時に、外部プロフィールの表示名（`display_name`）をスタッフの `name` フィールドに反映し、マスタ上の表記を本名にアップデートできるようにします。なお、カレンダーやグリッド、印刷プレビューなど他の画面での表示は、すでに `getShortName` が適用されているため、これまでの苗字または「フーギー」表記のまま維持されます。

### 変更内容

#### 1. プレースホルダーの削除と同期処理の拡張
* **[MasterManagementView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/MasterManagementView.tsx)**:
  - 新規スタッフ登録、および新規予定項目追加のフォーム入力欄（`<input>`）から `placeholder` 属性を削除しました。
  - 同期処理（`handleSyncMicrosoftAccounts`）にて、Microsoftアカウントから取得した `display_name` の値をスタッフの `name` フィールドに反映（更新）するように上書き処理を追加しました。
  - これまで「ダミー以外の本物メールアドレス（@example.com以外）が設定されている場合は同期をスキップする」という制限ガードが入っていたため、すでにメールアドレス設定済みのスタッフが本名に上書きされない状態になっていました。この除外ガードを削除し、すでにメールアドレスが設定されている場合でも名前が未同期であれば本名（フルネーム）へ更新できるようにロジックを最適化しました。
  - Microsoftアカウントの display_name がスペースなしのフルネーム（例: `平本昭`）であっても、同期時にマスタの苗字データを元に「苗字 ＋ 半角スペース ＋ 名前」（例: `平本 昭`）という形式に自動補正して保存するようにロジックを最適化しました。
* **[types.ts](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/types.ts)**:
  - 苗字抽出関数 `getShortName` にて、スペースなしのフルネーム（例: `平本昭`）が引数として渡された場合でも、既定の苗字リスト（平本、築地、藤井など）と前方一致判定を行い、自動的に苗字部分のみを切り出して返す処理を組み込みました。これにより、すでにデータベースにスペースなしの本名が保存されている場合であっても、カレンダーやグリッド等では確実に「平本」「築地」といった苗字のまま表示されます。

#### 2. レイアウトの余白削減（コンパクト化）
* **[MasterManagementView.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/MasterManagementView.css)**:
  - `.master-mgmt-container` や `.master-add-form` の padding / gap を小さくしました。
  - 各種ボタン（`.master-tab-btn`）や、一覧テーブルのセル（`th`, `td`）の padding を縮小し、行の高さを抑えてスクロールなしで多くの情報を視認できるよう改善しました。
  - 予定項目一覧（`.worktype-item-card`, `.worktype-items-list`）の余白やギャップも縮小し、左右2カラムのバランスを整えました。

#### 3. ビルド確認
- フロントエンドプロジェクトで `cmd /c npm run build` を実行し、TypeScriptのコンパイルエラーがなくビルドが正常に通過することを確認しました。

## [2026-06-26] マスタ管理画面の余白の更なる削減（極限コンパクト化）

### 変更の目的
マスタ管理画面全体の余白（padding/margin/gap）をもう一歩細かくチューニングし、入力フォームやテーブル一覧などの縦のスペースを縮小して画面全体をよりスマートで密度の高い機能的なレイアウトにブラッシュアップします。

### 変更内容

#### 1. 各種余白・サイズ設定の更なる縮小
* **[MasterManagementView.css](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/MasterManagementView.css)**:
  - コンテナ（`.master-mgmt-container`）のパディングを `1.0rem` から `0.75rem` に、ギャップを `1.0rem` から `0.75rem` に削減。
  - サブタブバー（`.master-mgmt-tabs`）のパディングやタブボタン（`.master-tab-btn`）の文字サイズ・内側パディングを縮小し、ヘッダー側の省スペース化を追求。
  - セクション全体（`.master-section`）のギャップをさらに縮小。
  - 新規登録フォーム（`.master-add-form`）のパディング、および内部グリッド（`.form-grid`, `.form-grid-row`）の間隔をそれぞれ縮小。
  - 一覧テーブルのセルパディング（`th`/`td` の `padding`）をさらに削減（上下 `0.3rem` / 左右 `0.6rem` 等）して、行高さを極限までスマートに抑え、一覧性を最大化。
  - 項目カード（`.worktype-item-card`）などのパディングも縮小して統一。

#### 2. ビルド確認
- フロントエンドプロジェクトで `cmd /c npm run build` を実行し、ビルドが正常に完了することを確認しました。

## [2026-06-26] 未設定行のデフォルト予定種別を空白に変更

### 変更の目的
カレンダー（日付並列カレンダーグリッド）の下部などにプレースホルダーとして表示される「未設定」行（対応者が割り当てられていない仮想予定行）について、種別カラムに初期値として「フリー」と表示されていた仕様を変更し、空白（空文字）にすることで、表示をスマートかつ見やすく整えます。

### 変更内容

#### 1. 未割り当て仮想予定データのデフォルト値変更
* **[CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)**:
  - 画面下部に配置される3つの未割り当て仮想行の初期データ生成部（`temp-unassigned-${i}`）において、`work_type` を `'フリー'` から空文字 `''` に変更しました。
  - ドラッグ＆ドロップ用の一時的な拡張未割り当て行（`temp-unassigned-extra-${targetRowIndex}`）についても、同様に `work_type` を空文字 `''` に変更しました。
  - これにより、対応者未設定の予定枠については種別セルが空欄のまま表示されるようになります。

#### 2. ビルド確認
- フロントエンドプロジェクトで `cmd /c npm run build` を実行し、ビルドがエラーなく正常に通過することを確認しました。

## [2026-06-26] 担当者選択プルダウンの並び順をコース順に統一

### 変更の目的
カレンダービューの「クイック予定追加」ポップアップ内の担当者複数選択プルダウンや、各画面（予定表グリッド、カレンダー等）の予定追加・編集モーダルおよびセル編集セレクトボックスにおいて、スタッフの並び順が統一されておらずバラバラだった問題を解消し、デフォルトコース（`default_course`）の数値昇順で統一して操作性を向上させます。

### 変更内容

#### 1. グローバルなスタッフ状態に対する初期ソートの適用
* **[App.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/App.tsx)**:
  - データベースからスタッフマスタを取得する `fetchData` 関数内のスタッフ配列セット時（`setStaff` の直前）に、デフォルトコース番号の数値昇順でソート（`sortedStaffData`）する処理を導入しました。
  - 親コンポーネントである `App.tsx` 内で読み込み時にソートを完了させておくことで、各画面のインライン編集セレクトボックス、複数選択ドロップダウン（`CalendarView.tsx` の担当者複数選択メニューなど）、予定追加・編集モーダル（`ScheduleModal.tsx` 等）のすべてにおいて、明示的なソート処理を個別に行うことなく並び順がコースの数値昇順に一括で統一されるように改善しました。

#### 2. ビルド確認
- フロントエンドプロジェクトで `cmd /c npm run build` を実行し、TypeScriptの型エラー等なくビルドが正常に通過することを確認しました。

## [2026-06-26] カレンダーテーブルの列幅最適化（対応者名見切れ防止と省スペース化）

### 変更の目的
カレンダー（日付並列カレンダーグリッド）内の「対応者」列で、「フーギー」などの名前が横幅不足により見切れてしまう不具合を解消します。また、情報量の少ない「BOX」「TIME」「コース」列の幅を縮小することで、全体の横幅バランスを維持しつつ表示を最適化します。

### 変更内容

#### 1. colgroup によるテーブル列幅定義の調整
* **[CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)**:
  - 「対応者」列の幅を `100px` から **`120px`** に拡張し、アバターと名前が折り返されたり見切れたりせず、綺麗に1行に収まるように改善しました。
  - 「BOX」「TIME」「コース」の3列について、入力されるデータが3桁以内の短い数値や英数字であるため、それぞれの幅を `65px` から **`45px`** に縮小し、スペースを節約しました。
  - 「備考」列の幅を `130px` から **`150px`** に拡張し、全体的なテーブル合計幅（1410px）のバランスを維持しつつ、テキストの視認性を高めました。

#### 2. ビルド確認
- フロントエンドプロジェクトで `cmd /c npm run build` を実行し、ビルドがエラーなく正常に通過することを確認しました。

## [2026-06-26] 同行者の表示形式を対応者列と統一

### 変更の目的
カレンダー（月間予定表）だけでなく、予定表（グリッド）や印刷プレビュー画面においても、同行者（`co_worker`）の表示形式を対応者（苗字 / `getShortName` 適用）の列と統一し、デザインスタイルおよび表記の一貫性を向上させます。

### 変更内容

#### 1. 予定表グリッドにおける同行者表示のタグ化と苗字への統一
* **[GridView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/GridView.tsx)**:
  - 同行者列の表示を単なるテキストから、対応者列と同様の `staff-indicator-tag`（苗字を表示するタグ）形式に変更しました。
  - 同行者に複数名がアサインされている場合（カンマやスペース区切り）に対応するため、文字列をパースして各同行者を個別の `staff-indicator-tag` として横並びで表示するロジックを実装しました。

#### 2. 印刷プレビューにおける同行者表示の苗字統一
* **[PrintPreviewModal.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/PrintPreviewModal.tsx)**:
  - 印刷プレビュー内の同行者セルにおいて、表示される名前を `getShortName` により苗字に統一しました。
  - 複数同行者がいる場合は、苗字に変換した上でカンマ区切り（例: `平本, 築地`）で綺麗に並べて出力するよう修正しました。

#### 3. ビルド確認
- フロントエンドプロジェクトで `cmd /c npm run build` を実行し、TypeScriptのコンパイルおよびビルドが正常に通過することを確認しました。

## [2026-06-26] 同行予定（子予定）の物件名・同行者列の完全同期化

### 変更の目的
同行者アサイン時に自動生成される同行予定（子予定）の物件名から「〇〇同行: 」などの分かりづらいプレフィックスを排除し、親予定と完全に同一の物件名で予定が入るように改善します。あわせて、お互いの行で誰と動くのかが「同行者」列に正しく表示されるよう、相互に同行者リストを連動させることで、2名とも全く同じように予定が表示されるスマートなレイアウトを実現します。

### 変更内容

#### 1. 同行予定自動同期ロジックの修正
* **[App.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/App.tsx)**:
  - 子予定の作成ペイロードにおいて、`property_name` に親の物件名をそのままコピーして設定するように変更しました（「対応者同行:」の接頭辞を削除）。
  - 子予定の `co_worker` カラムに対して、その同行者視点での同行者リスト（「親のメイン対応者名」と「自分自身以外の他の同行者名」）を自動的にカンマ区切りで連結した文字列を生成し、保存するロジックを導入しました。これにより、平本の行には同行者「築地」、築地の行には同行者「平本」が自動的に表示されるようになります。

#### 2. ビルド確認
- フロントエンドプロジェクトで `cmd /c npm run build` を実行し、TypeScriptのコンパイルおよびビルドが正常に通過することを確認しました。

## [2026-06-26] 同行予定（子予定）の自動連動登録ON/OFF制御機能の追加

### 変更の目的
1日同行予定などの場合に、すべての予定が同行者のカレンダー行に重複して自動登録されて行数が膨れ上がってしまうのを防ぐため、予定登録・編集時に同行予定を相手の行に自動登録するかどうか（連動登録のON/OFF）をユーザーが手動で制御できるようにします。

### 変更内容

#### 1. 連動登録制御チェックボックスの追加とメタデータ保存
* **[ScheduleModal.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/ScheduleModal.tsx)**:
  - 予定追加・編集モーダルの同行者指定欄の下部に「相手の予定表にも自動登録する（連動登録）」チェックボックスを新設しました。
  - チェックボックスがOFFの場合、予定の保存時に `notes`（備考）の末尾へ非同期メタデータ `[__no_sync__]` を付加して保存する仕組みを実装しました。既存予定の編集時は `notes` 内の `[__no_sync__]` の有無を自動検出して初期状態へ復元します。

#### 2. メタデータ隠蔽・保護および自動同期制御の追加
* **[CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)**:
  - セル上の値から `[__no_sync__]` メタデータを完全に除去して非表示にするよう `cleanMetadata` ヘルパーを更新しました。
  - インライン編集で備考欄を部分更新した際にも `[__no_sync__]` が消失しないよう、データ書き込み時のメタデータ引き継ぎ保護処理を実装しました。
* **[App.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/App.tsx)**:
  - 同行予定の自動同期処理時、親予定の `notes` に `[__no_sync__]` が含まれる場合には、同行者側の行への予定自動登録（子予定の生成）をスキップするよう同期ロジックを修正しました（すでに登録されていた同行予定は自動的にクリーンアップされます）。

#### 3. ビルド確認
- フロントエンドプロジェクトで `cmd /c npm run build` を実行し、TypeScriptのコンパイルおよびビルドが正常に通過することを確認しました。

## [2026-06-26] 同行者に指定されたスタッフの仮想フリー（空き枠）行自動非表示化

### 変更の目的
同日の他の誰かの予定で「同行者」としてアサインされているスタッフについて、その日に実予定の登録がない場合でも、すでに同行の予定が入っているため、自身のカレンダー行に空き枠である「フリー」行（仮想フリー行）が表示されないように修正し、カレンダー表示の重複や不要な行表示を抑制して画面をスマートに整理します。

### 変更内容

#### 1. 仮想フリー行の追加条件の拡張
* **[CalendarView.tsx](file:///C:/Users/000644/.gemini/antigravity/scratch/field-schedule-manager/frontend/src/components/CalendarView.tsx)**:
  - 予定のキャッシュマップ作成処理（`sortedSchedulesMap`）において、同日の他人の実予定（`displaySchedules`）の中に、該当スタッフが同行者として名前が含まれているかを判定するロジック（`isCoWorkerOnThisDay`）を導入しました。
  - 実予定がなく、かつ同日の誰の予定の同行者にも指定されていない場合にのみ「フリー」行を追加するように制限しました。これにより、同行予定で埋まっているスタッフの「フリー」行が自動的に削除され、同行アサインが外れると再びフリー行として復活する挙動になりました。

#### 2. ビルド確認
- フロントエンドプロジェクトで `cmd /c npm run build` を実行し、TypeScriptのコンパイルおよびビルドが正常に通過することを確認しました。




