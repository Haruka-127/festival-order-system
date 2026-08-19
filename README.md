# 文化祭 注文番号呼び出しシステム

文化祭の飲食企画向けの注文番号呼び出しWebアプリケーション。

注文受付担当が注文を登録すると、注文全体で1つの受付番号が発行される。注文は提供場所ごとの作業に自動分割され、各提供担当が商品を提供可能にすると、共通モニターと利用客向け注文状況ページへ場所別の状態が反映される。

## 技術スタック

| 項目 | 採用技術 | 選定理由 |
|------|---------|---------|
| ランタイム | [Bun](https://bun.sh) v1.3+ | 高速、TypeScriptネイティブ、WebSocket内蔵 |
| Webフレームワーク | [Elysia](https://elysiajs.com) v1.4 | Bun最適化、軽量、型安全、WebSocket対応 |
| データベース | SQLite (bun:sqlite) | サーバー再起動後もデータ保持、外部依存不要、バックアップがファイルコピーだけで完了 |
| リアルタイム通信 | WebSocket (Bun内蔵) | 双方向通信、サーバーpushが可能、ポーリング不要 |
| 認証 | Cookieベースセッション + Bun.password (argon2id) | シンプル、外部サービス不要、パスワードはハッシュ化保存 |
| テスト | bun:test | Bun組み込み、高速、設定不要 |
| パッケージ管理 | Bun | bun.lockで確定、高速 |

## 必要環境

- [Bun](https://bun.sh) v1.3.14 以上

## セットアップ

```bash
# 依存関係のインストール
bun install

# 開発サーバーの起動（ホットリロード付き）
bun run dev
```

サーバー起動時に自動的に管理者アカウントが作成される（後述）。商品は管理画面から追加してください。

## 起動方法

### 開発環境

```bash
bun run dev
```

ホットリロード対応。ファイル変更時に自動再起動。

### 本番環境

```bash
# 環境変数の設定（.env.example をコピーして編集）
cp .env.example .env
# .env を編集し、BASE_URLやパスワードなどを適切に設定してください

# 起動
bun run src/index.ts

# またはビルドしてから実行
bun run build
bun run dist/index.js
```

### Docker

```bash
# 環境変数の設定（.env.example をコピーして編集）
cp .env.example .env
# 本番はHTTPSを使用し、COOKIE_SECURE=trueのまま運用してください

# 起動例（Docker管理ボリュームにDBを永続化）
docker compose up -d --build
```

Dockerイメージはビルドステージで `dist/index.js` にバンドルし、実行ステージには `node_modules` を含めない構成です。`docker-compose.yml` は Docker管理の名前付きボリューム `festival-order-data` をコンテナ内の `/app/data` にマウントするため、SQLiteデータはコンテナ削除後もボリュームに永続化されます。compose は `.env` の `BASE_URL`、`ADMIN_PASSWORD`、`COOKIE_SECURE` などを読み込んでコンテナに渡します。

## アクセス先

| 画面 | URL | 認証 |
|------|-----|------|
| ログイン | `http://localhost:3000/login` | なし |
| 注文受付画面 | `http://localhost:3000/staff` | 注文受付担当・管理者 |
| 提供担当画面 | `http://localhost:3000/provider` | 提供担当 |
| 管理画面（商品） | `http://localhost:3000/admin/items` | 管理者のみ |
| モニター画面 | `http://localhost:3000/monitor` | なし |
| 利用客画面 | `http://localhost:3000/order/:token` | なし（トークン認証） |

## 初期アカウント

### 管理者

| 項目 | 値 |
|------|-----|
| ユーザー名 | `admin` |
| パスワード | 開発時のみ `admin123`（`ADMIN_PASSWORD`で変更） |

**初回起動時に自動作成されます。本番環境では既定パスワードによる作成を拒否するため、初回起動前に十分長い `ADMIN_PASSWORD` を設定してください。**

**注意**: パスワードは初回起動時に `ADMIN_PASSWORD` 環境変数の値がDBにハッシュ化されて保存されます。**既にadminが作成された後に環境変数を変更してもDBのパスワードは変わりません。** 変更するにはサーバー停止後に以下のコマンドを実行してください。

```bash
bun -e "
const db = require('bun:sqlite').open('./data/orders.db');
const hash = await Bun.password.hash('新しいパスワード');
db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, 'admin');
db.prepare('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)').run('admin');
console.log('Password updated');
db.close();
"
```

### スタッフアカウント

管理画面の「スタッフ」から、注文受付担当または提供場所に所属する提供担当として追加できます。初期状態ではスタッフアカウントは存在しません。
スタッフのパスワード変更も管理画面から行います。変更すると対象スタッフの既存セッションは無効になり、すべての端末で再ログインが必要です。

## 環境変数

| 変数名 | デフォルト値 | 説明 |
|--------|------------|------|
| `PORT` | `3000` | サーバーのポート番号 |
| `BIND_ADDRESS` | `0.0.0.0` | Docker公開ポートのバインド先 |
| `HOST` | `0.0.0.0` | サーバーのバインドアドレス |
| `DATA_DIR` | `./data` | SQLiteデータベースの保存先ディレクトリ |
| `BASE_URL` | `http://localhost:3000` | 同一オリジン検証に使用する公開URL。リバースプロキシ使用時は公開URLを設定すること |
| `ADMIN_USERNAME` | `admin` | 初期管理者ユーザー名 |
| `ADMIN_PASSWORD` | 開発時は `admin123` | 初期管理者パスワード。本番の初回起動では強い値が必須（既存DBの変更方法は上記参照） |
| `DISPLAY_NUMBER_DIGITS` | `3` | 受付番号の桁数（例: 3→001） |
| `APP_TIME_ZONE` | `Asia/Tokyo` | 採番日・注文受付時間の判定に使用するIANAタイムゾーン |
| `COOKIE_SECURE` | `NODE_ENV=production` の場合は `true` | CookieのSecure属性。本番は `true` のままHTTPSで運用すること |
| `ALLOW_INSECURE_HTTP` | `false` | 隔離された信頼済みLANでHTTP運用を明示的に許可する緊急用設定 |
| `TRUST_PROXY` | `false` | 接続元を試行制限に使うため転送IPヘッダーを信頼する。アプリへの直接接続を遮断した場合のみ有効化 |
| `NODE_ENV` | - | `production` でSecure Cookie有効 |

## データ管理

### データ保存先

データベースファイル: `{DATA_DIR}/orders.db`（デフォルト: `./data/orders.db`）

### バックアップ

```bash
# サーバー停止後
cp ./data/orders.db ./backup/orders_$(date +%Y%m%d).db
```

またはWALモード稼働中でも以下で安全にバックアップ可能:
```bash
bun -e "
const db = require('bun:sqlite').open('./data/orders.db');
db.exec('VACUUM INTO \"./backup/orders_$(date +%Y%m%d).db\"');
db.close();
"
```

管理画面の「今すぐバックアップ」からも、整合したスナップショットを
`{DATA_DIR}/backups/orders-<UTC日時>.db` に作成できる。古い完了注文を削除する際も、削除前に同じ形式のバックアップを自動作成し、作成に失敗した場合は削除を中止する。

### 復元

```bash
cp ./backup/orders_20260401.db ./data/orders.db
bun run src/index.ts
```

## 画面構成

### 注文受付画面 (`/staff`)

- **左パネル**: 商品一覧（グリッド表示）、カート
- **右パネル**: 現在の注文一覧
- 商品をタップしてカートに追加（カート内で数量調整）
- カートに入れた商品はボタン右上に数量バッジが表示される
- 各商品ボタンには番号キーが表示され、**数字キー（1〜9, 0）**で素早く商品をカートに追加可能
- **Enterキー**で注文を確定、確定後のモーダルもEnterで閉じられる
- 注文確定後は受付番号のみをモーダル表示
- 提供場所ごとの進捗確認と注文全体のキャンセル
- 注文・商品一覧は5秒間隔で自動更新
- 通信結果が不明な場合も同一リクエストIDで再送し、二重注文を防止
- キャンセル時は確認と理由入力が必要。受渡済み商品を含む注文全体はキャンセル不可

### 管理画面 (`/admin/*`)

| 画面 | パス |
|------|------|
| 商品 | `/admin/items` |
| 注文 | `/admin/orders` |
| スタッフ | `/admin/users` |
| 設定 | `/admin/settings` |
| 提供場所 | `/admin/settings/locations` |
| 操作履歴 | `/admin/settings/history` |
| 詳細設定・データ管理 | `/admin/settings/advanced` |

`/admin` へのアクセスは `/admin/items` へ転送されます。

- 提供場所管理: 追加、停止、表示順、準備中注文数・商品数上限
- 商品管理: 提供場所割り当て、注文上限、追加、名前変更、表示順変更、販売停止、売り切れ設定、削除
- 注文一覧: 全注文の状態確認
- スタッフ管理: 注文受付担当・提供担当アカウントの追加、担当変更、パスワード変更、削除
- 設定: 受付時間、日次・注文単位上限、番号リセット、古い注文の削除

### 提供担当画面 (`/provider`)

- ログインアカウントの所属提供場所に必要な商品だけを表示
- 準備中から提供可能、提供可能から受渡済みへ変更
- WebSocketと定期再取得で注文をリアルタイム更新
- 受渡完了後2分間は画面から取り消し可能
- 接続状態と最終同期時刻を表示

### モニター画面 (`/monitor`)

- 「お待ち番号」と「お呼び出し中の番号」を2列で表示
- 各列の中を提供場所ごとにグループ化
- 準備中はグレー、呼び出し中は濃いグリーンで表示
- WebSocketでリアルタイム更新
- WebSocketが利用できない場合は15秒間隔の再取得へ自動フォールバック
- 新しく追加・移動した番号は控えめなフェードで表示
- 全画面表示に対応

### 利用客画面 (`/order/:token`)

- 受付番号を大きく表示
- 提供場所ごとの状態と注文内容を表示
- WebSocketでリアルタイム更新
- WebSocketが利用できない場合は15秒間隔で再取得
- スマートフォン表示に最適化

## 注文フロー

1. **注文受付担当**が商品と数量を選択し注文を確定
2. **システム**が注文全体で1つの受付番号を発行
3. **システム**が商品を提供場所ごとのタスクへ分割
4. **モニター画面**の「お待ち番号」に場所別で表示
5. **提供担当**が自分の場所の準備完了後に「提供可能」へ変更
6. **モニター画面**の該当番号が「お呼び出し中」へ移動
7. **利用客画面**にも提供場所別の状態が反映
8. **提供担当**が受け渡し後に「受渡済み」へ変更し、該当場所の表示だけが消える

## 受付番号について

- 日付ごとに採番される（例: 2026/04/01 の最初の注文 → 001）
- 桁数は `DISPLAY_NUMBER_DIGITS` で変更可能（デフォルト: 3桁）
- 内部ID（UUID）と表示番号は分離している
- 番号リセット後も過去注文との内部的な識別は衝突しない
- 採番はSQLiteのトランザクション内で行われ、同時アクセスでも重複しない

## API

### 認証が必要なエンドポイント

| Method | Path | 権限 | 説明 |
|--------|------|------|------|
| POST | `/api/staff/orders` | 受付担当・管理者 | 注文作成 |
| PATCH | `/api/staff/orders/:id/status` | 受付担当・管理者 | 注文キャンセル |
| GET | `/api/staff/orders` | 受付担当・管理者 | 現在の注文一覧 |
| GET | `/api/provider/fulfillments` | 提供担当 | 所属場所の提供タスク |
| PATCH | `/api/provider/fulfillments/:id/status` | 提供担当 | 所属場所の状態変更 |
| POST | `/api/admin/items` | 管理者 | 商品追加 |
| POST | `/api/admin/items/:id/rename` | 管理者 | 商品名変更 |
| POST | `/api/admin/items/:id/sort` | 管理者 | 表示順変更 |
| POST | `/api/admin/items/:id/toggle-active` | 管理者 | 販売停止/再開 |
| POST | `/api/admin/items/:id/toggle-soldout` | 管理者 | 売り切れ設定 |
| POST | `/api/admin/items/:id/delete` | 管理者 | 商品削除 |
| POST | `/api/admin/users` | 管理者 | スタッフ追加 |
| POST | `/api/admin/users/:id/settings` | 管理者 | 担当種別・所属提供場所変更 |
| POST | `/api/admin/users/:id/delete` | 管理者 | スタッフ削除 |
| POST | `/api/admin/locations` | 管理者 | 提供場所追加 |
| POST | `/api/admin/locations/:id/settings` | 管理者 | 提供場所・上限更新 |
| POST | `/api/admin/items/:id/settings` | 管理者 | 商品の提供場所・上限更新 |
| POST | `/api/admin/settings/orders` | 管理者 | 注文受付・上限設定 |
| POST | `/api/admin/reset-numbers` | 管理者 | 番号リセット |
| POST | `/api/admin/cleanup` | 管理者 | 古い注文削除 |
| GET | `/api/admin/cleanup/preview` | 管理者 | 削除対象件数・期間の確認 |
| POST | `/api/admin/backup` | 管理者 | DBスナップショット作成 |
| GET | `/api/staff/items` | 受付担当・管理者 | 最新の商品販売状態 |

### 認証不要のエンドポイント

| Method | Path | 説明 |
|--------|------|------|
| GET | `/login` | ログインページ |
| POST | `/login` | ログイン実行 |
| POST | `/logout` | ログアウト |
| GET | `/monitor` | モニターページ |
| GET | `/order/:token` | 利用客ページ |
| GET | `/api/order/:token` | 注文情報API |
| GET | `/health/live` | プロセスの稼働確認 |
| GET | `/health/ready` | DBを含む準備完了確認 |
| GET | `/api/monitor/board` | 提供場所別の待ち・呼び出し番号一覧 |

## WebSocket

| エンドポイント | 説明 | 受信メッセージ |
|---------------|------|--------------|
| `/ws/monitor` | モニター画面向け | `{ "type": "monitor_update", "locations": [...] }` |
| `/ws/provider` | 提供担当画面向け | `{ "type": "provider_update", "tasks": [...] }` |
| `/ws/order/:token` | 利用客画面向け | `{ "type": "order_update", "fulfillments": [...] }` |

接続時、その時点の最新状態が送信される。顧客・モニター・提供担当画面は切断状態を表示し、定期再取得も併用する。

## HTTPS / リバースプロキシ

### Caddy を使用する場合

```caddy
example.com {
    reverse_proxy localhost:3000
}
```

### nginx を使用する場合

```nginx
server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**重要**: WebSocketを使用するため、`Upgrade` と `Connection` ヘッダーの適切な転送が必要。

**重要**: リバースプロキシ使用時は環境変数 `BASE_URL` に公開用URL（例: `https://example.com`）を必ず設定してください。同一オリジン検証とWebSocket接続先の基準になります。

## プロセス管理（本番運用）

### systemd サービス例

```ini
[Unit]
Description=Festival Order System
After=network.target

[Service]
Type=simple
User=festival
WorkingDirectory=/path/to/app
ExecStart=/usr/local/bin/bun run src/index.ts
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=BASE_URL=https://example.com
Environment=ADMIN_PASSWORD=replace-with-a-long-random-password

[Install]
WantedBy=multi-user.target
```

### 手動での常時起動

```bash
# nohup
nohup bun run src/index.ts > app.log 2>&1 &

# または tmux/screen 内で実行
tmux new-session -s festival 'bun run src/index.ts'
```

## テスト

```bash
# 全テスト実行
bun test

# 型チェック・テスト・ビルドを一括実行
bun run check

# 特定のテストファイル
bun test tests/auth.test.ts
bun test tests/orders.test.ts
bun test tests/numbering.test.ts
bun test tests/views.test.ts
```

テストは `./data-test/` ディレクトリに一時的なデータベースを作成する。
GitHub Actionsでも同じチェックを実行する。

## 初期設定手順

1. サーバーを起動する
2. `http://サーバーアドレス:3000/login` にアクセスする
3. `ADMIN_USERNAME` / `ADMIN_PASSWORD` に設定した管理者アカウントでログインする
4. 管理画面でスタッフアカウントを作成する（必要な場合）
5. 管理画面で商品を編集する
6. 店員画面をタブレットで開き、店員に操作を説明する
7. モニター画面を大型モニターに全画面表示する
8. モニターのリロードやブラウザクラッシュに備え、ブックマークまたは起動スクリプトを準備する

## ディレクトリ構成

```
.
├── src/
│   ├── index.ts              # エントリーポイント、サーバー起動
│   ├── config.ts             # 設定・環境変数
│   ├── contracts/            # 画面・APIで共有する型
│   ├── client/               # ブラウザで実行するTypeScript
│   ├── db/
│   │   ├── database.ts       # SQLite接続・クエリ補助
│   │   └── migrations.ts     # スキーマ・データ移行
│   ├── middleware/
│   │   └── auth.ts           # 認証ミドルウェア
│   ├── services/
│   │   ├── numbering.ts      # 受付番号採番
│   │   └── websocket.ts      # WebSocket管理
│   ├── routes/
│   │   ├── auth.ts           # ログイン・ログアウト
│   │   ├── staff.ts          # 店員画面・注文API
│   │   ├── admin.ts          # 管理画面・管理API
│   │   ├── monitor.ts        # モニター画面
│   │   └── customer.ts       # 利用客画面・注文状態API
│   ├── styles/               # 画面別CSS
│   └── views/
│       ├── layout.tsx        # 型付き共通HTML文書
│       ├── components.tsx    # ログイン・エラーページ
│       └── *.tsx             # サーバー描画する各画面
├── tests/
│   ├── setup.ts              # テスト用DBセットアップ
│   ├── auth.test.ts          # 認証テスト
│   ├── orders.test.ts        # 注文テスト
│   ├── numbering.test.ts     # 採番テスト
│   └── views.test.ts         # 画面HTML/スクリプト構文テスト
├── data/                     # SQLiteデータ保存先
├── package.json
├── tsconfig.json
└── README.md
```

## 技術選定メモ

### なぜElysiaか
- Bun用に設計されたWebフレームワークで、パフォーマンスが高い
- TypeScriptの型推論に優れ、エンドポイントのリクエスト/レスポンスが型安全
- ビルトインのWebSocketサポートがあり、追加パッケージ不要
- 軽量で依存が少ない

### なぜSQLiteか
- 文化祭1店舗規模（数百〜数千オーダー）では十分な性能
- サーバープロセスだけで完結し、別途データベースサーバー不要
- バックアップがファイルコピー1つで完了
- bun:sqliteで高速動作、設定不要

### なぜWebSocketか
- モニター画面と利用客画面でリアルタイム更新が必要
- ポーリングより応答が早く、サーバー負荷も低い
- Bun/HTTPサーバーと同じポートで動作し、追加のインフラ不要

## ライセンス

MIT
