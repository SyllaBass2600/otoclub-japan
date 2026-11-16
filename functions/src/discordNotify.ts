/**
 * Discord へのリマインド通知の純粋なロジック（Firebase / Discord に依存しない）
 *
 * 以前 Google カレンダー + GAS で送っていた通知と同じ内容を、アプリのイベントから作る。
 *
 * - 日次: 毎日 10:00（日本時間）に、当日 10:00〜翌日 10:00 に始まるイベントを「本日の音クラ」として送る
 * - 週次: 毎週月曜 10:00 に、月曜 10:00〜翌週月曜 10:00 に始まるイベントを日付ごとにまとめて「今週の音クラ」として送る
 * - 対象のイベントが0件なら送らない
 * - 非公開のイベントは送らない
 *
 * 送り方は2種類:
 * - text: GAS と同じ文字だけのメッセージ
 * - embed: イベントごとのカード（フライヤー画像・公式サイトへのリンク付き）。見出しと @everyone は本文に置く
 */
import { EventDoc, buildCalendarEventBody, isPublishedEvent, toJstDateParts } from './calendarSync';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Discord のメッセージ1件の文字数の上限 */
export const DISCORD_MAX_LENGTH = 2000;

export type ReminderKind = 'daily' | 'weekly';

export const REMINDERS: Record<ReminderKind, { days: number; heading: string }> = {
  daily: { days: 1, heading: '↓↓↓本日の音クラはこちら↓↓↓' },
  weekly: { days: 7, heading: '↓↓↓今週の音クラはこちら↓↓↓' },
};

/** 通知の起点の時刻（日本時間の 10:00） */
export const REMINDER_HOUR = 10;

export interface ReminderWindow {
  /** 起点（その日の日本時間 10:00） */
  start: Date;
  /** 終点（start + days 日。この時刻ちょうどに始まるイベントは含まない） */
  end: Date;
  /** 起点の日付（日本時間、YYYY-MM-DD）。二重送信の防止に使う */
  dateKey: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 日本時間の年月日・時刻 */
function jstParts(d: Date) {
  const j = new Date(d.getTime() + JST_OFFSET_MS);
  return {
    year: j.getUTCFullYear(),
    month: j.getUTCMonth() + 1,
    day: j.getUTCDate(),
    hour: j.getUTCHours(),
    minute: j.getUTCMinutes(),
  };
}

/**
 * 通知の対象期間（GAS と同じく、実行した日の 10:00 から days 日間）
 *
 * 実行が 10 時台より遅れても、起点はその日の 10:00 に固定する。
 */
export function reminderWindow(now: Date, days: number): ReminderWindow {
  const p = jstParts(now);
  const start = new Date(Date.UTC(p.year, p.month - 1, p.day, REMINDER_HOUR) - JST_OFFSET_MS);
  return {
    start,
    end: new Date(start.getTime() + days * DAY_MS),
    dateKey: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
  };
}

/** 通知に載せるイベント */
export interface ReminderEvent {
  title: string;
  start: Date;
  /** 文字だけの通知に出す詳細（説明 + URL。なければ「詳細なし」） */
  description: string;
  /** カードに出す説明（URL は含めない。なければ空） */
  body: string;
  /** 「都道府県 開催場所」（なければ空） */
  place: string;
  flyerUrl: string | null;
  websiteUrl: string | null;
  twitterUrl: string | null;
}

/** http / https の URL だけを通す（Discord はそれ以外の画像・リンクを受け付けない） */
export function httpUrl(value: unknown): string | null {
  const v = String(value ?? '').trim();
  return /^https?:\/\/\S+$/i.test(v) ? v : null;
}

/**
 * 通知の本文に出す詳細
 *
 * GAS はカレンダーの詳細欄をそのまま出していた。アプリでは公式サイト・X を別の項目で持つので、
 * 詳細の後ろに続けて出す（カレンダーの詳細欄に書いていたリンクの代わり）。何もなければ「詳細なし」。
 */
export function describe(data: EventDoc): string {
  const lines = [
    String(data.description ?? '').replace(/\r\n?/g, '\n').trim(),
    String(data.websiteUrl ?? '').trim(),
    String(data.twitterUrl ?? '').trim(),
  ].filter((v) => v !== '');
  return lines.length > 0 ? lines.join('\n') : '詳細なし';
}

/** イベントの開始時刻（日付・時刻が壊れていれば null） */
export function startOf(data: EventDoc): Date | null {
  try {
    return new Date(buildCalendarEventBody(data).start.dateTime);
  } catch {
    return null;
  }
}

/**
 * 期間内に始まる公開イベント（開始時刻順）
 *
 * タイトルは公式カレンダーの件名（【都道府県】イベント名）と同じにする。
 * GAS は公式カレンダーの件名をそのまま出していたため。
 */
export function collectReminderEvents(docs: EventDoc[], window: ReminderWindow): ReminderEvent[] {
  const events: ReminderEvent[] = [];
  for (const data of docs) {
    if (!isPublishedEvent(data)) continue;
    const start = startOf(data);
    if (!start) continue;
    if (start.getTime() < window.start.getTime() || start.getTime() >= window.end.getTime()) continue;
    const body = buildCalendarEventBody(data);
    events.push({
      title: body.summary,
      start,
      description: describe(data),
      body: String(data.description ?? '').replace(/\r\n?/g, '\n').trim(),
      place: body.location,
      // フライヤーがなければ、その他画像の1枚目（アプリの一覧と同じ）
      flyerUrl: httpUrl(data.flyerImageUrl) ??
        httpUrl(Array.isArray(data.otherImageUrls) ? data.otherImageUrls[0] : null),
      websiteUrl: httpUrl(data.websiteUrl),
      twitterUrl: httpUrl(data.twitterUrl),
    });
  }
  return events.sort((a, b) => a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title));
}

/** HH:mm（日本時間） */
export function formatTime(d: Date): string {
  const p = jstParts(d);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** M月d日（日本時間） */
export function formatMonthDay(d: Date): string {
  const p = jstParts(d);
  return `${p.month}月${p.day}日`;
}

/** イベント1件のブロック（GAS と同じ「タイトル / HH:mm~ / 詳細」） */
function eventBlock(e: ReminderEvent): string {
  return `${e.title}\n${formatTime(e.start)}~\n${e.description}`;
}

/**
 * 通知の本文をブロック（イベント・日付見出しの区切り）の並びで作る
 *
 * 0件なら null（送らない）。
 */
export function buildReminderBlocks(kind: ReminderKind, events: ReminderEvent[]): string[] | null {
  if (events.length === 0) return null;
  const blocks: string[] = [];
  if (kind === 'daily') {
    events.forEach((e) => blocks.push(eventBlock(e)));
    return blocks;
  }
  let currentDate = '';
  for (const e of events) {
    const date = formatMonthDay(e.start);
    if (date !== currentDate) {
      currentDate = date;
      // 日付の見出しは、その日の最初のイベントと同じブロックにする（見出しだけ別メッセージにならないように）
      blocks.push(`■${date}\n${eventBlock(e)}`);
    } else {
      blocks.push(eventBlock(e));
    }
  }
  return blocks;
}

/**
 * Discord に送るメッセージ（2000文字を超える場合は、イベントの区切りで複数に分ける）
 *
 * 1通目の先頭に @everyone と見出しを付ける。0件なら空の配列（送らない）。
 */
export function buildReminderMessages(kind: ReminderKind, events: ReminderEvent[]): string[] {
  const blocks = buildReminderBlocks(kind, events);
  if (!blocks) return [];
  const header = `@everyone\n${REMINDERS[kind].heading}`;
  return splitMessage(header, blocks, DISCORD_MAX_LENGTH);
}

/** 見出しとブロックを、上限の文字数に収まるように分ける（1ブロックが上限を超える場合は途中で切る） */
export function splitMessage(header: string, blocks: string[], limit: number): string[] {
  const messages: string[] = [];
  let current = header;
  const push = () => {
    if (current.trim() !== '') messages.push(current.trim());
    current = '';
  };
  for (const block of blocks) {
    const sep = current === '' ? '' : current === header ? '\n' : '\n\n';
    if ((current + sep + block).length <= limit) {
      current += sep + block;
      continue;
    }
    push();
    let rest = block;
    while (rest.length > limit) {
      messages.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    current = rest;
  }
  push();
  return messages;
}

/**
 * Firestore で読む日付の範囲
 *
 * イベントの date はその日の 0:00（日本時間）なので、期間の起点の日の 0:00 から、終点の時刻までを読む。
 */
export function dateQueryRange(window: ReminderWindow): { from: Date; until: Date } {
  const p = toJstDateParts(window.start);
  return {
    from: new Date(Date.UTC(p.year, p.month - 1, p.day) - JST_OFFSET_MS),
    until: window.end,
  };
}

// ===== カード（embed）形式 =====

export type DiscordFormat = 'text' | 'embed';

export interface DiscordEmbed {
  title: string;
  url?: string;
  description: string;
  image?: { url: string };
}

/** Webhook に送る1通分 */
export interface DiscordPayload {
  content?: string;
  embeds?: DiscordEmbed[];
}

/** Discord の上限（1通あたりのカード数・カードの文字数の合計、タイトル・説明の文字数） */
export const DISCORD_MAX_EMBEDS = 10;
export const DISCORD_MAX_EMBED_TOTAL = 6000;
const EMBED_TITLE_MAX = 256;
const EMBED_DESCRIPTION_MAX = 4096;

const truncate = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max - 1) + '…');

/**
 * イベント1件のカード
 *
 * - タイトル: 【都道府県】イベント名（公式サイトがあれば、タイトルがリンクになる）
 * - 説明: 日時（週次は ■M月d日 付き）・場所・説明・公式サイト / X のリンク
 * - 画像: フライヤー（なければその他画像の1枚目）
 */
export function eventEmbed(kind: ReminderKind, e: ReminderEvent): DiscordEmbed {
  const when = kind === 'weekly' ? `■${formatMonthDay(e.start)} ${formatTime(e.start)}~` : `${formatTime(e.start)}~`;
  const links = [
    e.websiteUrl ? `[公式サイト](${e.websiteUrl})` : '',
    e.twitterUrl ? `[Xはこちらから](${e.twitterUrl})` : '',
  ].filter((v) => v !== '').join('　');
  const lines = [`**${when}**`, e.place ? `📍 ${e.place}` : '', e.body, links].filter((v) => v !== '');
  const embed: DiscordEmbed = {
    title: truncate(e.title, EMBED_TITLE_MAX),
    description: truncate(lines.join('\n'), EMBED_DESCRIPTION_MAX),
  };
  if (e.websiteUrl) embed.url = e.websiteUrl;
  if (e.flyerUrl) embed.image = { url: e.flyerUrl };
  return embed;
}

const embedLength = (e: DiscordEmbed) => e.title.length + e.description.length;

/**
 * Discord に送る内容（0件なら空の配列）
 *
 * embed では、1通目の本文に @everyone と見出しを置き、カードを10枚・合計6000文字ずつに分けて送る。
 */
export function buildReminderPayloads(
  kind: ReminderKind,
  events: ReminderEvent[],
  format: DiscordFormat,
): DiscordPayload[] {
  if (events.length === 0) return [];
  if (format === 'text') {
    return buildReminderMessages(kind, events).map((content) => ({ content }));
  }
  const payloads: DiscordPayload[] = [];
  let current: DiscordEmbed[] = [];
  let total = 0;
  for (const embed of events.map((e) => eventEmbed(kind, e))) {
    const len = embedLength(embed);
    if (current.length >= DISCORD_MAX_EMBEDS || (current.length > 0 && total + len > DISCORD_MAX_EMBED_TOTAL)) {
      payloads.push({ embeds: current });
      current = [];
      total = 0;
    }
    current.push(embed);
    total += len;
  }
  payloads.push({ embeds: current });
  payloads[0].content = `@everyone\n${REMINDERS[kind].heading}`;
  return payloads;
}
