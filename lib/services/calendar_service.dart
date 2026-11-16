import '../models/event_data.dart';

/// 個人カレンダーへの追加（利用者自身の Google カレンダー）
///
/// 「個人カレンダーに追加」は、Google カレンダーの予定作成画面を
/// 利用者自身のアカウントで開く URL を作るだけで、アプリからは書き込まない。
/// 公式カレンダーの編集権限がない利用者でも、自分のカレンダーに追加できる。
///
/// 公式カレンダーへの登録・更新・削除は Cloud Functions（functions/src/index.ts）だけが行う。
class CalendarService {
  CalendarService._();

  /// イベントの時刻は日本時間で入力されている
  static const String timeZone = 'Asia/Tokyo';

  /// Google カレンダーの予定作成画面の URL
  ///
  /// [start] / [end] は日本時間の「時計の時刻」として扱う（ctz=Asia/Tokyo）。
  /// 終了が開始より前の場合（例: 22:00〜02:00）は翌日の終了として扱う。
  static Uri buildGoogleCalendarAddUrl({
    required String title,
    required DateTime start,
    required DateTime end,
    String? details,
    String? location,
  }) {
    final actualEnd =
        end.isBefore(start) ? end.add(const Duration(days: 1)) : end;
    final params = <String, String>{
      'action': 'TEMPLATE',
      'text': title,
      'dates': '${_formatLocal(start)}/${_formatLocal(actualEnd)}',
      'ctz': timeZone,
    };
    if (details != null && details.trim().isNotEmpty) {
      params['details'] = details.trim();
    }
    if (location != null && location.trim().isNotEmpty) {
      params['location'] = location.trim();
    }
    return Uri.https('calendar.google.com', '/calendar/render', params);
  }

  /// イベント（events コレクション）を個人カレンダーに追加する URL
  static Uri urlForEvent(EventData event) {
    return buildGoogleCalendarAddUrl(
      title: event.eventName,
      start: event.startDateTime,
      end: event.endDateTime,
      details: event.description,
      location: event.placeLabel,
    );
  }

  /// YYYYMMDDTHHmmss（タイムゾーンなし。ctz で日本時間として解釈される）
  static String _formatLocal(DateTime d) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${d.year.toString().padLeft(4, '0')}${two(d.month)}${two(d.day)}'
        'T${two(d.hour)}${two(d.minute)}${two(d.second)}';
  }
}
