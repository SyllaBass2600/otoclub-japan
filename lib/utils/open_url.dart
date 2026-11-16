// 外部URLを開く。Web では新しいタブで開き、それ以外では開けないため false を返す。
// （url_launcher を追加せずに済ませるため、package:web で実装している）
export 'open_url_stub.dart' if (dart.library.js_interop) 'open_url_web.dart';
