# カレンダー連携設定ガイド

Google カレンダーとの連携の仕組みと設定手順です（セカファンと同じ仕組み）。

## 連携の仕組み

公式カレンダーへの書き込みは **Cloud Functions だけ** が行います。
アプリの「個人カレンダーに追加」は、利用者自身の Google カレンダーの予定作成画面を開くだけで、公式カレンダーには書き込みません。

| 機能 | どこで動くか | 認証 | タイミング |
|------|-------------|------|-----------|
| 公式カレンダーへの同期（`functions/src/index.ts`） | サーバー | サービスアカウント | `events` ドキュメントの作成・更新・削除 |
| 個人カレンダーに追加（`lib/services/calendar_service.dart`） | 端末・ブラウザ | 不要（開いた先の Google アカウント） | イベント詳細の「個人カレンダーに追加」ボタン |

### 公式カレンダーへの同期（Cloud Functions）

| 関数 | トリガー | 内容 |
|------|---------|------|
| `syncEventToCalendar` | `events/{eventId}` 作成 | 公開イベントなら予定を作り、`googleCalendarEventId` を書き戻す |
| `updateCalendarEvent` | `events/{eventId}` 更新 | 内容の変更を反映。非公開→公開で予定を作り、公開→非公開で予定を削除する |
| `deleteCalendarEvent` | `events/{eventId}` 削除 | 予定を削除 |
| `healthCheck` | HTTP | 動作確認用（`calendarSyncEnabled` で同期が有効か分かる） |

- 3つのトリガーは同じ判定（`functions/src/calendarSync.ts` の `planCalendarSync`）を通ります
- **公開状態**: `isPublished` が `false` のイベント（登録した本人にだけ見える）は公式カレンダーに載せません
- **日時**: 日本時間の日付・時刻を `2026-12-22T10:00:00+09:00` のようなオフセット付きで送ります。終了が開始より前なら翌日の終了として扱います（例: 22:00〜02:00）
- **件名と場所**: 件名は `【都道府県】イベント名`（都道府県がなければ開催場所）、場所は「都道府県 開催場所」
- **重複防止**: 予定IDはイベントIDから決まる値（`otoclub` + イベントIDの16進数）を使います。同じイベントを再処理しても、予定は1件のままです
- **予定IDの書き込み**: `googleCalendarEventId` / `syncStatus` / `syncedAt` / `syncError` / `syncErrorAt` は Functions だけが書き込みます。アプリからは書けません（`firestore.rules`）
- リージョン: `asia-northeast1`（東京）
- ランタイム: Node.js 22
- テスト: `cd functions && npm test`

### 個人カレンダーに追加（アプリ）

- イベント詳細画面のボタンから使います。ログインしていなくても使えます
- Google カレンダーの予定作成画面（`calendar.google.com/calendar/render?action=TEMPLATE...`）を開きます。利用者がその画面で保存すると、自分のカレンダーに追加されます
- Web では新しいタブで開きます。Web 以外（Android など）やポップアップがブロックされた場合は、リンクをコピーできるダイアログを出します

### カレンダー ID

公式カレンダーの ID は、プロジェクトごとに `functions/.env.<エイリアス>`（`.env.stg` / `.env.prod`。Git 管理外）の `CALENDAR_ID` に書きます。
`functions/.env.example` をコピーして作ります。デプロイ時に Firebase CLI が読み込みます。

- STG と本番で**別のカレンダー**を使います
- `CALENDAR_ID` を空にすると同期しません（エミュレーター用の `functions/.env.demo-otoclub` は空）
- ファイルがないと、デプロイ時に値の入力を求められます（非対話モードでは失敗します）

## 設定手順

### 1. Firebase プロジェクトを Blaze プランにする

Cloud Functions から Google Calendar API を呼ぶため、従量課金（Blaze）プランが必要です。

### 2. Google Calendar API を有効化

1. [Google Cloud Console](https://console.cloud.google.com/) で Firebase プロジェクトを開く
2. 「APIとサービス」→「ライブラリ」→ "Google Calendar API" を有効にする

### 3. 公式カレンダーを作り、Functions のサービスアカウントに共有する

Functions は鍵ファイルを使わず、**実行用のサービスアカウント**で Calendar API を呼びます。

1. Google カレンダーで公式カレンダーを新しく作る（「他のカレンダー」→「新しいカレンダーを作成」）
2. 実行用のサービスアカウントは、第1世代の既定では `<プロジェクトID>@appspot.gserviceaccount.com`（Cloud Console の「Cloud Run functions」→ 関数の詳細 →「詳細」で確認できる）
3. 公式カレンダーの「設定と共有」→「特定のユーザーまたはグループと共有する」に、このメールアドレスを追加し、**予定の変更権限**を付ける
4. 「カレンダーの統合」にある **カレンダー ID** を `functions/.env.<エイリアス>` の `CALENDAR_ID` に書く
5. 誰でも見られるようにしたい場合は「アクセス権限」→「一般公開して誰でも利用できるようにする」をオンにする

#### タイムゾーンを確認する

公式カレンダーの「カレンダーの設定」→「タイムゾーン」を **(GMT+09:00) 日本標準時** にしてください。
カレンダーが UTC のままだと、19:00 の予定が 10:00 と表示されます。

### 4. デプロイ

```powershell
firebase deploy --only functions --project stg
```

- デプロイ前に `functions` で `npm run lint` と `npm run build` が実行されます（`firebase.json` の `predeploy`）
- 中身を確認だけしたいときは `--dry-run` を付けます

## 動作確認

1. ログインして、日本時間 10:00〜11:00 の公開イベントを登録する
2. 公式カレンダーに **同じ日付の 10:00〜11:00** の予定が **1件だけ** でき、Firestore のイベントに `googleCalendarEventId` が入ることを確認
3. イベントを編集し、カレンダー側にも反映されることを確認
4. 非公開に切り替えると公式カレンダーから消え、公開に戻すと再び登録されることを確認
5. 非公開で新規作成したイベントは、公式カレンダーに登録されないことを確認
6. 別のアカウント（またはログアウト状態）で「個人カレンダーに追加」を押し、自分の Google カレンダーの予定作成画面が開くことを確認
7. イベントを削除し、公式カレンダーからも消えることを確認

## トラブルシューティング

| 症状 | 確認すること |
|------|-------------|
| `Calendar access denied` / `Not Found` | 実行用のサービスアカウントに、公式カレンダーを予定の変更権限で共有しているか |
| 予定が9時間ずれている | 公式カレンダーのタイムゾーンが日本標準時か |
| イベントの `syncStatus` が `failed` | `syncError` の内容と Functions のログを確認する |
| `Quota exceeded` | Cloud Console で API の使用量を確認 |
| Functions のデプロイで止まる | `cd functions && npm run lint && npm run build` が通るか |

## セキュリティ注意事項

- Functions は鍵ファイルを使わないので、サービスアカウントキーを作成・配布しない
- 公式カレンダーの共有は、実行用のサービスアカウントだけに「予定の変更権限」で行う
