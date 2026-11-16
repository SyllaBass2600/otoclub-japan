import { describe, expect, it } from 'vitest';
import { isAdminUser } from '../src/config/admin';
import { missingKeys, parseEnv } from '../src/config/env';
import { buildGoogleCalendarAddUrl } from '../src/lib/calendarUrl';
import { fromDateInputValue, isValidTime, monthGrid, toDateInputValue } from '../src/lib/dates';
import { isValidHttpUrl, normalizeOptional, validateOptionalHttpUrl } from '../src/lib/url';
import {
  detailImageUrls,
  eventFields,
  eventFromFirestore,
  eventStatus,
  listImageUrl,
  placeLabel,
  removedEventImageUrls,
  type EventData,
} from '../src/models/event';

const base = (over: Partial<EventData> = {}): EventData => ({
  id: 'e1',
  eventName: 'テスト',
  date: new Date(2026, 10, 16),
  startTime: '18:00',
  endTime: '22:00',
  description: '',
  createdAt: new Date(2026, 0, 1),
  createdBy: 'u1',
  googleCalendarEventId: null,
  version: 0,
  flyerImageUrl: null,
  otherImageUrls: [],
  prefecture: null,
  location: null,
  websiteUrl: null,
  twitterUrl: null,
  isPublished: true,
  ...over,
});

describe('個人カレンダーの URL', () => {
  it('日本時間の時計の時刻で dates を作る', () => {
    const url = new URL(
      buildGoogleCalendarAddUrl({
        title: '音クラ',
        start: new Date(2026, 0, 5, 9, 30),
        end: new Date(2026, 0, 5, 18, 0),
        details: '  説明  ',
        location: '東京都 〇〇ホール',
      }),
    );
    expect(url.host).toBe('calendar.google.com');
    expect(url.searchParams.get('dates')).toBe('20260105T093000/20260105T180000');
    expect(url.searchParams.get('ctz')).toBe('Asia/Tokyo');
    expect(url.searchParams.get('details')).toBe('説明');
    expect(url.searchParams.get('location')).toBe('東京都 〇〇ホール');
  });

  it('終了が開始より前なら翌日の終了にする', () => {
    const url = new URL(
      buildGoogleCalendarAddUrl({ title: 'x', start: new Date(2026, 0, 31, 22, 0), end: new Date(2026, 0, 31, 2, 0) }),
    );
    expect(url.searchParams.get('dates')).toBe('20260131T220000/20260201T020000');
    expect(url.searchParams.has('details')).toBe(false);
  });
});

describe('URL の検証', () => {
  it('http / https だけを許す', () => {
    expect(isValidHttpUrl('https://x.com/abc')).toBe(true);
    expect(isValidHttpUrl('  http://example.com ')).toBe(true);
    expect(isValidHttpUrl('ftp://example.com')).toBe(false);
    expect(isValidHttpUrl('https://exa mple.com')).toBe(false);
    expect(isValidHttpUrl('example.com')).toBe(false);
    expect(validateOptionalHttpUrl('')).toBeNull();
    expect(validateOptionalHttpUrl('abc')).not.toBeNull();
    expect(normalizeOptional('  ')).toBeNull();
    expect(normalizeOptional(' a ')).toBe('a');
  });
});

describe('日付', () => {
  it('2026年11月のカレンダーは日曜はじまりで5週', () => {
    const grid = monthGrid(2026, 10);
    expect(grid.length).toBe(5);
    expect(grid[0][0]).toBe(1); // 2026-11-01 は日曜
    expect(grid[4][1]).toBe(30);
    expect(grid[4][2]).toBeNull();
  });

  it('input の値と相互に変換できる', () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(fromDateInputValue('2026-01-05')?.getDate()).toBe(5);
    expect(fromDateInputValue('')).toBeNull();
    expect(isValidTime('09:30')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
  });
});

describe('イベント', () => {
  it('Firestore のデータを読む（壊れた値も例外にしない）', () => {
    const ts = { toDate: () => new Date(2026, 10, 16) };
    const e = eventFromFirestore(
      { eventName: 'A', date: ts, startTime: '10:00', endTime: '12:00', otherImageUrls: ['a', '', 3], location: '  会場 ', version: 2.0 },
      'id1',
    );
    expect(e.id).toBe('id1');
    expect(e.date.getDate()).toBe(16);
    expect(e.otherImageUrls).toEqual(['a']);
    expect(e.location).toBe('会場');
    expect(e.version).toBe(2);
    expect(e.isPublished).toBe(true);
    expect(eventFromFirestore({}, 'x').date.getTime()).toBe(0);
  });

  it('保存する項目に Functions 用の項目と version を含めない', () => {
    const fields = eventFields(base({ googleCalendarEventId: 'g', version: 3 }));
    expect('googleCalendarEventId' in fields).toBe(false);
    expect('version' in fields).toBe(false);
  });

  it('画像と開催地の表示', () => {
    const e = base({ otherImageUrls: ['o1', 'o2'], prefecture: '東京都', location: ' ホール ' });
    expect(listImageUrl(e)).toBe('o1');
    expect(detailImageUrls(base({ flyerImageUrl: 'f', otherImageUrls: ['o'] }))).toEqual(['f', 'o']);
    expect(placeLabel(e)).toBe('東京都 ホール');
    expect(placeLabel(base({ prefecture: '架空県' }))).toBeNull();
  });

  it('開催状況', () => {
    const e = base();
    expect(eventStatus(e, new Date(2026, 10, 16, 19, 0))).toBe('ongoing');
    expect(eventStatus(e, new Date(2026, 10, 16, 10, 0))).toBe('today');
    expect(eventStatus(e, new Date(2026, 10, 17, 10, 0))).toBe('past');
    expect(eventStatus(e, new Date(2026, 10, 15, 10, 0))).toBe('upcoming');
  });

  it('外した画像だけを消す', () => {
    expect([...removedEventImageUrls(['a', 'b', 'c'], ['b', 'd'])]).toEqual(['a', 'c']);
  });
});

describe('設定と権限', () => {
  it('足りない設定を挙げる', () => {
    expect(missingKeys(parseEnv({}))).toContain('APP_ENV');
    const ok = parseEnv({
      APP_ENV: 'prod',
      FIREBASE_PROJECT_ID: 'p',
      FIREBASE_API_KEY: 'k',
      FIREBASE_APP_ID: 'a',
      FIREBASE_MESSAGING_SENDER_ID: 's',
      FIREBASE_AUTH_DOMAIN: 'd',
      FIREBASE_STORAGE_BUCKET: 'b',
      USE_EMULATOR: false,
    });
    expect(missingKeys(ok)).toEqual([]);
    expect(missingKeys({ ...ok, useEmulator: true }).length).toBe(1);
  });

  it('確認済みの管理者メールだけを管理者とする', () => {
    expect(isAdminUser({ email: 'SyllaBass2600@gmail.com ', emailVerified: true })).toBe(true);
    expect(isAdminUser({ email: 'syllabass2600@gmail.com', emailVerified: false })).toBe(false);
    expect(isAdminUser(null)).toBe(false);
  });
});
