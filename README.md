# 文化祭 注文番号呼び出しシステム

文化祭の飲食企画向けの注文番号呼び出しWebアプリケーション。

店員が注文を登録すると受付番号が発行される。商品が提供可能になった際は、モニター画面に番号が表示され、利用客向けの注文状況ページにも状態が反映される。

## 技術スタック

| 項目 | 採用技術 | 選定理由 |
|------|---------|---------|
| ランタイム | [Bun](https://bun.sh) v1.3+ | 高速、TypeScriptネイティブ、WebSocket内蔵 |
| Webフレームワーク | [Elysia](https://elysiajs.com) v1.4 | Bun最適化、軽量、型安全、WebSocket対応 |
| データベース | SQLite (bun:sqlite) | サーバー再起動後もデータ保持、外部依存不要、バックアップがファイルコピーだけで完了 |
| リアルタイム通信 | WebSocket (Bun内蔵) | 双方向通信、サーバーpushが可能、ポーリング不要 |
| QRコード | qrcode | 純JS実装、軽量、サーバーサイドでPNG生成 |
| 認証 | Cookieベースセッション + Bun.password (argon2id) | シンプル、外部サービス不要、パスワードはハッシュ化保存 |
| テスト | bun:test | Bun組み込み、高速、設定不要 |
| パッケージ管理 | Bun | bun.lockで確定、高速 |

## 必要環境

- [Bun](https://bun.sh) v1.3.0 以上

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

## アクセス先

| 画面 | URL | 認証 |
|------|-----|------|
| ログイン | `http://localhost:3000/login` | なし |
| 店員画面 | `http://localhost:3000/staff` | 店員・管理者 |
| 管理画面 | `http://localhost:3000/admin` | 管理者のみ |
| モニター画面 | `http://localhost:3000/monitor` | なし |
| 利用客画面 | `http://localhost:3000/order/:token` | なし（トークン認証） |

## 初期アカウント

### 管理者

| 項目 | 値 |
|------|-----|
| ユーザー名 | `admin` |
| パスワード | `admin123` |

**初回起動時に自動作成されます。本番環境では必ずパスワードを変更してください。**

**注意**: パスワードは初回起動時に `ADMIN_PASSWORD` 環境変数の値がDBにハッシュ化されて保存されます。**既にadminが作成された後に環境変数を変更してもDBのパスワードは変わりません。** 変更するにはサーバー停止後に以下のコマンドを実行してください。

```bash
bun -e "
const db = require('bun:sqlite').open('./data/orders.db');
const hash = await Bun.password.hash('新しいパスワード');
db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, 'admin');
console.log('Password updated');
db.close();
"
```

### スタッフ（店員）アカウント

管理画面の「ユーザー管理」から追加できます。初期状態ではスタッフアカウントは存在しません。

## 環境変数

| 変数名 | デフォルト値 | 説明 |
|--------|------------|------|
| `PORT` | `3000` | サーバーのポート番号 |
| `HOST` | `0.0.0.0` | サーバーのバインドアドレス |
| `DATA_DIR` | `./data` | SQLiteデータベースの保存先ディレクトリ |
| `BASE_URL` | `http://localhost:3000` | QRコードに埋め込むURLのベース。リバースプロキシ使用時は必ず公開URL（例: `https://example.com`）に設定すること |
| `SESSION_SECRET` | `festival-secret-...` | セッション管理用の秘密鍵 |
| `ADMIN_USERNAME` | `admin` | 初期管理者ユーザー名 |
| `ADMIN_PASSWORD` | `admin123` | 初期管理者パスワード（初回起動時にのみ反映。既存DBのパスワード変更は上記のSQLite直接更新が必要） |
| `DISPLAY_NUMBER_DIGITS` | `3` | 受付番号の桁数（例: 3→001） |
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

### 復元

```bash
cp ./backup/orders_20260401.db ./data/orders.db
bun run src/index.ts
```

## 画面構成

### 店員画面 (`/staff`)

- **左パネル**: 商品一覧（グリッド表示）、カート
- **右パネル**: 現在の注文一覧
- 商品をタップして数量を調整、注文を確定
- 注文確定後は受付番号のみを表示
- 注文の状態変更（提供可能、受渡完了、キャンセル）
- 注文リストは5秒間隔で自動更新

### 管理画面 (`/admin`)

- 商品管理: 追加、名前変更、表示順変更、販売停止、売り切れ設定、削除
- 注文一覧: 全注文の状態確認
- ユーザー管理: スタッフアカウントの追加・削除
- 設定: 番号リセット、古い注文の削除

### モニター画面 (`/monitor`)

- 提供可能な受付番号を大きな文字で表示
- WebSocketでリアルタイム更新
- 新しく追加された番号はアニメーションで強調表示
- 全画面表示に対応

### 利用客画面 (`/order/:token`)

- 受付番号を大きく表示
- 現在の状態を表示（準備中 / お召し上がりいただけます / お渡し済み / キャンセル）
- 注文内容一覧
- WebSocketでリアルタイム更新
- スマートフォン表示に最適化

## 注文フロー

1. **店員**が商品と数量を選択し注文を確定
2. **システム**が受付番号を発行
3. **注文**は「準備中」状態になる
4. **店員**が商品の準備完了後に「提供可能」に変更
5. **モニター画面**に受付番号が自動表示される
6. **利用客**のスマートフォン画面にも状態が反映される
7. **店員**が商品受け渡し後に「受渡完了」に変更
8. **モニター画面**から番号が消える

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
| POST | `/api/staff/orders` | 店員・管理者 | 注文作成 |
| PATCH | `/api/staff/orders/:id/status` | 店員・管理者 | 注文状態変更 |
| GET | `/api/staff/orders` | 店員・管理者 | 現在の注文一覧 |
| POST | `/api/admin/items` | 管理者 | 商品追加 |
| POST | `/api/admin/items/:id/rename` | 管理者 | 商品名変更 |
| POST | `/api/admin/items/:id/sort` | 管理者 | 表示順変更 |
| POST | `/api/admin/items/:id/toggle-active` | 管理者 | 販売停止/再開 |
| POST | `/api/admin/items/:id/toggle-soldout` | 管理者 | 売り切れ設定 |
| POST | `/api/admin/items/:id/delete` | 管理者 | 商品削除 |
| POST | `/api/admin/users` | 管理者 | スタッフ追加 |
| POST | `/api/admin/users/:id/delete` | 管理者 | スタッフ削除 |
| POST | `/api/admin/reset-numbers` | 管理者 | 番号リセット |
| POST | `/api/admin/cleanup` | 管理者 | 古い注文削除 |

### 認証不要のエンドポイント

| Method | Path | 説明 |
|--------|------|------|
| GET | `/login` | ログインページ |
| POST | `/login` | ログイン実行 |
| POST | `/logout` | ログアウト |
| GET | `/monitor` | モニターページ |
| GET | `/order/:token` | 利用客ページ |
| GET | `/api/order/:token` | 注文情報API |
| GET | `/api/qr/:token` | QRコード画像 |
| GET | `/api/monitor/numbers` | 提供可能番号一覧 |

## WebSocket

| エンドポイント | 説明 | 受信メッセージ |
|---------------|------|--------------|
| `/ws/monitor` | モニター画面向け | `{ "type": "monitor_update", "numbers": [...] }` |
| `/ws/order/:token` | 利用客画面向け | `{ "type": "order_update", "status": "..." }` |

接続時、その時点の最新状態が送信される。

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

**重要**: リバースプロキシ使用時は環境変数 `BASE_URL` に公開用URL（例: `https://example.com`）を必ず設定してください。未設定の場合、QRコードに `http://localhost:3000/...` が埋め込まれ、お客様がURLにアクセスできなくなります。

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
Environment=SESSION_SECRET=your-secure-secret-here
Environment=ADMIN_PASSWORD=your-admin-password

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

# 特定のテストファイル
bun test tests/auth.test.ts
bun test tests/orders.test.ts
bun test tests/numbering.test.ts
bun test tests/views.test.ts
```

テストは `./data-test/` ディレクトリに一時的なデータベースを作成する。

## 初期設定手順

1. サーバーを起動する
2. `http://サーバーアドレス:3000/login` にアクセスする
3. 管理者アカウント（admin / admin123）でログインする
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
│   ├── db/
│   │   └── database.ts       # SQLite接続・スキーマ定義
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
│   │   └── customer.ts       # 利用客画面・QRコード
│   └── views/
│       ├── components.ts     # 共通HTML部品（レイアウト、ログインページ）
│       ├── staff.ts          # 店員画面HTML
│       ├── admin.ts          # 管理画面HTML
│       ├── monitor.ts        # モニター画面HTML
│       └── customer.ts       # 利用客画面HTML
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
