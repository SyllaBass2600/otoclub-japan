import { pad2 } from './dates';

/**
 * 個人カレンダーへの追加（利用者自身の Google カレンダー）
 *
 * Google カレンダーの予定作成画面を利用者自身のアカウントで開く URL を作るだけで、アプリからは書き込まない。
 * 公式カレンダーへの登録・更新・削除は Cloud Functions だけが行う。
 */
export const CALENDAR_TIME_ZONE = 'Asia/Tokyo';

/** YYYYMMDDTHHmmss（タイムゾーンなし。ctz で日本時間として解釈される） */
function formatLocal(d: Date): string {
  return (
    `${String(d.getFullYear()).padStart(4, '0')}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  );
}

/**
 * Google カレンダーの予定作成画面の URL
 *
 * start / end は日本時間の「時計の時刻」として扱う（ctz=Asia/Tokyo）。
 * 終了が開始より前の場合（例: 22:00〜02:00）は翌日の終了として扱う。
 */
export function buildGoogleCalendarAddUrl(args: {
  title: string;
  start: Date;
  end: Date;
  details?: string | null;
  location?: string | null;
}): string {
  const { title, start, end, details, location } = args;
  const actualEnd =
    end.getTime() < start.getTime()
      ? new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1, end.getHours(), end.getMinutes(), end.getSeconds())
      : end;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${formatLocal(start)}/${formatLocal(actualEnd)}`,
    ctz: CALENDAR_TIME_ZONE,
  });
  if (details && details.trim() !== '') params.set('details', details.trim());
  if (location && location.trim() !== '') params.set('location', location.trim());
  return `https://calendar.google.com/calendar/render?${params}`;
}
