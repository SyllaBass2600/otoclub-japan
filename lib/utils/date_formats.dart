import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// 画面に出す日付・時刻の書式
///
/// 書式を画面ごとに手で組み立てない。曜日を含む書式は 'ja_JP' のロケールデータを使うため、
/// main.dart の initializeDateFormatting('ja_JP') の後に呼ぶこと。
class DateFormats {
  DateFormats._();

  /// 2026年1月5日
  static String date(DateTime d) => DateFormat('y年M月d日').format(d);

  /// 2026年1月5日 09:30
  static String dateTime(DateTime d) => DateFormat('y年M月d日 HH:mm').format(d);

  /// 2026年 1月
  static String yearMonth(DateTime d) => DateFormat('y年 M月').format(d);

  /// 1月5日(月)
  static String monthDayWeekday(DateTime d) =>
      DateFormat('M月d日(E)', 'ja_JP').format(d);

  /// 1/5 09:30
  static String shortDateTime(DateTime d) => DateFormat('M/d HH:mm').format(d);

  /// 09:30
  static String time(int hour, int minute) =>
      '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';

  /// 09:30（TimeOfDay）
  static String timeOfDay(TimeOfDay t) => time(t.hour, t.minute);
}
