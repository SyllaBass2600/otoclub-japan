/**
 * 利用者にそのまま見せてよい日本語のメッセージを持つ例外
 *
 * 原因になった例外の詳細は message に含めず、コンソールのログに出す。
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** 編集中に他の画面で先に同じデータが更新されていた（楽観ロック） */
export class UpdateConflictError extends AppError {
  constructor(message: string) {
    super(message, 'conflict');
    this.name = 'UpdateConflictError';
  }
}

/**
 * 利用者に見せるエラーメッセージ
 *
 * AppError ならその message を、それ以外（Firebase の例外や想定外のエラー）なら fallback を返す。
 * 生の例外の文字列は内部情報を含むため画面に出さない。
 */
export function userMessageOf(
  error: unknown,
  fallback = 'エラーが発生しました。時間をおいて再度お試しください',
): string {
  return error instanceof AppError ? error.message : fallback;
}
