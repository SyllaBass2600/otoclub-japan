import 'package:firebase_auth/firebase_auth.dart';

/// 管理者（全権限）のメールアドレス
///
/// 管理者はすべてのイベントを読み・編集・削除できる（非公開のイベントも）。
/// 権限の本体は firestore.rules / storage.rules の isAdmin。ここを変えるときは、ルールも同じアドレスにする。
/// アプリ側のこの判定は、編集ボタンを出すかどうかと、一覧の読み方を決めるだけ。
const String adminEmail = 'syllabass2600@gmail.com';

/// [user] が管理者か（Google が確認済みのメールアドレスで判定する。ルールと同じ条件）
bool isAdminUser(User? user) {
  if (user == null || !user.emailVerified) return false;
  return user.email?.trim().toLowerCase() == adminEmail;
}
