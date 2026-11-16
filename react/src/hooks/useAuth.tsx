import { onAuthStateChanged, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { auth } from '../config/firebase';

interface AuthState {
  /** ログイン中のユーザー（ログインしていなければ null） */
  user: User | null;
  /** 最初のログイン状態の確認が済んだか */
  ready: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, ready: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: auth.currentUser, ready: false });
  useEffect(() => onAuthStateChanged(auth, (user) => setState({ user, ready: true })), []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthState => useContext(AuthContext);
