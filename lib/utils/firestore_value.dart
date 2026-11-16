import 'package:cloud_firestore/cloud_firestore.dart';

/// Firestore の値とモデルの型の変換
///
/// 日時は Timestamp で保存するが、`serverTimestamp()` の書き込み直後（null）や、
/// 古いデータ（users/{uid}.createdAt は ISO 8601 の文字列）もあるため、型を確かめてから変換する。
class FirestoreValue {
  FirestoreValue._();

  /// 日時に変換する（Timestamp / DateTime / ISO 8601 文字列 / ミリ秒。それ以外と null は null）
  static DateTime? toDateTime(Object? value) {
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    if (value is String) return DateTime.tryParse(value);
    if (value is int) return DateTime.fromMillisecondsSinceEpoch(value);
    return null;
  }

  /// 文字列のリストに変換する（文字列以外の要素は除く）
  static List<String> toStringList(Object? value) {
    if (value is! List) return const [];
    return value.whereType<String>().toList();
  }

  /// 値が null の項目を除く
  ///
  /// 新規作成（set）で、値のない項目を null として書き込まないために使う。
  static Map<String, dynamic> withoutNulls(Map<String, dynamic> data) {
    return Map.fromEntries(data.entries.where((e) => e.value != null));
  }

  /// 更新（update）用に、値が null の項目を `FieldValue.delete()` にする
  ///
  /// 画面で消した値（URL・画像など）は項目ごと削除する。null を書き込んで残さない。
  static Map<String, dynamic> nullsAsDelete(Map<String, dynamic> data) {
    return data.map(
      (key, value) => MapEntry(key, value ?? FieldValue.delete()),
    );
  }
}
