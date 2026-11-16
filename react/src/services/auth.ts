import { FirebaseError } from 'firebase/app';
import { GoogleAuthProvider, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { AppError } from '../lib/errors';

/**
 * ログイン（Google アカウント、ポップアップ）
 *
 * エミュレーターでは、エミュレーターのログイン画面（テスト用のアカウントを作れる）が開く。
 */
export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e instanceof FirebaseError) {
      console.warn('[Auth] Googleログインに失敗', e.code);
      throw new AppError(messageOf(e.code), e.code);
    }
    console.error('[Auth] Googleログインに失敗', e);
    throw new AppError('Googleログインに失敗しました');
  }
}

export async function signOut(): Promise<void> {
  try {
    await fbSignOut(auth);
  } catch (e) {
    console.error('[Auth] ログアウトに失敗', e);
    throw new AppError('ログアウトに失敗しました');
  }
}

function messageOf(code: string): string {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'ログインがキャンセルされました';
    case 'auth/popup-blocked':
      return 'ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください';
    case 'auth/account-exists-with-different-credential':
      return 'このアカウントは既に別の方法で登録されています';
    case 'auth/user-disabled':
      return 'このアカウントは無効になっています';
    case 'auth/network-request-failed':
      return 'ネットワーク接続に失敗しました';
    case 'auth/too-many-requests':
      return 'リクエストが多すぎます。しばらく待ってから再試行してください';
    default:
      return `ログインに失敗しました（${code}）`;
  }
}
