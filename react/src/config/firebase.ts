import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { env, firebaseOptionsOf } from './env';

/**
 * Firebase の初期化（main.tsx で設定が揃っているのを確かめてから読み込む）
 *
 * ローカル開発では Auth / Firestore / Storage のエミュレーターに接続する
 * （ポートは firebase.json の emulators と揃える）。
 */
export const app = initializeApp(firebaseOptionsOf(env));
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

if (env.useEmulator) {
  const host = env.emulatorHost;
  try {
    connectAuthEmulator(auth, `http://${host}:9100`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8180);
    connectStorageEmulator(storage, host, 9200);
    console.info(`[App] エミュレーターに接続しました (${host})`);
  } catch (e) {
    console.warn('[App] エミュレーターへの接続に失敗', e);
  }
}
