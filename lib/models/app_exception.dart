/// アプリケーション全体で使用される例外クラスの基底クラス
///
/// [message] は利用者にそのまま見せてよい日本語の文言にします。
/// 原因になった例外の詳細は [message] に含めず、ログ（`Logger.error`）に出します。
abstract class AppException implements Exception {
  final String message;
  final String? code;

  AppException(this.message, {this.code});

  @override
  String toString() {
    if (code != null) {
      return '$runtimeType($code): $message';
    }
    return '$runtimeType: $message';
  }
}

/// 認証関連のエラーを表す例外クラス
class AuthException extends AppException {
  AuthException(super.message, {super.code});
}

/// Firestore操作関連のエラーを表す例外クラス
class FirestoreException extends AppException {
  FirestoreException(super.message, {super.code});
}

/// 編集中に他の人が先に同じデータを更新していたことを表す例外クラス（楽観ロック）
class UpdateConflictException extends FirestoreException {
  UpdateConflictException(super.message) : super(code: 'conflict');
}

/// バリデーション関連のエラーを表す例外クラス
class ValidationException extends AppException {
  ValidationException(super.message) : super(code: null);
}

/// 画像の保存（Cloud Storage）関連のエラーを表す例外クラス
class StorageException extends AppException {
  StorageException(super.message, {super.code});
}

/// Googleカレンダー連携関連のエラーを表す例外クラス
class CalendarException extends AppException {
  CalendarException(super.message, {super.code});
}

/// 利用者に見せるエラーメッセージを返す
///
/// [error] が [AppException] ならその [AppException.message] を、
/// それ以外（Firebase の例外や想定外のエラー）なら [fallback] を返します。
/// 生の例外の文字列は内部情報を含むため画面に出しません。
String userMessageOf(
  Object? error, {
  String fallback = 'エラーが発生しました。時間をおいて再度お試しください',
}) {
  if (error is AppException) {
    return error.message;
  }
  return fallback;
}
