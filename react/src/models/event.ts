import { isAdminUser } from '../config/admin';
import { buildGoogleCalendarAddUrl } from '../lib/calendarUrl';
import { isPrefecture } from '../lib/constants';
import { formatDate } from '../lib/dates';

/**
 * イベント（Firestore の events コレクション）
 *
 * イベントはログインした個人が登録する（団体はない）。
 * 編集・削除できるのは登録した本人（createdBy）と管理者だけ（firestore.rules）。
 * 項目は Flutter 版の EventData と同じ。
 */
export interface EventData {
  id: string | null;
  eventName: string;
  /** その日の 0:00（日本時間） */
  date: Date;
  /** HH:mm */
  startTime: string;
  /** HH:mm */
  endTime: string;
  description: string;
  createdAt: Date;
  /** 登録した人（ユーザーID） */
  createdBy: string;
  /** 公式カレンダーの予定ID（Cloud Functions だけが書き込む） */
  googleCalendarEventId: string | null;
  /** 更新の版（楽観ロック用） */
  version: number;
  /** フライヤー画像URL（A4縦長） */
  flyerImageUrl: string | null;
  /** その他画像URL（最大 MAX_OTHER_IMAGES 枚、並び順どおり） */
  otherImageUrls: string[];
  prefecture: string | null;
  /** 会場名・住所などの自由記述 */
  location: string | null;
  websiteUrl: string | null;
  twitterUrl: string | null;
  /** 非公開は登録した本人と管理者にだけ見える */
  isPublished: boolean;
}

/** その他画像の枚数の上限 */
export const MAX_OTHER_IMAGES = 3;

// ---- Firestore の値の変換（Timestamp かどうかは toDate を持つかで見分ける） ----

type TimestampLike = { toDate(): Date };
const isTimestampLike = (v: unknown): v is TimestampLike =>
  typeof v === 'object' && v !== null && typeof (v as TimestampLike).toDate === 'function';

export function toDate(value: unknown): Date | null {
  if (isTimestampLike(value)) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'number') return new Date(value);
  return null;
}

const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const nonEmpty = (v: string | null | undefined): string | null => (v == null || v === '' ? null : v);

/**
 * Firestore のデータからイベントを作る
 *
 * 日付のないイベント（壊れたデータ）は 1970年1月1日として扱い、例外にしない。
 * createdAt は serverTimestamp の書き込み直後に null になるため、現在時刻で補う。
 */
export function eventFromFirestore(data: Record<string, unknown>, id: string): EventData {
  const others = Array.isArray(data.otherImageUrls) ? data.otherImageUrls : [];
  return {
    id,
    eventName: asString(data.eventName) ?? '',
    date: toDate(data.date) ?? new Date(0),
    startTime: asString(data.startTime) ?? '',
    endTime: asString(data.endTime) ?? '',
    description: asString(data.description) ?? '',
    createdAt: toDate(data.createdAt) ?? new Date(),
    createdBy: asString(data.createdBy) ?? '',
    googleCalendarEventId: asString(data.googleCalendarEventId),
    version: typeof data.version === 'number' ? Math.trunc(data.version) : 0,
    flyerImageUrl: nonEmpty(asString(data.flyerImageUrl)),
    otherImageUrls: others.filter((u): u is string => typeof u === 'string' && u !== ''),
    prefecture: nonEmpty(asString(data.prefecture)),
    location: nonEmpty(asString(data.location)?.trim()),
    websiteUrl: asString(data.websiteUrl),
    twitterUrl: asString(data.twitterUrl),
    isPublished: typeof data.isPublished === 'boolean' ? data.isPublished : true,
  };
}

/**
 * 保存する項目（Date のまま。Timestamp への変換と null の扱いはリポジトリで行う）
 *
 * googleCalendarEventId と version は含めない（Functions とリポジトリが書き込む）。
 */
export function eventFields(event: EventData): Record<string, unknown> {
  return {
    eventName: event.eventName,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    description: event.description,
    createdAt: event.createdAt,
    createdBy: event.createdBy,
    flyerImageUrl: event.flyerImageUrl,
    otherImageUrls: event.otherImageUrls,
    prefecture: event.prefecture,
    location: event.location,
    websiteUrl: event.websiteUrl,
    twitterUrl: event.twitterUrl,
    isPublished: event.isPublished,
  };
}

// ---- 表示・権限の判定 ----

type UserLike = { uid: string; email: string | null; emailVerified: boolean };

/** uid の人が登録したイベントか */
export const isOwnedBy = (event: EventData, uid: string | null | undefined): boolean =>
  uid != null && uid === event.createdBy;

/** 編集・削除できるか（登録した本人か管理者） */
export const canBeManagedBy = (event: EventData, user: UserLike | null | undefined): boolean =>
  isOwnedBy(event, user?.uid) || isAdminUser(user);

/** 一覧に出す画像。フライヤーを優先し、なければその他画像の1枚目 */
export const listImageUrl = (event: EventData): string | null =>
  event.flyerImageUrl ?? event.otherImageUrls[0] ?? null;

/** 詳細画面でスワイプ表示する画像（フライヤー → その他画像の順） */
export const detailImageUrls = (event: EventData): string[] => [
  ...(event.flyerImageUrl ? [event.flyerImageUrl] : []),
  ...event.otherImageUrls,
];

/** 開催地の表示（「都道府県 開催場所」。どちらもなければ null） */
export function placeLabel(event: EventData): string | null {
  const parts: string[] = [];
  if (isPrefecture(event.prefecture)) parts.push(event.prefecture);
  const loc = event.location?.trim();
  if (loc) parts.push(loc);
  return parts.length === 0 ? null : parts.join(' ');
}

export const formattedDate = (event: EventData): string => formatDate(event.date);
export const formattedTime = (event: EventData): string => `${event.startTime}～${event.endTime}`;

function timeOnDate(event: EventData, value: string, fallbackHour: number, fallbackMinute: number): Date {
  const { date } = event;
  const m = /^(\d{1,2}):(\d{1,2})/.exec(value);
  if (!m) return new Date(date.getFullYear(), date.getMonth(), date.getDate(), fallbackHour, fallbackMinute);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Number(m[1]), Number(m[2]));
}

/** 開始日時（日本時間の時計の時刻） */
export const startDateTime = (event: EventData): Date => timeOnDate(event, event.startTime, 0, 0);
/** 終了日時（日本時間の時計の時刻） */
export const endDateTime = (event: EventData): Date => timeOnDate(event, event.endTime, 23, 59);

export type EventStatus = 'ongoing' | 'today' | 'past' | 'upcoming';

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  ongoing: '開催中',
  today: '本日開催',
  past: '終了',
  upcoming: '開催予定',
};

/** 開催状況（Flutter 版と同じ判定順） */
export function eventStatus(event: EventData, now: Date = new Date()): EventStatus {
  const start = startDateTime(event).getTime();
  const end = endDateTime(event).getTime();
  const t = now.getTime();
  if (t > start && t < end) return 'ongoing';
  const d = event.date;
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
    return 'today';
  }
  if (end < t) return 'past';
  if (start > t) return 'upcoming';
  return 'ongoing'; // 開始時刻ちょうど
}

/** イベントを個人の Google カレンダーに追加する URL */
export const personalCalendarUrl = (event: EventData): string =>
  buildGoogleCalendarAddUrl({
    title: event.eventName,
    start: startDateTime(event),
    end: endDateTime(event),
    details: event.description,
    location: placeLabel(event),
  });

/** 保存のあとで Storage から消してよい画像（保存前にあって保存後にない画像） */
export function removedEventImageUrls(before: Iterable<string>, after: Iterable<string>): Set<string> {
  const remaining = new Set(after);
  const removed = new Set<string>();
  for (const url of before) if (!remaining.has(url)) removed.add(url);
  return removed;
}
