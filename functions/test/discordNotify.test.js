// Discord 通知の文面・対象期間のテスト（実行: cd functions && npm test）
// 以前の GAS（Google カレンダーから Discord へ通知）と同じ結果になることを確かめる。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildReminderMessages,
  collectReminderEvents,
  dateQueryRange,
  describe,
  reminderWindow,
  splitMessage,
} = require('../lib/discordNotify');

// Firestore Timestamp の代わり
const ts = (iso) => {
  const d = new Date(iso);
  return { toDate: () => d, toMillis: () => d.getTime() };
};
const jstMidnight = (ymd) => ts(`${ymd}T00:00:00+09:00`);

const ev = (overrides = {}) => ({
  eventName: '音クラナイト',
  date: jstMidnight('2026-11-16'),
  startTime: '19:00',
  endTime: '23:00',
  description: '',
  prefecture: '東京都',
  location: '渋谷クラブ',
  isPublished: true,
  ...overrides,
});

// ===== 対象期間 =====

test('日次: 実行した日の 10:00 から 24 時間（10 時台に遅れて実行しても起点は 10:00）', () => {
  const w = reminderWindow(new Date('2026-11-16T10:37:00+09:00'), 1);
  assert.equal(w.start.toISOString(), new Date('2026-11-16T10:00:00+09:00').toISOString());
  assert.equal(w.end.toISOString(), new Date('2026-11-17T10:00:00+09:00').toISOString());
  assert.equal(w.dateKey, '2026-11-16');
});

test('週次: 月曜 10:00 から 7 日間', () => {
  const w = reminderWindow(new Date('2026-11-16T10:00:05+09:00'), 7);
  assert.equal(w.end.toISOString(), new Date('2026-11-23T10:00:00+09:00').toISOString());
});

test('UTC では前日でも、日本時間の日付で期間を決める', () => {
  // 日本時間 11/16 0:30 は UTC では 11/15
  const w = reminderWindow(new Date('2026-11-15T15:30:00Z'), 1);
  assert.equal(w.dateKey, '2026-11-16');
});

test('Firestore は起点の日の 0:00 から読む（date はその日の 0:00 で保存される）', () => {
  const r = dateQueryRange(reminderWindow(new Date('2026-11-16T10:00:00+09:00'), 1));
  assert.equal(r.from.toISOString(), new Date('2026-11-16T00:00:00+09:00').toISOString());
  assert.equal(r.until.toISOString(), new Date('2026-11-17T10:00:00+09:00').toISOString());
});

// ===== 対象のイベント =====

test('10:00 より前に始まるイベントは除き、翌日 10:00 より前の深夜のイベントは含める', () => {
  const w = reminderWindow(new Date('2026-11-16T10:00:00+09:00'), 1);
  const events = collectReminderEvents([
    ev({ eventName: '朝', startTime: '09:00', endTime: '11:00' }),
    ev({ eventName: '夜', startTime: '19:00' }),
    ev({ eventName: 'ちょうど', startTime: '10:00' }),
    ev({ eventName: '翌日深夜', date: jstMidnight('2026-11-17'), startTime: '02:00', endTime: '05:00' }),
    ev({ eventName: '翌日10時', date: jstMidnight('2026-11-17'), startTime: '10:00' }),
  ], w);
  assert.deepEqual(events.map((e) => e.title), ['【東京都】ちょうど', '【東京都】夜', '【東京都】翌日深夜']);
});

test('非公開のイベントと、日時が壊れたイベントは送らない', () => {
  const w = reminderWindow(new Date('2026-11-16T10:00:00+09:00'), 1);
  const events = collectReminderEvents([
    ev({ isPublished: false }),
    ev({ startTime: 'あとで' }),
    ev({ date: null }),
  ], w);
  assert.equal(events.length, 0);
});

test('詳細: 説明・公式サイト・X を続けて出し、何もなければ「詳細なし」', () => {
  assert.equal(describe(ev()), '詳細なし');
  assert.equal(
    describe(ev({ description: 'DJ: A\r\nVJ: B', websiteUrl: 'https://example.com', twitterUrl: 'https://x.com/a' })),
    'DJ: A\nVJ: B\nhttps://example.com\nhttps://x.com/a',
  );
});

// ===== 文面（GAS と同じ） =====

test('日次の文面: @everyone・見出し・「タイトル / HH:mm~ / 詳細」を空行で区切る', () => {
  const w = reminderWindow(new Date('2026-11-16T10:00:00+09:00'), 1);
  const events = collectReminderEvents([
    ev({ eventName: 'B', startTime: '21:00', description: '詳細B' }),
    ev({ eventName: 'A', startTime: '19:00' }),
  ], w);
  assert.deepEqual(buildReminderMessages('daily', events), [
    '@everyone\n↓↓↓本日の音クラはこちら↓↓↓\n' +
      '【東京都】A\n19:00~\n詳細なし\n\n' +
      '【東京都】B\n21:00~\n詳細B',
  ]);
});

test('週次の文面: 日付（■M月d日）ごとにまとめる', () => {
  const w = reminderWindow(new Date('2026-11-16T10:00:00+09:00'), 7);
  const events = collectReminderEvents([
    ev({ eventName: 'A', date: jstMidnight('2026-11-16') }),
    ev({ eventName: 'B', date: jstMidnight('2026-11-16'), startTime: '20:00' }),
    ev({ eventName: 'C', date: jstMidnight('2026-11-21'), prefecture: null, location: null }),
  ], w);
  assert.deepEqual(buildReminderMessages('weekly', events), [
    '@everyone\n↓↓↓今週の音クラはこちら↓↓↓\n' +
      '■11月16日\n【東京都】A\n19:00~\n詳細なし\n\n' +
      '【東京都】B\n20:00~\n詳細なし\n\n' +
      '■11月21日\nC\n19:00~\n詳細なし',
  ]);
});

test('0件なら送らない', () => {
  assert.deepEqual(buildReminderMessages('daily', []), []);
  assert.deepEqual(buildReminderMessages('weekly', []), []);
});

test('2000文字を超える場合は、イベントの区切りで複数のメッセージに分ける', () => {
  const w = reminderWindow(new Date('2026-11-16T10:00:00+09:00'), 1);
  const events = collectReminderEvents(
    Array.from({ length: 12 }, (_, i) => ev({ eventName: `E${i}`, description: 'あ'.repeat(300) })),
    w,
  );
  const messages = buildReminderMessages('daily', events);
  assert.ok(messages.length > 1);
  for (const m of messages) assert.ok(m.length <= 2000, `length ${m.length}`);
  // @everyone は1通目だけ
  assert.ok(messages[0].startsWith('@everyone\n'));
  assert.ok(messages.slice(1).every((m) => !m.includes('@everyone')));
  // イベントが途中で切れていない
  assert.equal(messages.join('\n\n').split('19:00~').length - 1, 12);
});

test('1つのブロックが上限を超える場合は途中で切る', () => {
  const parts = splitMessage('H', ['x'.repeat(25)], 10);
  assert.deepEqual(parts, ['H', 'x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
});

// ===== カード（embed）形式 =====

const { buildReminderPayloads, eventEmbed, httpUrl } = require('../lib/discordNotify');

test('カード: フライヤー画像・タイトルのリンク・公式サイト / X のリンクを付ける', () => {
  const w = reminderWindow(new Date('2026-11-16T10:00:00+09:00'), 7);
  const [e] = collectReminderEvents([ev({
    description: 'DJ: A',
    websiteUrl: 'https://example.com/n',
    twitterUrl: 'https://x.com/a',
    flyerImageUrl: 'https://img.example.com/flyer.jpg',
  })], w);
  assert.deepEqual(eventEmbed('weekly', e), {
    title: '【東京都】音クラナイト',
    url: 'https://example.com/n',
    description: '**■11月16日 19:00~**\n📍 東京都 渋谷クラブ\nDJ: A\n[公式サイト](https://example.com/n)　[Xはこちらから](https://x.com/a)',
    image: { url: 'https://img.example.com/flyer.jpg' },
  });
});

test('カード: フライヤーがなければその他画像の1枚目。どちらもなく、リンクもなければ付けない', () => {
  const w = reminderWindow(new Date('2026-11-16T10:00:00+09:00'), 1);
  const [a, b] = collectReminderEvents([
    ev({ eventName: 'A', otherImageUrls: ['https://img.example.com/1.jpg', 'https://img.example.com/2.jpg'] }),
    ev({ eventName: 'B', startTime: '20:00', prefecture: null, location: null, flyerImageUrl: 'ftp://x' }),
  ], w);
  assert.deepEqual(eventEmbed('daily', a).image, { url: 'https://img.example.com/1.jpg' });
  assert.deepEqual(eventEmbed('daily', b), { title: 'B', description: '**20:00~**' });
});

test('http(s) 以外の URL は使わない', () => {
  assert.equal(httpUrl('javascript:alert(1)'), null);
  assert.equal(httpUrl(' https://a.example/x '), 'https://a.example/x');
  assert.equal(httpUrl(undefined), null);
});

test('カード形式: 1通目に @everyone と見出し、カードは10枚ずつに分ける', () => {
  const w = reminderWindow(new Date('2026-11-16T10:00:00+09:00'), 1);
  const events = collectReminderEvents(Array.from({ length: 23 }, (_, i) => ev({ eventName: `E${i}` })), w);
  const payloads = buildReminderPayloads('daily', events, 'embed');
  assert.deepEqual(payloads.map((p) => p.embeds.length), [10, 10, 3]);
  assert.equal(payloads[0].content, '@everyone\n↓↓↓本日の音クラはこちら↓↓↓');
  assert.ok(payloads.slice(1).every((p) => p.content === undefined));
});

test('カード形式: 1通のカードの文字数の合計が6000を超えないように分ける', () => {
  const w = reminderWindow(new Date('2026-11-16T10:00:00+09:00'), 1);
  const events = collectReminderEvents(
    Array.from({ length: 5 }, (_, i) => ev({ eventName: `E${i}`, description: 'あ'.repeat(2500) })), w);
  const payloads = buildReminderPayloads('daily', events, 'embed');
  for (const p of payloads) {
    const total = p.embeds.reduce((n, e) => n + e.title.length + e.description.length, 0);
    assert.ok(total <= 6000, `total ${total}`);
  }
  assert.equal(payloads.flatMap((p) => p.embeds).length, 5);
});

test('文字だけの形式は、GAS と同じ文面を content で送る。0件なら送らない', () => {
  const w = reminderWindow(new Date('2026-11-16T10:00:00+09:00'), 1);
  const events = collectReminderEvents([ev()], w);
  assert.deepEqual(buildReminderPayloads('daily', events, 'text'), [
    { content: '@everyone\n↓↓↓本日の音クラはこちら↓↓↓\n【東京都】音クラナイト\n19:00~\n詳細なし' },
  ]);
  assert.deepEqual(buildReminderPayloads('daily', [], 'embed'), []);
});
