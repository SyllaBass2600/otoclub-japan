import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { google } from 'googleapis';
import {
  EventDoc,
  buildCalendarEventBody,
  httpStatusOf,
  planCalendarSync,
  syncLatest,
} from './calendarSync';
import {
  REMINDERS,
  ReminderKind,
  DiscordFormat,
  DiscordPayload,
  buildReminderPayloads,
  collectReminderEvents,
  dateQueryRange,
  reminderWindow,
} from './discordNotify';

// Firebase Admin初期化
admin.initializeApp();

// 公式カレンダーのID
//
// 公式カレンダーへの登録・更新・削除は、この Cloud Functions だけが行う。
// アプリからは公式カレンダーに書き込まない（アプリの「個人カレンダーに追加」は利用者自身のカレンダーに追加する）。
// 値はプロジェクトごとに functions/.env.<エイリアス> に書く（functions/.env.example）。
// 空にすると同期しない（エミュレーターで実在のカレンダーに書き込まないため）。
const CALENDAR_ID = defineString('CALENDAR_ID', {
  description: '公式 Google カレンダーの ID（空なら同期しない）',
});

/** 公式カレンダーの ID（未設定なら空文字） */
function calendarId(): string {
  return CALENDAR_ID.value().trim();
}

/**
 * Google Calendar APIクライアントを初期化
 *
 * Cloud Functions の実行用サービスアカウント（第1世代の既定は <プロジェクトID>@appspot.gserviceaccount.com）で
 * 認証する。鍵ファイルは使わない。公式カレンダーを、このサービスアカウントに「予定の変更」権限で共有しておくこと。
 * ローカルで動かすときは GOOGLE_APPLICATION_CREDENTIALS の認証情報が使われる。
 * @return {Calendar} Google Calendar APIクライアント
 */
function getCalendarClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return google.calendar({ version: 'v3', auth });
}

/**
 * 公式カレンダーに予定を作成または更新する
 *
 * - 保存済みの予定IDがあれば、その予定を更新する（見つからなければ作り直す）
 * - なければ、イベントIDから決まる予定IDで作成する。
 *   同じIDの予定が既にある（再処理・削除済みの予定）場合は、その予定を更新して復活させる。
 *
 * @return {Promise<string>} 公式カレンダーの予定ID
 */
async function upsertCalendarEvent(
  data: EventDoc,
  storedId: string | null,
  fallbackId: string,
): Promise<string> {
  const calendar = getCalendarClient();
  const requestBody = buildCalendarEventBody(data);

  if (storedId) {
    try {
      await calendar.events.update({ calendarId: calendarId(), eventId: storedId, requestBody });
      return storedId;
    } catch (error) {
      const status = httpStatusOf(error);
      if (status !== 404 && status !== 410) throw error;
      console.log('Stored calendar event not found, recreating:', storedId);
    }
  }

  try {
    await calendar.events.insert({
      calendarId: calendarId(),
      requestBody: { ...requestBody, id: fallbackId },
    });
  } catch (error) {
    if (httpStatusOf(error) !== 409) throw error;
    // 同じIDの予定が既にある（同一イベントの再処理、または削除済みの予定）
    await calendar.events.update({ calendarId: calendarId(), eventId: fallbackId, requestBody });
  }
  return fallbackId;
}

/** 公式カレンダーから予定を削除する（既に無い場合は成功扱い） */
async function deleteCalendarEventById(calendarEventId: string): Promise<void> {
  const calendar = getCalendarClient();
  try {
    await calendar.events.delete({ calendarId: calendarId(), eventId: calendarEventId });
  } catch (error) {
    const status = httpStatusOf(error);
    if (status === 404 || status === 410) {
      console.log('Calendar event already deleted:', calendarEventId);
      return;
    }
    throw error;
  }
}

/** Firestore の NOT_FOUND（gRPC のステータスコード 5） */
const FIRESTORE_NOT_FOUND = 5;

/**
 * 同期の結果をイベントに書き込む
 *
 * 同期している間にイベントが削除されていた場合は、書き込まずに終える。
 */
async function writeSyncStatus(
  ref: admin.firestore.DocumentReference | null,
  data: admin.firestore.UpdateData<admin.firestore.DocumentData>,
): Promise<void> {
  if (!ref) return;
  try {
    await ref.update(data);
  } catch (error) {
    if ((error as { code?: unknown })?.code === FIRESTORE_NOT_FOUND) {
      console.log('Event was deleted during sync; status not written:', ref.id);
      return;
    }
    throw error;
  }
}

/**
 * イベントの変更を公式カレンダーに反映する
 *
 * 作成・更新・削除のいずれも同じ判定（planCalendarSync）を通すので、
 * 公開状態、日時の変換、再処理時の重複防止が揃う。
 */
async function reconcile(
  eventId: string,
  before: EventDoc | null,
  after: EventDoc | null,
  ref: admin.firestore.DocumentReference | null,
): Promise<void> {
  if (!calendarId()) {
    console.log('Calendar sync disabled (CALENDAR_ID is empty):', eventId);
    return;
  }
  const plan = planCalendarSync(eventId, before, after);
  if (plan.action === 'none') {
    console.log('Calendar sync skipped:', eventId, plan.reason);
    return;
  }

  try {
    if (plan.action === 'upsert') {
      const calendarEventId = await upsertCalendarEvent(after as EventDoc, plan.storedId, plan.fallbackId);
      console.log('Calendar event upserted:', eventId, calendarEventId);
      await writeSyncStatus(ref, {
        googleCalendarEventId: calendarEventId,
        syncedAt: new Date().toISOString(),
        syncStatus: 'success',
        syncError: FieldValue.delete(),
        syncErrorAt: FieldValue.delete(),
      });
      return;
    }

    await deleteCalendarEventById(plan.calendarEventId);
    console.log('Calendar event removed:', eventId, plan.calendarEventId);
    if (plan.clearFirestore) {
      await writeSyncStatus(ref, {
        googleCalendarEventId: FieldValue.delete(),
        syncedAt: new Date().toISOString(),
        syncStatus: 'unpublished',
        syncError: FieldValue.delete(),
        syncErrorAt: FieldValue.delete(),
      });
    }
  } catch (error) {
    console.error('Error syncing to calendar:', eventId, error);
    await writeSyncStatus(ref, {
      syncError: error instanceof Error ? error.message : String(error),
      syncErrorAt: new Date().toISOString(),
      syncStatus: 'failed',
    });
    // エラーを再スロー（Cloud Functionsのエラーログに記録）
    throw error;
  }
}

/**
 * 作成・更新のトリガーで、Firestore の最新の内容を公式カレンダーに反映する
 *
 * トリガーの順番の入れ替わりや並行実行があっても、古い内容で上書きしない（syncLatest）。
 */
async function reconcileLatest(
  eventId: string,
  before: EventDoc | null,
  ref: admin.firestore.DocumentReference,
): Promise<void> {
  await syncLatest(
    before,
    async () => {
      const snap = await ref.get();
      return snap.exists ? (snap.data() as EventDoc) : null;
    },
    (prev, latest) => reconcile(eventId, prev, latest, ref),
    async (lastSynced) => {
      if (!calendarId()) return;
      const plan = planCalendarSync(eventId, lastSynced, null);
      if (plan.action !== 'delete') return;
      await deleteCalendarEventById(plan.calendarEventId);
      console.log('Calendar event removed after concurrent delete:', eventId, plan.calendarEventId);
    },
  );
}

/**
 * イベント作成時: 公開イベントなら公式カレンダーに追加
 */
export const syncEventToCalendar = functions
  .region('asia-northeast1') // 東京リージョン
  .firestore
  .document('events/{eventId}')
  .onCreate(async (snapshot, context) => {
    await reconcileLatest(context.params.eventId, null, snapshot.ref);
    return null;
  });

/**
 * イベント更新時: 内容の変更・公開／非公開の切り替えを公式カレンダーに反映
 */
export const updateCalendarEvent = functions
  .region('asia-northeast1')
  .firestore
  .document('events/{eventId}')
  .onUpdate(async (change, context) => {
    await reconcileLatest(
      context.params.eventId,
      change.before.data() as EventDoc,
      change.after.ref,
    );
    return null;
  });

/**
 * イベント削除時: 公式カレンダーからも削除
 */
export const deleteCalendarEvent = functions
  .region('asia-northeast1')
  .firestore
  .document('events/{eventId}')
  .onDelete(async (snapshot, context) => {
    await reconcile(context.params.eventId, snapshot.data() as EventDoc, null, null);
    return null;
  });

/**
 * 動作確認用（公式カレンダーの同期が有効かを返す）
 */
export const healthCheck = functions
  .region('asia-northeast1')
  .https.onRequest((_req, res) => {
    res.json({ status: 'ok', calendarSyncEnabled: calendarId() !== '' });
  });

// ===== Discord への通知 =====
//
// 以前は Google カレンダーから GAS で送っていた通知を、アプリのイベントから直接送る。
// 文面と対象期間は functions/src/discordNotify.ts（GAS と同じ）。
//
// Webhook の URL を知っていれば誰でもチャンネルに投稿できるため、アプリ（ブラウザ）には置かず、
// Secret Manager に保存して Functions からだけ使う（docs/DISCORD_SETUP.md）。
const DISCORD_WEBHOOK_URL = defineSecret('DISCORD_WEBHOOK_URL');

// 送り方: embed（イベントごとのカード。画像・リンク付き）/ text（GAS と同じ文字だけ）
const DISCORD_FORMAT = defineString('DISCORD_FORMAT', {
  default: 'embed',
  description: 'Discord 通知の形式（embed: 画像・リンク付きのカード / text: 文字だけ）',
});

function discordFormat(): DiscordFormat {
  return DISCORD_FORMAT.value().trim() === 'text' ? 'text' : 'embed';
}

/** 送信の記録（二重送信の防止）。アプリからは読み書きできない（firestore.rules に定義がない） */
const NOTIFICATION_LOG = 'discordNotifications';

/** 通知の対象になる公開イベントと、送る内容 */
async function loadReminder(kind: ReminderKind, now: Date, format: DiscordFormat) {
  const window = reminderWindow(now, REMINDERS[kind].days);
  const { from, until } = dateQueryRange(window);
  const snap = await getFirestore().collection('events')
    .where('isPublished', '==', true)
    .where('date', '>=', Timestamp.fromDate(from))
    .where('date', '<', Timestamp.fromDate(until))
    .orderBy('date')
    .get();
  const events = collectReminderEvents(snap.docs.map((d) => d.data() as EventDoc), window);
  return { window, payloads: buildReminderPayloads(kind, events, format), count: events.length };
}

/** Discord の Webhook に1通送る（混み合っている（429）場合は、指示された時間だけ待って1回だけ送り直す） */
async function postToDiscord(webhookUrl: string, payload: DiscordPayload): Promise<void> {
  const body = JSON.stringify({ ...payload, allowed_mentions: { parse: ['everyone'] } });
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (res.ok) return;
    if (res.status === 429 && attempt === 0) {
      const data = (await res.json().catch(() => ({}))) as { retry_after?: number };
      await new Promise((r) => setTimeout(r, Math.ceil((data.retry_after ?? 1) * 1000)));
      continue;
    }
    throw new Error(`Discord webhook failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
}

type SendResult = 'disabled' | 'no-events' | 'already-sent' | 'sent';

/**
 * リマインドを送る
 *
 * 同じ日の同じ種類の通知は1回だけ送る（定期実行が再試行・重複しても二重に送らない）。
 * 送る前に記録を作り、作れなかった（既にある）場合は送らない。
 */
async function sendReminder(kind: ReminderKind, now = new Date(), format = discordFormat()): Promise<SendResult> {
  const webhookUrl = DISCORD_WEBHOOK_URL.value().trim();
  if (!webhookUrl) {
    console.log('Discord notification disabled (DISCORD_WEBHOOK_URL is empty):', kind);
    return 'disabled';
  }

  const { window, payloads, count } = await loadReminder(kind, now, format);
  if (payloads.length === 0) {
    console.log('No events to notify; skipped:', kind, window.dateKey);
    return 'no-events';
  }

  const logRef = getFirestore().collection(NOTIFICATION_LOG).doc(`${kind}-${window.dateKey}`);
  try {
    await logRef.create({
      kind,
      format,
      dateKey: window.dateKey,
      eventCount: count,
      status: 'sending',
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if ((error as { code?: unknown })?.code === 6) { // ALREADY_EXISTS
      console.log('Already notified; skipped:', kind, window.dateKey);
      return 'already-sent';
    }
    throw error;
  }

  try {
    for (const payload of payloads) {
      await postToDiscord(webhookUrl, payload);
    }
    await logRef.update({ status: 'sent', messageCount: payloads.length, sentAt: new Date().toISOString() });
    console.log('Discord notification sent:', kind, window.dateKey, `${count} events / ${payloads.length} messages`);
    return 'sent';
  } catch (error) {
    // 途中まで送れている可能性があるため、自動では送り直さない（ログを見て判断する）
    await logRef.update({ status: 'failed', error: error instanceof Error ? error.message : String(error) });
    console.error('Discord notification failed:', kind, window.dateKey, error);
    throw error;
  }
}

/**
 * 毎日 10:00（日本時間）: 当日 10:00〜翌日 10:00 のイベントを通知（GAS の sendDailyReminder）
 */
export const sendDailyDiscordReminder = functions
  .region('asia-northeast1')
  .runWith({ secrets: [DISCORD_WEBHOOK_URL] })
  .pubsub.schedule('0 10 * * *')
  .timeZone('Asia/Tokyo')
  .onRun(async () => {
    await sendReminder('daily');
    return null;
  });

/**
 * 毎週月曜 10:00（日本時間）: 月曜 10:00〜翌週月曜 10:00 のイベントを通知（GAS の sendWeeklyReminder）
 */
export const sendWeeklyDiscordReminder = functions
  .region('asia-northeast1')
  .runWith({ secrets: [DISCORD_WEBHOOK_URL] })
  .pubsub.schedule('0 10 * * 1')
  .timeZone('Asia/Tokyo')
  .onRun(async () => {
    await sendReminder('weekly');
    return null;
  });

/** エミュレーター専用の URL のクエリ（kind / now / format） */
function emulatorQuery(req: functions.https.Request) {
  const kind: ReminderKind = req.query.kind === 'weekly' ? 'weekly' : 'daily';
  const now = typeof req.query.now === 'string' ? new Date(req.query.now) : new Date();
  const format: DiscordFormat = req.query.format === 'text' ? 'text' :
    req.query.format === 'embed' ? 'embed' : discordFormat();
  return { kind, now, format };
}

/**
 * エミュレーター専用: 送らずに、送る内容だけを返す
 *
 * 例: http://127.0.0.1:5101/demo-otoclub/asia-northeast1/previewDiscordReminder
 *     ?kind=weekly&now=2026-11-16T10:00:00%2B09:00&format=embed
 * 本番では 404 を返す（誰でも呼べる URL のため）。
 */
export const previewDiscordReminder = functions
  .region('asia-northeast1')
  .https.onRequest(async (req, res) => {
    if (process.env.FUNCTIONS_EMULATOR !== 'true') {
      res.status(404).send('Not Found');
      return;
    }
    const { kind, now, format } = emulatorQuery(req);
    if (Number.isNaN(now.getTime())) {
      res.status(400).send('now が日時として読めません');
      return;
    }
    const { window, payloads, count } = await loadReminder(kind, now, format);
    res.json({
      kind,
      format,
      from: window.start.toISOString(),
      until: window.end.toISOString(),
      eventCount: count,
      payloads,
    });
  });

/**
 * エミュレーター専用: 定期実行と同じ処理で、実際に Discord へ送る（二重送信の防止も同じ）
 *
 * 送り先は functions/.secret.local の DISCORD_WEBHOOK_URL（テスト用のチャンネルにする）。
 * 例: http://127.0.0.1:5101/demo-otoclub/asia-northeast1/runDiscordReminder
 *     ?kind=daily&now=2026-11-16T10:00:00%2B09:00&format=embed
 * 本番では 404 を返す。
 */
export const runDiscordReminder = functions
  .region('asia-northeast1')
  .runWith({ secrets: [DISCORD_WEBHOOK_URL] })
  .https.onRequest(async (req, res) => {
    if (process.env.FUNCTIONS_EMULATOR !== 'true') {
      res.status(404).send('Not Found');
      return;
    }
    const { kind, now, format } = emulatorQuery(req);
    if (Number.isNaN(now.getTime())) {
      res.status(400).send('now が日時として読めません');
      return;
    }
    try {
      res.json({ kind, format, result: await sendReminder(kind, now, format) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
