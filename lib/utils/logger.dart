import 'package:flutter/foundation.dart';

/// ログの重要度
enum LogLevel { debug, info, warning, error }

/// アプリケーション全体で使用されるログ記録ユーティリティクラス
///
/// `print` / `debugPrint` を直接呼ばず、このクラスを経由して出力します。
///
/// - [debug] / [info]: 開発時（`kDebugMode`）のみ出力
/// - [warning] / [error]: リリースビルドでも出力（スタックトレースは開発時のみ）
/// - すべての出力でメールアドレス・ユーザーID・APIキーなどを伏せ字にする
///
/// 個人情報（入力されたプロフィール内容、ユーザーデータ全体、画像URLなど）は
/// メッセージに含めないでください。
class Logger {
  Logger._();

  /// 出力先。テストで差し替えられるようにしている
  @visibleForTesting
  static void Function(String line) sink = _defaultSink;

  /// 開発時に debug / info を出すか。テストで差し替えられるようにしている
  @visibleForTesting
  static bool verbose = kDebugMode;

  static void _defaultSink(String line) => debugPrint(line);

  /// 開発時の動作確認用ログ
  static void debug(String tag, String message) {
    _emit(LogLevel.debug, tag, message);
  }

  /// 状態の変化など、開発時に追いたい情報
  static void info(String tag, String message) {
    _emit(LogLevel.info, tag, message);
  }

  /// 処理は続けられるが想定外のこと
  static void warning(String tag, String message, {Object? error}) {
    _emit(LogLevel.warning, tag, message, error: error);
  }

  /// 処理が失敗したこと
  static void error(
    String tag,
    String message, {
    Object? error,
    StackTrace? stackTrace,
  }) {
    _emit(
      LogLevel.error,
      tag,
      message,
      error: error,
      stackTrace: stackTrace,
    );
  }

  static void _emit(
    LogLevel level,
    String tag,
    String message, {
    Object? error,
    StackTrace? stackTrace,
  }) {
    final isDetail = level == LogLevel.debug || level == LogLevel.info;
    if (isDetail && !verbose) return;

    final buffer = StringBuffer()
      ..write('[${level.name.toUpperCase()}][$tag] ')
      ..write(sanitize(message));
    if (error != null) {
      buffer.write(': ${sanitize(error.toString())}');
    }
    if (stackTrace != null && verbose) {
      buffer.write('\n$stackTrace');
    }
    sink(buffer.toString());
  }

  /// データベース操作やその他の重要な操作のログを記録する
  ///
  /// [operation]: 操作の種類（例: 'read', 'write', 'update', 'delete'）
  /// [userId]: 操作を実行したユーザーのID
  /// [collectionPath]: 操作対象のFirestoreコレクションパス
  /// [success]: 操作が成功したかどうか
  /// [error]: 操作が失敗した場合のエラーメッセージ（オプション）
  static void logOperation({
    required String operation,
    required String userId,
    required String collectionPath,
    required bool success,
    String? error,
  }) {
    final message = 'operation=$operation '
        'user=${maskId(userId)} '
        'path=$collectionPath '
        'success=$success';
    if (success) {
      debug('Operation', message);
    } else {
      warning('Operation', message, error: error);
    }
  }

  /// IDを先頭8文字だけ残して伏せる
  ///
  /// ログでユーザーを区別できる程度に残し、完全なIDは出さない
  static String maskId(String? id) {
    if (id == null || id.isEmpty) {
      return '[EMPTY]';
    }
    return id.length > 8 ? '${id.substring(0, 8)}...' : id;
  }

  /// メッセージから機密情報を伏せる
  ///
  /// - `users/<id>` → `users/[REDACTED]`
  /// - メールアドレスのドメイン → `@[REDACTED]`
  /// - APIキー・プロジェクトID・アプリID → `[REDACTED]`
  @visibleForTesting
  static String sanitize(String text) {
    var sanitized = text.replaceAll(
      RegExp(r'users/[^/\s]+'),
      'users/[REDACTED]',
    );

    sanitized = sanitized.replaceAll(
      RegExp(r'@[\w.-]+\.[A-Za-z]{2,}'),
      '@[REDACTED]',
    );

    sanitized = sanitized.replaceAllMapped(
      RegExp(
        r'(api[_-]?key|project[_-]?id|app[_-]?id)([:=\s]+)[^\s,}&]+',
        caseSensitive: false,
      ),
      (m) => '${m[1]}${m[2]}[REDACTED]',
    );

    return sanitized;
  }
}
