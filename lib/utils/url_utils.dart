/// イベントの公式リンクなどで使う URL の検証・整形
class UrlUtils {
  UrlUtils._();

  /// http / https で、ホスト名がある URL か
  static bool isValidHttpUrl(String? value) {
    if (value == null) return false;
    final trimmed = value.trim();
    // Uri.tryParse は途中の空白を許すため、ここで弾く
    if (trimmed.contains(RegExp(r'\s'))) return false;
    final uri = Uri.tryParse(trimmed);
    if (uri == null) return false;
    return (uri.scheme == 'http' || uri.scheme == 'https') &&
        uri.host.isNotEmpty;
  }

  /// フォームのバリデーター（空欄は許可する）
  static String? validateOptionalHttpUrl(String? value) {
    if (value == null || value.trim().isEmpty) return null;
    if (!isValidHttpUrl(value)) {
      return 'http:// または https:// で始まるURLを入力してください';
    }
    return null;
  }

  /// 入力値を保存用に整える（空欄は null）
  static String? normalizeOptional(String? value) {
    final trimmed = value?.trim() ?? '';
    return trimmed.isEmpty ? null : trimmed;
  }
}
