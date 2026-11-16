/** 画面に出す日付・時刻の書式（Flutter 版の DateFormats と同じ見た目） */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

export const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 2026年1月5日 */
export const formatDate = (d: Date): string =>
  `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;

/** 2026年 1月 */
export const formatYearMonth = (d: Date): string =>
  `${d.getFullYear()}年 ${d.getMonth() + 1}月`;

/** 1月5日(月) */
export const formatMonthDayWeekday = (d: Date): string =>
  `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;

/** 09:30 */
export const formatTime = (hour: number, minute: number): string => `${pad2(hour)}:${pad2(minute)}`;

/** <input type="date"> の値（YYYY-MM-DD） */
export const toDateInputValue = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** <input type="date"> の値から、その日の 0:00（端末の時刻）を作る */
export function fromDateInputValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** HH:mm として正しいか（firestore.rules の isTime と同じ条件） */
export const isValidTime = (value: string): boolean => /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);

/** 月のカレンダーのマス（日曜はじまり。月の外は null） */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((startWeekday + daysInMonth) / 7);
  const grid: (number | null)[][] = [];
  for (let w = 0; w < weeks; w++) {
    const row: (number | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const day = w * 7 + i - startWeekday + 1;
      row.push(day >= 1 && day <= daysInMonth ? day : null);
    }
    grid.push(row);
  }
  return grid;
}
