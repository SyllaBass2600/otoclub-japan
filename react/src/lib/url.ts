/** イベントの公式リンクなどで使う URL の検証・整形 */

/** http / https で、ホスト名がある URL か */
export function isValidHttpUrl(value: string | null | undefined): boolean {
  if (value == null) return false;
  const trimmed = value.trim();
  if (trimmed === '' || /\s/.test(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
  } catch {
    return false;
  }
}

/** フォームの検証（空欄は許可する）。問題なければ null */
export function validateOptionalHttpUrl(value: string): string | null {
  if (value.trim() === '') return null;
  return isValidHttpUrl(value) ? null : 'http:// または https:// で始まるURLを入力してください';
}

/** 入力値を保存用に整える（空欄は null） */
export function normalizeOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/**
 * 外部 URL を新しいタブで開く。ポップアップがブロックされたら false。
 * ブロックされないよう、クリック処理の中で await を挟まずに呼ぶこと。
 */
export function openExternalUrl(url: string): boolean {
  // 'noopener' を付けると開けても null が返り、ブロックを見分けられないため、開いた後に切り離す
  const opened = window.open(url, '_blank');
  if (!opened) return false;
  try {
    opened.opener = null;
  } catch {
    // 別オリジンのタブでは書き込めないことがあるが、表示には影響しない
  }
  return true;
}

/** Google マップで場所を検索する URL */
export const googleMapsSearchUrl = (place: string): string =>
  `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: place })}`;

/** Google マップで経路を調べる URL */
export const googleMapsDirectionsUrl = (place: string): string =>
  `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination: place })}`;
