// 公式カレンダー同期ロジックのテスト（実行: cd functions && npm test）
// tsc でビルドした lib/calendarSync.js を読み込む。Firebase / Google API は使わない。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCalendarEventBody,
  buildEventTimes,
  calendarEventIdFor,
  httpStatusOf,
  isPublishedEvent,
  planCalendarSync,
  syncLatest,
  toJstDateParts,
} = require('../lib/calendarSync');

// Firestore Timestamp の代わり（toDate / toMillis を持つ）
const ts = (iso) => {
  const d = new Date(iso);
  return { toDate: () => d, toMillis: () => d.getTime() };
};

// アプリ（日本時間の端末）が保存する日付: その日の 0:00 JST = 前日 15:00 UTC
const jstMidnight = (ymd) => ts(`${ymd}T00:00:00+09:00`);

const baseEvent = (overrides = {}) => ({
  eventName: 'テストイベント',
  date: jstMidnight('2026-12-22'),
  startTime: '10:00',
  endTime: '11:00',
  description: '説明',
  prefecture: '東京都',
  location: '渋谷クラブ',
  isPublished: true,
  ...overrides,
});

// ===== 日時の変換 =====

test('日本時間10:00〜11:00が、同じ日付の10:00〜11:00（+09:00）になる', () => {
  const { start, end } = buildEventTimes(baseEvent());
  assert.equal(start, '2026-12-22T10:00:00+09:00');
  assert.equal(end, '2026-12-22T11:00:00+09:00');
  // UTCに直すと 01:00〜02:00（以前は 10:00Z = 日本時間19:00 として送られていた）
  assert.equal(new Date(start).toISOString(), '2026-12-22T01:00:00.000Z');
  assert.equal(new Date(end).toISOString(), '2026-12-22T02:00:00.000Z');
});

test('Timestamp は日本時間の日付として解釈する（UTCでは前日でも当日になる）', () => {
  // 2026-12-22 0:00 JST は UTC では 2026-12-21 15:00
  assert.deepEqual(toJstDateParts(jstMidnight('2026-12-22')), { year: 2026, month: 12, day: 22 });
  // 日本時間 23:59 は当日のまま
  assert.deepEqual(toJstDateParts(ts('2026-12-22T23:59:00+09:00')), { year: 2026, month: 12, day: 22 });
});

test('文字列の日付 "YYYY-MM-DD" はそのまま日本時間の日付として扱う', () => {
  const { start, end } = buildEventTimes(baseEvent({ date: '2026-12-22' }));
  assert.equal(start, '2026-12-22T10:00:00+09:00');
  assert.equal(end, '2026-12-22T11:00:00+09:00');
});

test('日付境界: 0:00開始・23:59終了も同じ日付になる', () => {
  const { start, end } = buildEventTimes(baseEvent({ startTime: '00:00', endTime: '23:59' }));
  assert.equal(start, '2026-12-22T00:00:00+09:00');
  assert.equal(end, '2026-12-22T23:59:00+09:00');
});

test('終了が開始より前なら翌日の終了として扱う（年末の繰り上がり）', () => {
  const { start, end } = buildEventTimes(
    baseEvent({ date: jstMidnight('2026-12-31'), startTime: '22:00', endTime: '02:00' }),
  );
  assert.equal(start, '2026-12-31T22:00:00+09:00');
  assert.equal(end, '2027-01-01T02:00:00+09:00');
});

test('不正な日付・時刻はエラーにする', () => {
  assert.throws(() => buildEventTimes(baseEvent({ date: null })));
  assert.throws(() => buildEventTimes(baseEvent({ date: '2026-02-30' })));
  assert.throws(() => buildEventTimes(baseEvent({ startTime: '25:00' })));
  assert.throws(() => buildEventTimes(baseEvent({ endTime: undefined })));
});

test('予定の本文: 場所付きのタイトルとタイムゾーン', () => {
  const body = buildCalendarEventBody(baseEvent());
  assert.equal(body.summary, '【東京都】テストイベント');
  assert.equal(body.location, '東京都 渋谷クラブ');
  assert.equal(body.start.timeZone, 'Asia/Tokyo');
  assert.equal(body.status, 'confirmed');
  // 場所がなければ【】を付けない
  const noPlace = buildCalendarEventBody(baseEvent({ prefecture: null, location: null }));
  assert.equal(noPlace.summary, 'テストイベント');
  assert.equal(noPlace.location, '');
  // 都道府県がなければ、開催場所を【】に入れる
  const onlyLocation = buildCalendarEventBody(baseEvent({ prefecture: undefined }));
  assert.equal(onlyLocation.summary, '【渋谷クラブ】テストイベント');
  assert.equal(onlyLocation.location, '渋谷クラブ');
});

// ===== 予定IDと重複防止 =====

test('予定IDはイベントIDから一意に決まり、Googleカレンダーで使える文字だけを使う', () => {
  const id = calendarEventIdFor('AbC123xyz');
  assert.equal(id, calendarEventIdFor('AbC123xyz'));
  assert.notEqual(id, calendarEventIdFor('AbC123xyZ'));
  assert.match(id, /^[a-v0-9]{5,1024}$/);
});

test('公開イベントの作成 → 決まったIDで作成（再処理しても同じID）', () => {
  const plan = planCalendarSync('e1', null, baseEvent());
  assert.deepEqual(plan, { action: 'upsert', storedId: null, fallbackId: calendarEventIdFor('e1') });
});

test('同期IDを書き込んだだけの更新では、何もしない（無限ループしない）', () => {
  const before = baseEvent();
  const after = baseEvent({ googleCalendarEventId: 'abc', syncStatus: 'success', syncedAt: 'x' });
  assert.equal(planCalendarSync('e1', before, after).action, 'none');
});

test('内容の変更は、保存済みの予定IDを更新する', () => {
  const before = baseEvent({ googleCalendarEventId: 'abc' });
  const after = baseEvent({ googleCalendarEventId: 'abc', startTime: '12:00' });
  assert.deepEqual(planCalendarSync('e1', before, after), {
    action: 'upsert',
    storedId: 'abc',
    fallbackId: calendarEventIdFor('e1'),
  });
});

test('Timestamp の日付が同じなら変更なしとみなす', () => {
  const before = baseEvent({ googleCalendarEventId: 'abc' });
  const after = baseEvent({ googleCalendarEventId: 'abc', date: jstMidnight('2026-12-22') });
  assert.equal(planCalendarSync('e1', before, after).action, 'none');
});

test('予定IDが消えた公開イベントは、決まったIDで作り直す（重複しない）', () => {
  const before = baseEvent({ googleCalendarEventId: 'abc' });
  const after = baseEvent();
  const plan = planCalendarSync('e1', before, after);
  assert.equal(plan.action, 'upsert');
  assert.equal(plan.storedId, null);
  assert.equal(plan.fallbackId, calendarEventIdFor('e1'));
});

// ===== 公開状態 =====

test('isPublished がないイベントは公開として扱う（アプリの既定値と同じ）', () => {
  assert.equal(isPublishedEvent(baseEvent({ isPublished: undefined })), true);
  assert.equal(isPublishedEvent(baseEvent({ isPublished: false })), false);
  assert.equal(isPublishedEvent(null), false);
});

test('非公開で作成したイベントは同期しない', () => {
  const plan = planCalendarSync('e1', null, baseEvent({ isPublished: false }));
  assert.equal(plan.action, 'none');
});

test('非公開の内容を変更しても同期しない', () => {
  const plan = planCalendarSync(
    'e1',
    baseEvent({ isPublished: false }),
    baseEvent({ isPublished: false, eventName: '変更' }),
  );
  assert.equal(plan.action, 'none');
});

test('非公開 → 公開で登録する', () => {
  const plan = planCalendarSync('e1', baseEvent({ isPublished: false }), baseEvent({ isPublished: true }));
  assert.equal(plan.action, 'upsert');
});

test('公開 → 非公開で公式カレンダーから外し、保存した予定IDも消す', () => {
  const plan = planCalendarSync(
    'e1',
    baseEvent({ googleCalendarEventId: 'abc' }),
    baseEvent({ googleCalendarEventId: 'abc', isPublished: false }),
  );
  assert.deepEqual(plan, { action: 'delete', calendarEventId: 'abc', clearFirestore: true });
});

test('公開 → 非公開で予定IDが無くても、決まったIDの予定を外す', () => {
  const plan = planCalendarSync('e1', baseEvent(), baseEvent({ isPublished: false }));
  assert.deepEqual(plan, { action: 'delete', calendarEventId: calendarEventIdFor('e1'), clearFirestore: true });
});

test('削除: 公開中のイベントは予定を消す。非公開のまま消したものは何もしない', () => {
  assert.deepEqual(planCalendarSync('e1', baseEvent({ googleCalendarEventId: 'abc' }), null), {
    action: 'delete',
    calendarEventId: 'abc',
    clearFirestore: false,
  });
  assert.equal(planCalendarSync('e1', baseEvent({ isPublished: false }), null).action, 'none');
});

test('Google API のエラーから HTTP ステータスを取り出す', () => {
  assert.equal(httpStatusOf({ code: 409 }), 409);
  assert.equal(httpStatusOf({ code: '404' }), 404);
  assert.equal(httpStatusOf({ response: { status: 410 } }), 410);
  assert.equal(httpStatusOf({ code: 'ECONNRESET' }), undefined);
  assert.equal(httpStatusOf(new Error('x')), undefined);
});

// ===== 排他: トリガーの順番の入れ替わり・並行実行 =====

// Firestore の代わり。readLatest は呼ばれるたびに docs の次の内容を返す（最後の内容は繰り返す）
const readSequence = (docs) => {
  let i = 0;
  return async () => docs[Math.min(i++, docs.length - 1)];
};

test('syncLatest は変更時点ではなく、最新の内容で反映する', async () => {
  const synced = [];
  const latest = baseEvent({ eventName: '最新' });
  await syncLatest(
    baseEvent({ eventName: '古い' }),
    readSequence([latest]),
    async (_before, after) => { synced.push(after.eventName); },
    async () => assert.fail('削除されていない'),
  );
  assert.deepEqual(synced, ['最新']);
});

test('syncLatest は反映している間に内容が変わったら、もう一度反映する', async () => {
  const synced = [];
  await syncLatest(
    null,
    readSequence([baseEvent({ eventName: 'A' }), baseEvent({ eventName: 'B' })]),
    async (_before, after) => { synced.push(after.eventName); },
    async () => assert.fail('削除されていない'),
  );
  assert.deepEqual(synced, ['A', 'B']);
});

test('syncLatest はカレンダーに関係しない項目（同期結果など）の変化では繰り返さない', async () => {
  const synced = [];
  await syncLatest(
    null,
    readSequence([baseEvent(), baseEvent({ googleCalendarEventId: 'abc', syncStatus: 'success' })]),
    async (_before, after) => { synced.push(after.eventName); },
    async () => assert.fail('削除されていない'),
  );
  assert.equal(synced.length, 1);
});

test('syncLatest は削除済みのイベントを反映しない（onDelete に任せる）', async () => {
  let called = false;
  await syncLatest(
    baseEvent(),
    readSequence([null]),
    async () => { called = true; },
    async () => { called = true; },
  );
  assert.equal(called, false);
});

test('syncLatest は反映している間に削除されたら、反映した予定を消す', async () => {
  const deleted = [];
  await syncLatest(
    null,
    readSequence([baseEvent({ eventName: 'A' }), null]),
    async () => {},
    async (last) => { deleted.push(last.eventName); },
  );
  assert.deepEqual(deleted, ['A']);
});

test('syncLatest は内容が変わり続けても、上限の回数で止まる', async () => {
  let n = 0;
  let rounds = 0;
  await syncLatest(
    null,
    async () => baseEvent({ eventName: `v${n++}` }),
    async () => { rounds++; },
    async () => assert.fail('削除されていない'),
    3,
  );
  assert.equal(rounds, 3);
});
