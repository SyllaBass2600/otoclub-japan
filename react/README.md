# 日本音クラ情報局（React 版）

Flutter 版（`../lib`）を React + TypeScript + Vite に書き換えたものです。
画面・機能・見た目は Flutter 版と同じで、**Firebase 側（Firestore のデータ構造・ルール・インデックス・Storage・Cloud Functions）はそのまま使います**。
React 版に切り替えても、登録済みのイベントや Discord 通知・公式カレンダー同期はそのまま動きます。

## Flutter 版との対応

| Flutter | React |
|---|---|
| `lib/screens/events/calendar_screen.dart` | `src/pages/CalendarPage.tsx` |
| `lib/screens/events/event_detail_screen.dart` / `event_detail_sections.dart` | `src/pages/EventDetailPage.tsx` |
| `lib/widgets/event_form_dialog.dart` / `image_picker_widget.dart` | `src/components/EventFormDialog.tsx` |
| `lib/widgets/event_image_pager.dart` / `zoomable_image_viewer.dart` | `src/components/ImagePager.tsx` |
| `lib/models/event_data.dart` / `event_status.dart` | `src/models/event.ts` |
| `lib/repositories/event_repository.dart` | `src/repositories/eventRepository.ts` |
| `lib/services/auth_service.dart` | `src/services/auth.ts` / `src/hooks/useAuth.tsx` |
| `lib/services/image_storage_service.dart` | `src/services/imageStorage.ts` / `src/lib/imageCompress.ts` |
| `lib/services/calendar_service.dart` | `src/lib/calendarUrl.ts` |
| `lib/config/admin.dart` / `env.dart` | `src/config/admin.ts` / `env.ts` |
| `lib/theme/app_theme.dart` | `src/styles.css` |

変わったところ:

- イベント詳細に URL ができました（`/events/<ID>`）。リンクを共有すると直接開けます（`firebase.json` の rewrites がそのまま使えます）
- 画像の圧縮は Isolate ではなくブラウザの canvas で行います（最大幅・最大サイズ・品質の下げ方は同じ）
- 日付・時刻の入力はブラウザ標準の入力欄です

## 必要なもの

Node.js 20 以上（Functions と同じ 22 がおすすめ）

## 接続先の設定

Flutter 版と同じ **`../env/<環境>.json`** をそのまま読みます（`vite.config.ts`）。新しく作るファイルはありません。

| コマンド | 読むファイル |
|---|---|
| `npm run dev` | `env/dev.json`（エミュレーター） |
| `npm run build:stg` | `env/stg.json` |
| `npm run build` | `env/prod.json` |

## ローカルで動かす（エミュレーター）

```powershell
# 1. エミュレーターを起動（プロジェクトのルートで。Functions のビルドは README.md のとおり）
firebase emulators:start --project demo-otoclub

# 2. 別のターミナルで React 版を起動（http://localhost:5173）
cd react
npm install
npm run dev
```

## テスト

```powershell
cd react
npm run typecheck
npm test
```

## デプロイ（Flutter 版から切り替える）

1. ルートの `firebase.json` の `hosting.public` を `"build/web"` から **`"react/dist"`** に変える
2. ビルドしてデプロイ

```powershell
cd react
npm run build
cd ..
firebase deploy --project prod --only hosting
```

Firestore のルール・インデックス・Storage・Functions は変えていないので、`--only hosting` だけで切り替わります。
元に戻すときは `hosting.public` を `"build/web"` に戻して `flutter build web` → デプロイします。
