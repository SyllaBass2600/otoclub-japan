# Discord 通知の設定ガイド

アプリに登録された公開イベントを、Cloud Functions が Discord のチャンネルに通知します。
以前の「Google カレンダー → GAS → Discord」の通知を置き換えるもので、送るタイミングと対象は GAS と同じです。

送り方は2種類あり、`functions/.env.<エイリアス>` の `DISCORD_FORMAT` で選びます（既定は `embed`）。

| `DISCORD_FORMAT` | 見た目 |
|---|---|
| `embed`（既定） | 見出しと `@everyone` の下に、イベントごとのカード。フライヤー画像・公式サイトへのリンク（タイトルもリンクになる）・X のリンク・場所を出す |
| `text` | GAS と同じ、文字だけのメッセージ |

## 通知の内容

| 関数 | いつ | 対象 | 見出し |
|------|------|------|--------|
| `sendDailyDiscordReminder` | 毎日 10:00（日本時間） | 当日 10:00〜翌日 10:00 に始まるイベント | `↓↓↓本日の音クラはこちら↓↓↓` |
| `sendWeeklyDiscordReminder` | 毎週月曜 10:00 | 月曜 10:00〜翌週月曜 10:00 に始まるイベント（日付ごとに `■M月d日`） | `↓↓↓今週の音クラはこちら↓↓↓` |

カード（`embed`）の中身:

- **タイトル**: `【都道府県】イベント名`。公式サイトがあれば、タイトルを押すと公式サイトが開く
- **説明**: 日時（太字。週次は `■M月d日 HH:mm~`）、📍場所、イベントの説明、`[公式サイト]` `[Xはこちらから]` のリンク
- **画像**: フライヤー（なければその他画像の1枚目）。アプリで登録した画像は Firebase Storage の公開 URL なので、Discord で表示される
- 1通にカードは10枚まで。超える分は続けて送る（`@everyone` と見出しは1通目だけ）

文字だけ（`text`）の文面の例（日次）:

```
@everyone
↓↓↓本日の音クラはこちら↓↓↓
【東京都】音ゲーナイト vol.12
19:00~
DJ: Aさん / Bさん
https://example.com/night12

【大阪府】深夜オールナイト
01:00~
朝まで
```

- **タイトル**: 公式カレンダーの件名と同じ `【都道府県】イベント名`（都道府県がなければ開催場所）
- **詳細**: イベントの説明。公式サイト・X の URL があれば続けて出す。何もなければ「詳細なし」
- **送らないもの**: 対象が0件のときは送らない。非公開のイベントは載せない
- **長い場合**: Discord の上限（文字だけは1通2000文字、カードは1通10枚・合計6000文字）を超えると、イベントの区切りで複数のメッセージに分ける（`@everyone` は1通目だけ）
- **二重送信の防止**: 送った記録を Firestore の `discordNotifications/{daily|weekly}-{日付}` に残し、同じ日の同じ通知は1回だけ送る。
  送信に失敗した場合は `status: failed` と `error` が残る。途中まで送れている可能性があるので、自動では送り直さない
- 文面と期間の処理は `functions/src/discordNotify.ts`（テスト: `functions/test/discordNotify.test.js`）

### GAS との違い

| | GAS | アプリ |
|---|---|---|
| 予定の読み込み元 | 公式 Google カレンダー | アプリの Firestore（Google カレンダーを通さない） |
| 終日の予定 | 常に載せる | アプリには終日のイベントがないため、なし |
| 2000文字を超えたとき | 送信に失敗する | 複数のメッセージに分ける |
| 画像・リンク | 詳細欄のリンクを文字で出す | カードにフライヤー画像・リンクを付けられる（`embed`） |
| 同じ通知の二重送信 | 防止なし | 1日1回に限る |

## 設定手順

### 1. Discord の Webhook を用意する

1. Discord のチャンネルの「チャンネルの編集」→「連携サービス」→「ウェブフック」で、新しいウェブフックを作り、URL をコピーする
2. **以前の GAS に書いていた URL は使い回さず、新しく作ることをおすすめします**（URL を知っていれば誰でも投稿できるため。古いウェブフックは削除する）

### 2. Webhook の URL を Secret Manager に保存する

URL はリポジトリにもアプリにも書きません。Functions だけが読める秘密情報として保存します。

```powershell
firebase functions:secrets:set DISCORD_WEBHOOK_URL --project prod
# 表示される入力欄に URL を貼り付ける
```

- STG で試すときは、テスト用のチャンネルのウェブフックを STG のプロジェクトに設定する（本番のチャンネルに送らないように）
- 値を変えたら、Functions をデプロイし直すと反映される

### 3. デプロイ

```powershell
firebase deploy --only functions --project prod
```

- 定期実行には Cloud Scheduler を使う（Blaze プランが必要。2件なので無料枠に収まる）
- 初回のデプロイで Cloud Scheduler・Secret Manager の API を有効にするか聞かれたら、有効にする

### 4. GAS を止める（切り替え）

アプリからの通知を始めたら、**GAS のトリガーを削除してください**。残すと同じ通知が2回届きます。

1. GAS のエディタ →「トリガー」→ `sendDailyReminder` と `sendWeeklyReminder` のトリガーを削除
2. 古いウェブフックを Discord で削除する

切り替えの日は、10:00 をまたがないようにします（例: 10:30 以降に Functions をデプロイし、同じ日のうちに GAS のトリガーを消す）。

## ローカルで確かめる（エミュレーター）

エミュレーターでは定期実行は動きません（Pub/Sub エミュレーターを起動していないため）。
代わりに、エミュレーター専用の2つの URL を使います（どちらも本番では 404 を返します）。

| URL | 内容 |
|---|---|
| `.../previewDiscordReminder?kind=…&now=…&format=…` | 送らずに、送る内容（JSON）を返す |
| `.../runDiscordReminder?kind=…&now=…&format=…` | 定期実行と同じ処理で、**実際に Discord へ送る**（二重送信の防止も同じ） |

```
http://127.0.0.1:5101/demo-otoclub/asia-northeast1/previewDiscordReminder?kind=weekly&now=2026-11-16T10:00:00%2B09:00
http://127.0.0.1:5101/demo-otoclub/asia-northeast1/runDiscordReminder?kind=daily&now=2026-11-16T10:00:00%2B09:00&format=embed
```

- `kind`: `daily`（日次）または `weekly`（週次）
- `now`: 実行した日時のつもりの時刻（省略すると今）
- `format`: `embed` または `text`（省略すると `DISCORD_FORMAT`）
- `runDiscordReminder` の送り先は `functions/.secret.local`（Git 管理外）の `DISCORD_WEBHOOK_URL`。**テスト用のチャンネルのウェブフック**にする:

  ```
  DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...（テスト用）
  ```

  ファイルを作ったり変えたりしたら、エミュレーターを起動し直す
- 同じ日・同じ種類をもう一度送るときは、エミュレーター UI の Firestore で `discordNotifications` の該当ドキュメントを消す
- Discord はローカルの画像（`localhost` の Storage）を読み込めないため、エミュレーターで登録した画像はカードに表示されない

## トラブルシューティング

| 症状 | 確認すること |
|------|-------------|
| 通知が来ない | Functions のログに `Discord notification disabled`（Secret が空）や `No events to notify`（0件）が出ていないか |
| `Already notified; skipped` | その日の通知は送信済み。送り直すときは `discordNotifications` の該当ドキュメントを消してから、Cloud Scheduler のジョブを「今すぐ実行」 |
| `status: failed` / `Discord webhook failed: 404` | ウェブフックが削除されていないか。Secret の URL が正しいか |
| 同じ通知が2回来る | GAS のトリガーが残っていないか |
