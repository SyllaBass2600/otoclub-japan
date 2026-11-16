import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;

import '../models/app_exception.dart';
import '../utils/logger.dart';

/// 画像アップロードサービス（Cloud Storage for Firebase）
///
/// 保存先（storage.rules で書き込み権限を制御する）:
/// - イベント画像: `users/{uid}/events/{eventId}/{時刻}.jpg`（イベントを登録した本人だけが書き込める）
///
/// アップロード前に JPEG へ変換・圧縮する（最大幅 1200px、最大 1MB）。
/// フライヤー（A4 チラシ）画像は文字を読めるよう、最大幅 1600px・最大 1.5MB とする
/// （storage.rules の上限 2MB 未満に収まる）。
/// 戻り値はダウンロード URL（Firestore の flyerImageUrl / otherImageUrls に保存する）。
class ImageStorageService {
  ImageStorageService._({FirebaseStorage? storage})
      : _storageOverride = storage;

  static final ImageStorageService instance = ImageStorageService._();

  /// テスト用: 任意の FirebaseStorage を使うインスタンスを作る
  @visibleForTesting
  factory ImageStorageService.withStorage(FirebaseStorage storage) =>
      ImageStorageService._(storage: storage);

  final FirebaseStorage? _storageOverride;
  FirebaseStorage get _storage => _storageOverride ?? FirebaseStorage.instance;

  /// ファイル名の重複を防ぐ連番
  int _uploadCount = 0;

  /// 圧縮後の最大サイズ（KB）
  static const int maxSizeKB = 1024;

  /// 圧縮時の最大幅（px）
  static const int maxWidth = 1200;

  /// A4 チラシ画像の圧縮後の最大サイズ（KB）
  static const int flyerMaxSizeKB = 1536;

  /// A4 チラシ画像の圧縮時の最大幅（px）。A4 縦なら 1600×2263px
  static const int flyerMaxWidth = 1600;

  /// イベント画像の保存先（登録した本人のフォルダ）
  @visibleForTesting
  static String eventImageFolder(String ownerUid, String eventId) =>
      'users/$ownerUid/events/$eventId';

  /// イベント画像をアップロード
  Future<String> uploadEventImage(
    String ownerUid,
    String eventId,
    Uint8List imageBytes,
  ) {
    return _upload(eventImageFolder(ownerUid, eventId), imageBytes);
  }

  /// イベントの A4 チラシ画像をアップロード
  Future<String> uploadEventFlyerImage(
    String ownerUid,
    String eventId,
    Uint8List imageBytes,
  ) {
    return _upload(
      eventImageFolder(ownerUid, eventId),
      imageBytes,
      maxWidth: flyerMaxWidth,
      maxSizeKB: flyerMaxSizeKB,
    );
  }

  /// ダウンロード URL から画像を削除する
  ///
  /// Firebase Storage 以外の URL は何もしない。
  /// 削除に失敗しても例外は投げない（画像の掃除は本処理の成否に影響させない）。
  Future<void> deleteImageByUrl(String imageUrl) async {
    if (!isStorageUrl(imageUrl)) return;
    try {
      await _storage.refFromURL(imageUrl).delete();
    } catch (e) {
      Logger.warning('ImageStorageService', '画像の削除に失敗', error: e);
    }
  }

  /// Firebase Storage のダウンロード URL か
  static bool isStorageUrl(String url) {
    return url.startsWith('gs://') ||
        url.contains('firebasestorage.googleapis.com') ||
        url.contains('.firebasestorage.app') ||
        // エミュレーター（localhost:9199 など）
        url.contains('/v0/b/');
  }

  Future<String> _upload(
    String folder,
    Uint8List imageBytes, {
    int maxWidth = ImageStorageService.maxWidth,
    int maxSizeKB = ImageStorageService.maxSizeKB,
  }) async {
    try {
      final compressed = await compute(
        _compressWithOptions,
        (imageBytes, maxWidth, maxSizeKB),
      );
      // 複数枚を続けてアップロードしても同じ名前にならないよう、連番を付ける
      final fileName =
          '${DateTime.now().millisecondsSinceEpoch}_${_uploadCount++}.jpg';
      final ref = _storage.ref('$folder/$fileName');

      await ref.putData(
        compressed,
        SettableMetadata(
          contentType: 'image/jpeg',
          cacheControl: 'public, max-age=31536000',
        ),
      );

      return await ref.getDownloadURL();
    } on AppException {
      rethrow;
    } on FirebaseException catch (e, st) {
      Logger.error('ImageStorageService', '画像のアップロードに失敗',
          error: e, stackTrace: st);
      if (e.code == 'unauthorized') {
        throw StorageException(
            '画像をアップロードする権限がありません（イベントを登録した本人だけが画像を登録できます）',
            code: e.code);
      }
      throw StorageException('画像のアップロードに失敗しました', code: e.code);
    } catch (e, st) {
      Logger.error('ImageStorageService', '画像のアップロードに失敗',
          error: e, stackTrace: st);
      throw StorageException('画像のアップロードに失敗しました');
    }
  }

  /// compute に渡すため、引数を1つにまとめる
  static Uint8List _compressWithOptions((Uint8List, int, int) args) {
    final (imageBytes, maxWidth, maxSizeKB) = args;
    return compressImageForUpload(
      imageBytes,
      maxWidth: maxWidth,
      maxSizeKB: maxSizeKB,
    );
  }

  /// 画像を JPEG に変換して圧縮する（Isolate で実行）
  @visibleForTesting
  static Uint8List compressImageForUpload(
    Uint8List imageBytes, {
    int maxWidth = ImageStorageService.maxWidth,
    int maxSizeKB = ImageStorageService.maxSizeKB,
  }) {
    final maxSizeBytes = maxSizeKB * 1024;

    // 壊れたデータでは null を返さず RangeError などを投げることがある
    img.Image? decoded;
    try {
      decoded = img.decodeImage(imageBytes);
    } catch (_) {
      decoded = null;
    }
    if (decoded == null) {
      throw StorageException('画像を読み込めませんでした。JPEG / PNG などの画像を選んでください');
    }
    img.Image image = decoded;

    if (image.width > maxWidth) {
      image = img.copyResize(image, width: maxWidth);
    }

    int quality = 85;
    Uint8List compressed =
        Uint8List.fromList(img.encodeJpg(image, quality: quality));

    // 目標サイズに収まるまで品質を下げる
    while (compressed.length > maxSizeBytes && quality > 20) {
      quality -= 10;
      compressed = Uint8List.fromList(img.encodeJpg(image, quality: quality));
    }

    // それでも大きい場合は縮小する
    while (compressed.length > maxSizeBytes && image.width > 200) {
      image = img.copyResize(image, width: (image.width * 0.8).round());
      compressed = Uint8List.fromList(img.encodeJpg(image, quality: 60));
    }

    return compressed;
  }

  /// 画像サイズを取得（KB単位）
  static double getImageSizeKB(Uint8List imageBytes) {
    return imageBytes.length / 1024;
  }

  /// 画像サイズをフォーマットして表示
  static String formatImageSize(Uint8List imageBytes) {
    final sizeKB = getImageSizeKB(imageBytes);
    if (sizeKB < 1024) {
      return '${sizeKB.toStringAsFixed(1)} KB';
    } else {
      return '${(sizeKB / 1024).toStringAsFixed(1)} MB';
    }
  }
}
