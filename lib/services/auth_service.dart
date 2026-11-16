import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import '../models/app_exception.dart';
import '../utils/logger.dart';

/// ログイン（Google アカウント）
///
/// Web ではポップアップ、Android では Firebase の Google ログイン画面を使う。
/// エミュレーターでは、エミュレーターのログイン画面（テスト用のアカウントを作れる）が開く。
class AuthService {
  AuthService._();

  static final AuthService instance = AuthService._();

  static const String _tag = 'AuthService';

  final FirebaseAuth _auth = FirebaseAuth.instance;

  /// ログイン中のユーザー（ログインしていなければ null）
  User? get currentUser => _auth.currentUser;

  /// ログイン状態の変化
  Stream<User?> get authStateChanges => _auth.authStateChanges();

  /// Google でログインする
  Future<UserCredential> signInWithGoogle() async {
    final provider = GoogleAuthProvider()
      ..setCustomParameters({'prompt': 'select_account'});
    try {
      return kIsWeb
          ? await _auth.signInWithPopup(provider)
          : await _auth.signInWithProvider(provider);
    } on FirebaseAuthException catch (e) {
      Logger.warning(_tag, 'Googleログインに失敗', error: e);
      throw AuthException(_messageOf(e), code: e.code);
    } catch (e) {
      Logger.error(_tag, 'Googleログインに失敗', error: e);
      throw AuthException('Googleログインに失敗しました');
    }
  }

  /// ログアウトする
  Future<void> signOut() async {
    try {
      await _auth.signOut();
    } catch (e) {
      Logger.error(_tag, 'ログアウトに失敗', error: e);
      throw AuthException('ログアウトに失敗しました');
    }
  }

  static String _messageOf(FirebaseAuthException e) {
    switch (e.code) {
      case 'popup-closed-by-user':
      case 'cancelled-popup-request':
      case 'web-context-canceled':
        return 'ログインがキャンセルされました';
      case 'popup-blocked':
        return 'ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください';
      case 'account-exists-with-different-credential':
        return 'このアカウントは既に別の方法で登録されています';
      case 'user-disabled':
        return 'このアカウントは無効になっています';
      case 'network-request-failed':
        return 'ネットワーク接続に失敗しました';
      case 'too-many-requests':
        return 'リクエストが多すぎます。しばらく待ってから再試行してください';
      default:
        return 'ログインに失敗しました（${e.code}）';
    }
  }
}
