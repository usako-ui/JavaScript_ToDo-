# スプレッドシート連携ToDoアプリ セットアップガイド

## 概要
このToDoアプリは、Googleスプレッドシートをデータベースとして使用します。
フロントエンドはViteで動作し、バックエンドはExpressサーバーでGoogle Sheets APIと連携します。

## 必要な環境
- Node.js (v16以上推奨)
- Googleアカウント
- Google Cloud Platform プロジェクト

## セットアップ手順

### 1. 依存関係のインストール
```bash
npm install
```

### 2. Google Cloud Platform での設定

#### 2.1 プロジェクトの作成
1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 新しいプロジェクトを作成（または既存のプロジェクトを選択）

#### 2.2 Google Sheets APIの有効化
1. 「APIとサービス」→「ライブラリ」に移動
2. 「Google Sheets API」を検索して有効化

#### 2.3 認証情報の作成（サービスアカウント推奨）
1. 「APIとサービス」→「認証情報」に移動
2. 「認証情報を作成」→「サービスアカウント」を選択
3. サービスアカウント名を入力して作成
4. 作成したサービスアカウントをクリック
5. 「キー」タブ→「キーを追加」→「JSON」を選択
6. ダウンロードしたJSONファイルを保存（後で使用します）

### 3. スプレッドシートの準備

1. [Googleスプレッドシート](https://docs.google.com/spreadsheets/)で新しいスプレッドシートを作成
2. スプレッドシートのURLからIDを取得
   - URL例: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`
   - `{SPREADSHEET_ID}`の部分をコピー
3. 作成したサービスアカウントのメールアドレスをスプレッドシートに共有
   - スプレッドシートの「共有」ボタンをクリック
   - サービスアカウントのメールアドレスを入力（編集権限を付与）

### 4. 環境変数の設定

プロジェクトルートに`.env`ファイルを作成し、以下の内容を設定：

```env
# スプレッドシートID（必須）
SPREADSHEET_ID=your_spreadsheet_id_here

# サーバーポート（オプション、デフォルト: 3000）
PORT=3000

# サービスアカウントキー（JSON形式を1行に変換）
# 方法1: JSONファイルの内容を1行に変換して設定
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}

# または、方法2: JSONファイルのパスを指定（server.jsを修正する必要があります）
```

**重要**: `GOOGLE_SERVICE_ACCOUNT_KEY`は、ダウンロードしたJSONファイルの内容を1行に変換して設定してください。
改行を削除し、すべてを1行にまとめます。

### 5. アプリケーションの起動

#### バックエンドサーバーの起動
```bash
npm run server
```
または
```bash
npm start
```

サーバーが起動すると、`http://localhost:3000`でAPIが利用可能になります。

#### フロントエンドの起動（別のターミナル）
```bash
npm run dev
```

フロントエンドは`http://localhost:5173`（Viteのデフォルトポート）で起動します。

### 6. 動作確認

1. ブラウザで`http://localhost:5173`にアクセス
2. タスクを追加してみる
3. スプレッドシートを確認して、データが正しく保存されているか確認

## トラブルシューティング

### エラー: "Google認証情報が設定されていません"
- `.env`ファイルが正しく作成されているか確認
- `GOOGLE_SERVICE_ACCOUNT_KEY`が正しく設定されているか確認

### エラー: "スプレッドシートが見つかりません"
- `SPREADSHEET_ID`が正しいか確認
- サービスアカウントにスプレッドシートへのアクセス権限があるか確認

### エラー: "APIリクエストエラー"
- バックエンドサーバーが起動しているか確認
- フロントエンドの`VITE_API_URL`環境変数が正しく設定されているか確認（デフォルトは`http://localhost:3000`）

## 環境変数の例

`.env`ファイルの例：

```env
SPREADSHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
PORT=3000
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"my-project","private_key_id":"abc123","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"my-service@my-project.iam.gserviceaccount.com","client_id":"123456789","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/my-service%40my-project.iam.gserviceaccount.com"}
```

## 注意事項

- `.env`ファイルはGitにコミットしないでください（`.gitignore`に追加推奨）
- サービスアカウントのキーは機密情報です。絶対に公開しないでください
- 本番環境では、環境変数の管理に適切なサービス（AWS Secrets Manager、Azure Key Vaultなど）を使用することを推奨します

