import type { User } from 'firebase/auth';

/**
 * 管理者（全権限）のメールアドレス
 *
 * 権限の本体は firestore.rules / storage.rules の isAdmin。ここを変えるときは、ルールも同じアドレスにする。
 * アプリ側のこの判定は、編集ボタンを出すかどうかと、一覧の読み方を決めるだけ。
 */
export const ADMIN_EMAIL = 'syllabass2600@gmail.com';

type UserLike = Pick<User, 'email' | 'emailVerified'>;

/** 管理者か（Google が確認済みのメールアドレスで判定する。ルールと同じ条件） */
export function isAdminUser(user: UserLike | null | undefined): boolean {
  if (!user || !user.emailVerified) return false;
  return user.email?.trim().toLowerCase() === ADMIN_EMAIL;
}
