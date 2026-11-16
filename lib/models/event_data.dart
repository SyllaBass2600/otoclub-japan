import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../config/admin.dart';
import '../utils/constants.dart';
import '../utils/date_formats.dart';
import '../utils/firestore_value.dart';
import '../utils/logger.dart';
import 'event_status.dart';

/// イベントデータモデル
///
/// イベントはログインした個人が登録する（団体はない）。
/// 編集・削除できるのは登録した本人（[createdBy]）と管理者だけ（firestore.rules）。
class EventData {
  final String? id; // FirestoreドキュメントID
  final String eventName; // イベント名
  final DateTime date; // イベント日付
  final String startTime; // 開始時間 (HH:mm)
  final String endTime; // 終了時間 (HH:mm)
  final String description; // 詳細
  final DateTime createdAt; // 作成日時
  final String createdBy; // 登録した人（ユーザーID）。編集・削除できるのはこの人だけ

  /// 公式カレンダーの予定ID（Cloud Functions だけが書き込む）
  final String? googleCalendarEventId;

  /// 更新の版（楽観ロック用）。アプリの更新のたびに EventRepository.update が1つ増やす。
  /// 編集を始めた時点の値を持ち、保存時にサーバーの値と違えば、別の画面で先に更新されたと判断する
  final int version;

  /// その他画像の枚数の上限
  static const int maxOtherImages = 3;

  final String? flyerImageUrl; // フライヤー画像URL（A4縦長。一覧・詳細画面に表示）
  final List<String> otherImageUrls; // その他画像URL（最大 maxOtherImages 枚、並び順どおり）
  final String? prefecture; // 開催地の都道府県
  final String? location; // 開催場所（会場名・住所などの自由記述）
  final String? websiteUrl; // 公式サイトURL
  final String? twitterUrl; // Twitter/X URL
  final bool isPublished; // 公開状態（非公開は登録した本人にだけ見える）

  EventData({
    this.id,
    required this.eventName,
    required this.date,
    required this.startTime,
    required this.endTime,
    required this.description,
    required this.createdAt,
    required this.createdBy,
    this.googleCalendarEventId,
    this.version = 0,
    this.flyerImageUrl,
    this.otherImageUrls = const [],
    this.prefecture,
    this.location,
    this.websiteUrl,
    this.twitterUrl,
    this.isPublished = true,
  });

  /// FirestoreからEventDataを生成
  ///
  /// 日付のないイベント（壊れたデータ）は 1970年1月1日として扱い、例外にしない。
  /// createdAt は serverTimestamp の書き込み直後に null になるため、現在時刻で補う。
  factory EventData.fromFirestore(
      Map<String, dynamic> data, String documentId) {
    return EventData(
      id: documentId,
      eventName: data['eventName'] as String? ?? '',
      date: FirestoreValue.toDateTime(data['date']) ??
          DateTime.fromMillisecondsSinceEpoch(0),
      startTime: data['startTime'] as String? ?? '',
      endTime: data['endTime'] as String? ?? '',
      description: data['description'] as String? ?? '',
      createdAt: FirestoreValue.toDateTime(data['createdAt']) ?? DateTime.now(),
      createdBy: data['createdBy'] as String? ?? '',
      googleCalendarEventId: data['googleCalendarEventId'] as String?,
      version: (data['version'] as num?)?.toInt() ?? 0,
      flyerImageUrl: _nonEmpty(data['flyerImageUrl'] as String?),
      otherImageUrls: FirestoreValue.toStringList(data['otherImageUrls'])
          .where((url) => url.isNotEmpty)
          .toList(),
      prefecture: _nonEmpty(data['prefecture'] as String?),
      location: _nonEmpty((data['location'] as String?)?.trim()),
      websiteUrl: data['websiteUrl'] as String?,
      twitterUrl: data['twitterUrl'] as String?,
      isPublished: data['isPublished'] as bool? ?? true,
    );
  }

  /// 新規作成（set）用の内容。値のない項目は書き込まない
  ///
  /// googleCalendarEventId は含めない。公式カレンダーの予定IDは Cloud Functions だけが書き込むため、
  /// アプリの保存で上書き（古い値や null で消す）しないようにする。
  /// version も含めない（EventRepository が書き込む）。
  Map<String, dynamic> toFirestore() => FirestoreValue.withoutNulls(_fields());

  /// 更新（update）用の内容
  ///
  /// 作成日時・登録者は変えない。画面で消した値（URL・画像・会場など）は項目ごと削除する。
  Map<String, dynamic> toFirestoreForUpdate() {
    final fields = _fields()
      ..remove('createdAt')
      ..remove('createdBy');
    return FirestoreValue.nullsAsDelete(fields);
  }

  Map<String, dynamic> _fields() {
    return {
      'eventName': eventName,
      'date': Timestamp.fromDate(date),
      'startTime': startTime,
      'endTime': endTime,
      'description': description,
      'createdAt': Timestamp.fromDate(createdAt),
      'createdBy': createdBy,
      'flyerImageUrl': flyerImageUrl,
      'otherImageUrls': otherImageUrls,
      'prefecture': prefecture,
      'location': location,
      'websiteUrl': websiteUrl,
      'twitterUrl': twitterUrl,
      'isPublished': isPublished,
    };
  }

  static String? _nonEmpty(String? value) =>
      value == null || value.isEmpty ? null : value;

  /// [uid] の人が登録したイベントか
  bool isOwnedBy(String? uid) => uid != null && uid == createdBy;

  /// [user] が編集・削除できるか（登録した本人か管理者）
  bool canBeManagedBy(User? user) => isOwnedBy(user?.uid) || isAdminUser(user);

  /// 一覧に出す画像。フライヤーを優先し、なければその他画像の1枚目
  String? get listImageUrl =>
      flyerImageUrl ?? (otherImageUrls.isEmpty ? null : otherImageUrls.first);

  /// 詳細画面でスワイプ表示する画像（フライヤー → その他画像の順）
  List<String> get detailImageUrls => [
        ?flyerImageUrl,
        ...otherImageUrls,
      ];

  /// 開催地の表示（「都道府県 開催場所」。どちらもなければ null）
  String? get placeLabel {
    final parts = [
      if (_nonEmpty(prefecture) != null && prefectures.contains(prefecture))
        prefecture!,
      if (_nonEmpty(location?.trim()) != null) location!.trim(),
    ];
    return parts.isEmpty ? null : parts.join(' ');
  }

  /// 日付を人間が読める形式にフォーマット
  String get formattedDate => DateFormats.date(date);

  /// 開始・終了時間を表示用にフォーマット
  String get formattedTime => '$startTime～$endTime';

  /// 開始日時（日本時間の時計の時刻）
  DateTime get startDateTime => _timeOnDate(startTime, fallbackHour: 0, fallbackMinute: 0);

  /// 終了日時（日本時間の時計の時刻）
  DateTime get endDateTime => _timeOnDate(endTime, fallbackHour: 23, fallbackMinute: 59);

  DateTime _timeOnDate(
    String value, {
    required int fallbackHour,
    required int fallbackMinute,
  }) {
    try {
      final parts = value.split(':');
      if (parts.length < 2) {
        return DateTime(date.year, date.month, date.day, fallbackHour, fallbackMinute);
      }
      return DateTime(date.year, date.month, date.day, int.parse(parts[0]),
          int.parse(parts[1]));
    } catch (e) {
      Logger.warning('EventData', '時刻を解釈できません: $value', error: e);
      return DateTime(date.year, date.month, date.day, fallbackHour, fallbackMinute);
    }
  }

  /// イベントが過去かどうか
  bool get isPast => endDateTime.isBefore(DateTime.now());

  /// イベントが本日かどうか
  bool get isToday {
    final now = DateTime.now();
    return date.year == now.year && date.month == now.month && date.day == now.day;
  }

  /// イベントが進行中かどうか
  bool get isOngoing {
    final now = DateTime.now();
    return now.isAfter(startDateTime) && now.isBefore(endDateTime);
  }

  /// イベントが未来（これから）かどうか
  bool get isUpcoming => startDateTime.isAfter(DateTime.now());

  /// 開催状況
  EventStatus get status {
    if (isOngoing) return EventStatus.ongoing;
    if (isToday) return EventStatus.today;
    if (isPast) return EventStatus.past;
    if (isUpcoming) return EventStatus.upcoming;
    // 開始時刻ちょうど
    return EventStatus.ongoing;
  }
}
