import 'package:web/web.dart' as web;

/// 外部URLを新しいタブで開く（Web）
///
/// ポップアップがブロックされた場合は false を返す。
/// ブロックされないよう、ボタンのタップ処理の中で await を挟まずに呼ぶこと。
bool openExternalUrl(String url) {
  final opened = web.window.open(url, '_blank');
  return opened != null;
}
