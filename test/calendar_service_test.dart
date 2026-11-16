import 'package:flutter_test/flutter_test.dart';
import 'package:otoclub_japan/models/event_data.dart';
import 'package:otoclub_japan/services/calendar_service.dart';

void main() {
  group('CalendarService.buildGoogleCalendarAddUrl（個人カレンダーに追加）', () {
    test('利用者自身の Google カレンダーの予定作成画面を開く URL になる', () {
      final url = CalendarService.buildGoogleCalendarAddUrl(
        title: 'テストイベント',
        start: DateTime(2026, 12, 22, 10, 0),
        end: DateTime(2026, 12, 22, 11, 0),
        details: '説明',
        location: '東京都',
      );

      expect(url.scheme, 'https');
      expect(url.host, 'calendar.google.com');
      expect(url.path, '/calendar/render');
      expect(url.queryParameters['action'], 'TEMPLATE');
      expect(url.queryParameters['text'], 'テストイベント');
      // 日本時間の時計の時刻のまま（ctz で解釈される）
      expect(url.queryParameters['dates'], '20261222T100000/20261222T110000');
      expect(url.queryParameters['ctz'], 'Asia/Tokyo');
      expect(url.queryParameters['details'], '説明');
      expect(url.queryParameters['location'], '東京都');
      // 公式（共有）カレンダーのIDを含まない
      expect(url.toString(), isNot(contains('group.calendar.google.com')));
    });

    test('終了が開始より前なら翌日の終了にする（年末の繰り上がり）', () {
      final url = CalendarService.buildGoogleCalendarAddUrl(
        title: 'オールナイト',
        start: DateTime(2026, 12, 31, 22, 0),
        end: DateTime(2026, 12, 31, 2, 0),
      );
      expect(url.queryParameters['dates'], '20261231T220000/20270101T020000');
    });

    test('空の説明・場所は付けない', () {
      final url = CalendarService.buildGoogleCalendarAddUrl(
        title: 'イベント',
        start: DateTime(2026, 1, 5, 9, 5),
        end: DateTime(2026, 1, 5, 10, 0),
        details: '  ',
        location: null,
      );
      expect(url.queryParameters.containsKey('details'), isFalse);
      expect(url.queryParameters.containsKey('location'), isFalse);
      expect(url.queryParameters['dates'], '20260105T090500/20260105T100000');
    });

    test('EventData の日付と開始・終了時刻から URL を作る', () {
      final event = EventData(
        id: 'e1',
        eventName: '日本音クラ情報局',
        date: DateTime(2026, 12, 22),
        startTime: '10:00',
        endTime: '18:30',
        description: '',
        location: '大阪府',
        createdAt: DateTime(2026, 10, 1),
        createdBy: 'u1',
      );
      final url = CalendarService.urlForEvent(event);
      expect(url.queryParameters['text'], '日本音クラ情報局');
      expect(url.queryParameters['dates'], '20261222T100000/20261222T183000');
      expect(url.queryParameters['location'], '大阪府');
    });
  });

  group('EventData.toFirestore', () {
    test('googleCalendarEventId を含めない（Cloud Functions だけが書き込む）', () {
      final event = EventData(
        id: 'e1',
        eventName: '日本音クラ情報局',
        date: DateTime(2026, 12, 22),
        startTime: '10:00',
        endTime: '11:00',
        description: '',
        createdAt: DateTime(2026, 10, 1),
        createdBy: 'u1',
        googleCalendarEventId: 'abc',
        isPublished: false,
      );
      final map = event.toFirestore();
      expect(map.containsKey('googleCalendarEventId'), isFalse);
      expect(map['isPublished'], isFalse);
    });
  });
}
