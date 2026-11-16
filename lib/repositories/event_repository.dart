import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/app_exception.dart';
import '../models/event_data.dart';
import '../utils/combine_latest.dart';

/// イベント（events）の読み書き
///
/// 公開中のイベントは誰でも（ログインしていなくても）読める。
/// 非公開のイベントは、登録した本人と管理者だけが読める（firestore.rules）。
/// ルールは絞り込み条件ではないため、クエリには isPublished == true か
/// createdBy == 自分 を付ける（付けないとクエリ全体が拒否される）。管理者は付けずに全件を読む。
class EventRepository {
  EventRepository({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  static final EventRepository instance = EventRepository();

  static const String collection = 'events';

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _events =>
      _firestore.collection(collection);

  /// 新しいイベントのID（画像の保存先と揃えるため、保存前に決める）
  String newEventId() => _events.doc().id;

  /// イベントの変化を監視する（ない場合・削除された場合は null）
  Stream<EventData?> watchEvent(String id) {
    return _events.doc(id).snapshots().map((snap) {
      final data = snap.data();
      return data == null ? null : EventData.fromFirestore(data, snap.id);
    });
  }

  /// [from] 以上 [until] 未満の日付のイベント（日付順）
  ///
  /// 公開中のイベントと、[myUid] が登録したイベント（非公開を含む）を合わせる。
  /// ログインしていなければ（[myUid] が null）公開中のイベントだけ。
  /// 管理者（[includeAll]）は、非公開を含むすべてのイベント。
  /// 必要な複合インデックスは firestore.indexes.json にある。
  Stream<List<EventData>> watchEventsBetween(
    DateTime from,
    DateTime until, {
    String? myUid,
    bool includeAll = false,
  }) {
    Query<Map<String, dynamic>> inRange(Query<Map<String, dynamic>> q) => q
        .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(from))
        .where('date', isLessThan: Timestamp.fromDate(until))
        .orderBy('date');

    if (includeAll) return inRange(_events).snapshots().map(_toEvents);

    final published = inRange(_events.where('isPublished', isEqualTo: true))
        .snapshots()
        .map(_toEvents);
    if (myUid == null) return published;

    final mine = inRange(_events.where('createdBy', isEqualTo: myUid))
        .snapshots()
        .map(_toEvents);
    return combineLatest(published, mine, (a, b) {
      final ids = {for (final e in a) e.id};
      return [...a, ...b.where((e) => !ids.contains(e.id))]
        ..sort((x, y) => x.date.compareTo(y.date));
    });
  }

  /// イベントを作成する（[id] は newEventId で決めたもの）
  Future<void> create(String id, EventData event) {
    return _events.doc(id).set(event.toFirestore());
  }

  /// イベントを更新する
  ///
  /// 編集を始めてから保存するまでに別の画面で更新されていた場合は、上書きせずに
  /// [UpdateConflictException] を投げる（[EventData.version] で判定する楽観ロック）。
  Future<void> update(EventData event) {
    final ref = _events.doc(event.id);
    return _firestore.runTransaction((tx) async {
      final snap = await tx.get(ref);
      if (!snap.exists) {
        throw FirestoreException('イベントが見つかりません。削除された可能性があります',
            code: 'not-found');
      }
      final version = (snap.data()!['version'] as num?)?.toInt() ?? 0;
      if (version != event.version) {
        throw UpdateConflictException(
            '別の画面で先にこのイベントが更新されました。画面を開き直して、最新の内容で編集してください');
      }
      tx.update(ref, {
        ...event.toFirestoreForUpdate(),
        'version': version + 1,
      });
    });
  }

  /// イベントを削除する
  Future<void> delete(String id) => _events.doc(id).delete();

  static List<EventData> _toEvents(
      QuerySnapshot<Map<String, dynamic>> snapshot) {
    return snapshot.docs
        .map((doc) => EventData.fromFirestore(doc.data(), doc.id))
        .toList();
  }
}
