import { useEffect, useRef, useState } from 'react';
import { MdLogin, MdLogout } from 'react-icons/md';
import { isAdminUser } from '../config/admin';
import { useAuth } from '../hooks/useAuth';
import { userMessageOf } from '../lib/errors';
import { signInWithGoogle, signOut } from '../services/auth';
import { useToast } from './Toast';

/** ヘッダー右のログイン / アカウントのボタン */
export function AccountButton({ signingIn, onSignIn }: { signingIn: boolean; onSignIn: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!user) {
    return (
      <button type="button" className="btn btn-header" onClick={onSignIn} disabled={signingIn}>
        {signingIn ? <span className="spinner spinner-small spinner-white" /> : <MdLogin />}
        ログイン
      </button>
    );
  }

  const name = user.displayName?.trim() || user.email || 'ログイン中';
  return (
    <div className="account" ref={menuRef}>
      <button
        type="button"
        className="avatar"
        aria-label="アカウント"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {user.photoURL ? (
          <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span>{Array.from(name)[0]}</span>
        )}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-label">{isAdminUser(user) ? `${name}（管理者）` : name}</div>
          <hr />
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={async () => {
              setOpen(false);
              try {
                await signOut();
              } catch (e) {
                toast.error(userMessageOf(e));
              }
            }}
          >
            <MdLogout /> ログアウト
          </button>
        </div>
      )}
    </div>
  );
}

/** ログイン処理（ボタンの表示状態つき）。CalendarPage から使う */
export function useSignIn() {
  const toast = useToast();
  const [signingIn, setSigningIn] = useState(false);
  const signIn = async (): Promise<boolean> => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
      return true;
    } catch (e) {
      toast.error(userMessageOf(e));
      return false;
    } finally {
      setSigningIn(false);
    }
  };
  return { signingIn, signIn };
}
