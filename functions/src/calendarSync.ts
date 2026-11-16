/**
 * 公式Googleカレンダー同期の純粋なロジック（Firebase / Google API に依存しない）
 *
 * セカファン（stamp_rally_sekafan）の functions/src/calendarSync.ts から移したもの。
 *
 * - 日本時間の入力を、オフセット付き（+09:00）の日時文字列に変換する
 * - Firestore の変更前後から、カレンダーに対して何をすべきかを決める
 * - Firestore のイベントIDから、決まった Google カレンダーのイベントIDを作る
 */

export const TIME_ZONE = 'Asia/Tokyo';
const JST_OFFSET = '+09:00';
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Firestore のイベントドキュメント（同期に使う項目だけ） */
export interface EventDoc {
  eventName?: string;
  date?: unknown;
  startTime?: string;
  endTime?: string;
  description?: string;
  location?: string | null;
  prefecture?: string | null;
  isPublished?: boolean;
  googleCalendarEventId?: string | null;
  [key: string]: unknown;
}

export interface DateParts {
  year: number;
  /** 1〜12 */
  month: number;
  day: number;
}

/**
 * 公式カレンダーに載せるべきイベントか
 *
 * isPublished がないイベント（公開状態の導入前に作られたもの）は、
 * アプリ（EventData.fromFirestore）と同じく公開として扱う。
 */
export function isPublishedEvent(data: EventDoc | null | undefined): boolean {
  return data != null && data.isPublished !== false;
}

/**
 * イベントの日付を、日本時間の年月日として取り出す
 *
 * - Firestore Timestamp（toDate() を持つもの）: その瞬間の日本時間の日付
 * - Date: 同上
 * - 文字列 "YYYY-MM-DD": そのまま日本時間の日付として扱う
 */
export function toJstDateParts(value: unknown): DateParts {
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!m) throw new Error(`Invalid date string: ${value}`);
    return checkedParts(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  let date: Date | undefined;
  if (value instanceof Date) {
    date = value;
  } else if (value != null && typeof (value as { toDate?: unknown }).toDate === 'function') {
    date = (value as { toDate: () => Date }).toDate();
  }
  if (!date || Number.isNaN(date.getTime())) {
    throw new Error('Invalid date format');
  }

  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth() + 1,
    day: jst.getUTCDate(),
  };
}

function checkedParts(year: number, month: number, day: number): DateParts {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    throw new Error(`Invalid date: ${year}-${month}-${day}`);
  }
  return { year, month, day };
}

/** "HH:mm" を時・分に分解する */
export function parseTime(value: unknown): { hour: number; minute: number } {
  if (typeof value !== 'string') throw new Error(`Invalid time: ${String(value)}`);
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) throw new Error(`Invalid time: ${value}`);
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) throw new Error(`Invalid time: ${value}`);
  return { hour, minute };
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/**
 * 日本時間の年月日・時刻を、オフセット付きの日時文字列にする
 * 例: 2026-12-22 10:00 → "2026-12-22T10:00:00+09:00"
 *
 * dayOffset で翌日以降にずらせる（月末・年末の繰り上がりも正しく扱う）。
 */
export function toJstDateTimeString(
  parts: DateParts,
  time: { hour: number; minute: number },
  dayOffset = 0,
): string {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset));
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(time.hour)}:${pad(time.minute)}:00${JST_OFFSET}`;
}

/**
 * イベントの開始・終了日時（日本時間、オフセット付き）
 *
 * 終了時刻が開始時刻より前の場合（例: 22:00〜02:00）は、翌日の終了として扱う。
 */
export function buildEventTimes(data: EventDoc): { start: string; end: string } {
  const parts = toJstDateParts(data.date);
  const start = parseTime(data.startTime);
  const end = parseTime(data.endTime);
  const endsNextDay = end.hour * 60 + end.minute < start.hour * 60 + start.minute;
  return {
    start: toJstDateTimeString(parts, start),
    end: toJstDateTimeString(parts, end, endsNextDay ? 1 : 0),
  };
}

function trimmed(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

/** タイトルの【】に入れる地名（都道府県。なければ開催場所） */
function areaOf(data: EventDoc): string {
  return trimmed(data.prefecture) || trimmed(data.location);
}

/** 予定の場所（アプリの EventData.placeLabel と同じ「都道府県 開催場所」） */
function placeOf(data: EventDoc): string {
  return [trimmed(data.prefecture), trimmed(data.location)].filter((v) => v !== '').join(' ');
}

/** Google Calendar API に送るイベント本文 */
export function buildCalendarEventBody(data: EventDoc) {
  const { start, end } = buildEventTimes(data);
  const place = placeOf(data);
  const area = areaOf(data);
  const name = (data.eventName ?? '').toString();
  return {
    summary: area ? `【${area}】${name}` : name,
    description: (data.description ?? '').toString(),
    location: place,
    start: { dateTime: start, timeZone: TIME_ZONE },
    end: { dateTime: end, timeZone: TIME_ZONE },
    // 削除済み（cancelled）の予定を同じIDで復活させる場合にも使う
    status: 'confirmed',
  };
}

/**
 * Firestore のイベントIDから、公式カレンダーの予定IDを決める
 *
 * 同じイベントは常に同じ予定IDになるので、同じ変更を再処理しても予定は増えない。
 * Google カレンダーの予定IDに使える文字は base32hex（a〜v と 0〜9）なので、
 * Firestore のID（英数字）を16進数（0〜9, a〜f）に変換して使う。
 */
export function calendarEventIdFor(eventId: string): string {
  return 'otoclub' + Buffer.from(eventId, 'utf8').toString('hex');
}

/** カレンダーの内容に影響する項目。これ以外の変更では同期しない */
export const RELEVANT_FIELDS = [
  'eventName',
  'date',
  'startTime',
  'endTime',
  'description',
  'location',
  'prefecture',
  'isPublished',
] as const;

function normalized(value: unknown): string {
  if (value != null && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return `ts:${(value as { toMillis: () => number }).toMillis()}`;
  }
  return JSON.stringify(value ?? null);
}

export function hasRelevantChanges(before: EventDoc, after: EventDoc): boolean {
  return RELEVANT_FIELDS.some((f) => normalized(before[f]) !== normalized(after[f]));
}

export type SyncPlan =
  | { action: 'none'; reason: string }
  | { action: 'upsert'; storedId: string | null; fallbackId: string }
  | { action: 'delete'; calendarEventId: string; clearFirestore: boolean };

/**
 * 変更前後のイベントから、公式カレンダーへの操作を決める
 *
 * @param eventId Firestore のイベントID
 * @param before 変更前（新規作成なら null）
 * @param after 変更後（削除なら null）
 */
export function planCalendarSync(
  eventId: string,
  before: EventDoc | null,
  after: EventDoc | null,
): SyncPlan {
  const fallbackId = calendarEventIdFor(eventId);

  // 削除: 公開中だった（= 予定があるはずの）イベントだけ消す
  if (after == null) {
    const storedId = before?.googleCalendarEventId || null;
    if (storedId || isPublishedEvent(before)) {
      return { action: 'delete', calendarEventId: storedId ?? fallbackId, clearFirestore: false };
    }
    return { action: 'none', reason: 'deleted event was not synced' };
  }

  const storedId = after.googleCalendarEventId || null;

  // 非公開: 公式カレンダーに載っていれば外す
  if (!isPublishedEvent(after)) {
    if (storedId) {
      return { action: 'delete', calendarEventId: storedId, clearFirestore: true };
    }
    if (before != null && isPublishedEvent(before)) {
      return { action: 'delete', calendarEventId: fallbackId, clearFirestore: true };
    }
    return { action: 'none', reason: 'event is not published' };
  }

  // 公開: まだ予定がなければ作り、あれば変更があったときだけ更新する
  if (!storedId || before == null || !isPublishedEvent(before) || hasRelevantChanges(before, after)) {
    return { action: 'upsert', storedId, fallbackId };
  }
  return { action: 'none', reason: 'no relevant changes' };
}

/**
 * イベントの最新の内容を公式カレンダーに反映する（作成・更新のトリガー用）
 *
 * トリガーは変更の順に届くとは限らず、同じイベントで並行して動くこともある。
 * そのため変更時点のスナップショットではなく、毎回 Firestore の最新の内容を読んで反映する。
 * 反映している間に内容が変わっていたら、もう一度反映する。後から終わった実行が
 * 必ず最新の内容を確かめるので、古い内容で上書きされたまま終わることはない。
 *
 * @param before 変更前（新規作成なら null）
 * @param readLatest Firestore の最新の内容（削除済みなら null）
 * @param sync 変更前後の内容で、カレンダーに反映する
 * @param onDeletedWhileSyncing 反映している間にイベントが削除された。最後に反映した内容を受け取る
 *   （onDelete のトリガーより後に予定を作り直していることがあるため、ここで消す）
 * @param maxRounds 反映を繰り返す上限
 */
export async function syncLatest(
  before: EventDoc | null,
  readLatest: () => Promise<EventDoc | null>,
  sync: (before: EventDoc | null, after: EventDoc) => Promise<void>,
  onDeletedWhileSyncing: (lastSynced: EventDoc) => Promise<void>,
  maxRounds = 3,
): Promise<void> {
  let previous = before;
  let latest = await readLatest();
  // 削除済み: onDelete のトリガーに任せる
  if (latest == null) return;

  for (let round = 0; round < maxRounds; round++) {
    await sync(previous, latest);
    const current = await readLatest();
    if (current == null) {
      await onDeletedWhileSyncing(latest);
      return;
    }
    if (!hasRelevantChanges(latest, current)) return;
    previous = latest;
    latest = current;
  }
  console.warn('Calendar sync did not settle; a later trigger will retry');
}

/** Google API のエラーから HTTP ステータスを取り出す */
export function httpStatusOf(error: unknown): number | undefined {
  const e = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  for (const v of [e?.response?.status, e?.code, e?.status]) {
    const n = typeof v === 'string' ? Number(v) : v;
    if (typeof n === 'number' && Number.isInteger(n) && n >= 100 && n < 600) return n;
  }
  return undefined;
}
