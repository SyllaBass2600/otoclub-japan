# 日本音クラ情報局

イベントをカレンダーに登録・共有するアプリです（Flutter / Firebase）。
カレンダー機能はセカファン（stamp_rally_sekafan）のものをもとにしています。

## できること

- **カレンダー**: 月ごとのカレンダーで、イベントのある日に印が付く。日付を選ぶとその日のイベントが並ぶ
- **イベントの登録**: Google アカウントでログインした人が、自分のイベントを登録・編集・削除できる（団体はなく、個人で登録する）
  - 項目: イベント名・日付・開始／終了時刻・都道府県・開催場所・説明・公式サイト・X・フライヤー画像・その他画像（3枚まで）・公開／非公開
  - 非公開のイベントは登録した本人にだけ見える
  - 管理者（`lib/config/admin.dart` のメールアドレス1つ）は、すべてのイベントを見て・編集・削除できる
- **イベント詳細**: 画像のスワイプ表示、Google マップで開く・経路、「個人カレンダーに追加」（自分の Google カレンダーの予定作成画面を開く）
- **Discord への通知**: 毎日 10:00 に「本日の音クラ」、毎週月曜 10:00 に「今週の音クラ」を Cloud Functions が Discord に送る（以前の GAS の置き換え。[docs/DISCORD_SETUP.md](docs/DISCORD_SETUP.md)）
- **公式 Google カレンダーへの自動同期**: 公開イベントを Cloud Functions が公式カレンダーに登録・更新・削除する（[docs/CALENDAR_SETUP.md](docs/CALENDAR_SETUP.md)）
- 公開中のイベントは、ログインしていなくても見られる

## 構成

| 場所 | 内容 |
|------|------|
| `lib/screens/events/calendar_screen.dart` | カレンダー画面（トップ） |
| `lib/screens/events/event_detail_screen.dart` | イベント詳細 |
| `lib/widgets/event_form_dialog.dart` | イベントの登録・編集フォーム |
| `lib/repositories/event_repository.dart` | Firestore の `events` の読み書き |
| `lib/services/calendar_service.dart` | 「個人カレンダーに追加」の URL |
| `functions/src/calendarSync.ts` | 公式カレンダー同期の判定（テストあり） |
| `functions/src/discordNotify.ts` | Discord 通知の文面と対象期間（テストあり） |
| `firestore.rules` / `storage.rules` | 権限（登録はログインした人、編集・削除は登録した本人と管理者だけ、同期結果は Functions だけ） |

## ローカルで動かす（エミュレーター）

Firebase のプロジェクトがなくても、エミュレーター（プロジェクト `demo-otoclub`）で動きます。
必要なもの: Flutter、Node.js、Java（エミュレーター用）、Firebase CLI（`npm i -g firebase-tools`）

```powershell
# 1. Functions をビルド（初回のみ npm ci）
cd functions; npm ci; npm run build; cd ..

# 2. エミュレーターを起動（UI: http://localhost:4100）
firebase emulators:start --project demo-otoclub

# 3. 別のターミナルでアプリを起動
flutter run -d chrome --dart-define-from-file=env/dev.json
```

- エミュレーターのポートは他のプロジェクトと重ならないよう、既定から変えています（Auth 9100 / Firestore 8180 / Storage 9200 / Functions 5101 / UI 4100）
- ログインを押すと、エミュレーターのログイン画面が開きます。「Add new account」でテスト用のアカウントを作れます
- エミュレーターでは `CALENDAR_ID` が空なので、公式カレンダーには同期しません（ログに `Calendar sync disabled` と出ます）
- Discord には送りません。通知の文面は `previewDiscordReminder` で確かめられます（[docs/DISCORD_SETUP.md](docs/DISCORD_SETUP.md)）

## テスト

```powershell
flutter analyze
flutter test
cd functions; npm run lint; npm test
```

## Firebase プロジェクトを作ったら（未設定）

1. Firebase コンソールでプロジェクトを作り、Authentication で **Google** ログインを有効にする
2. Firestore と Storage を作る（ロケーションは `asia-northeast1`）
3. ウェブアプリを追加し、表示された設定値で `env/example.json` をコピーして `env/stg.json`（本番は `env/prod.json`）を作る
4. `.firebaserc` にプロジェクトのエイリアス（`stg` / `prod`）を書く
5. 公式カレンダーの設定（[docs/CALENDAR_SETUP.md](docs/CALENDAR_SETUP.md)）
6. Discord の Webhook を Secret に保存（[docs/DISCORD_SETUP.md](docs/DISCORD_SETUP.md)）
7. デプロイ（Discord 通知を始めたら、GAS のトリガーを止める）

```powershell
flutter build web --dart-define-from-file=env/stg.json
firebase deploy --project stg --only hosting,firestore:rules,firestore:indexes,storage,functions
```

## ブランチ運用

| ブランチ | 用途 |
|---|---|
| `main` | 本番（otoclub-japan.web.app）に出ているコード。直接コミットしない |
| `develop` | 開発の統合先。次のリリースに入れる変更をここに集める |
| `feature/<内容>` | 個別の開発。`develop` から作り、終わったら `develop` へプルリクエスト |

リリースするときは `develop` → `main` へプルリクエストを出してマージし、`main` からデプロイする。
