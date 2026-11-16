import type { FirebaseOptions } from 'firebase/app';

/** ビルド時に vite.config.ts が ../env/<mode>.json の中身を埋め込む */
declare const __APP_ENV__: Record<string, unknown>;

export type AppEnv = 'dev' | 'stg' | 'prod';

export interface Env {
  appEnv: AppEnv | null;
  firebaseProjectId: string;
  firebaseApiKey: string;
  firebaseAppId: string;
  firebaseMessagingSenderId: string;
  firebaseAuthDomain: string;
  firebaseStorageBucket: string;
  firebaseMeasurementId: string;
  /** Auth / Firestore / Storage のエミュレーターに接続するか */
  useEmulator: boolean;
  emulatorHost: string;
}

const str = (raw: Record<string, unknown>, key: string, fallback = ''): string => {
  const v = raw[key];
  return typeof v === 'string' ? v : fallback;
};

export function parseEnv(raw: Record<string, unknown>): Env {
  const appEnvName = str(raw, 'APP_ENV');
  const useEmulatorRaw = raw['USE_EMULATOR'];
  return {
    appEnv: (['dev', 'stg', 'prod'] as const).find((e) => e === appEnvName) ?? null,
    firebaseProjectId: str(raw, 'FIREBASE_PROJECT_ID'),
    firebaseApiKey: str(raw, 'FIREBASE_API_KEY'),
    firebaseAppId: str(raw, 'FIREBASE_APP_ID'),
    firebaseMessagingSenderId: str(raw, 'FIREBASE_MESSAGING_SENDER_ID'),
    firebaseAuthDomain: str(raw, 'FIREBASE_AUTH_DOMAIN'),
    firebaseStorageBucket: str(raw, 'FIREBASE_STORAGE_BUCKET'),
    firebaseMeasurementId: str(raw, 'FIREBASE_MEASUREMENT_ID'),
    useEmulator: useEmulatorRaw === true || useEmulatorRaw === 'true',
    emulatorHost: str(raw, 'EMULATOR_HOST', 'localhost') || 'localhost',
  };
}

/** 足りない設定の名前（空なら起動できる） */
export function missingKeys(env: Env): string[] {
  const keys: string[] = [];
  if (env.appEnv === null) keys.push('APP_ENV');
  if (!env.firebaseProjectId) keys.push('FIREBASE_PROJECT_ID');
  if (!env.firebaseApiKey) keys.push('FIREBASE_API_KEY');
  if (!env.firebaseAppId) keys.push('FIREBASE_APP_ID');
  if (!env.firebaseMessagingSenderId) keys.push('FIREBASE_MESSAGING_SENDER_ID');
  if (!env.firebaseStorageBucket) keys.push('FIREBASE_STORAGE_BUCKET');
  // エミュレーターのログインは Google を通らないので、ドメインは要らない
  if (!env.useEmulator && !env.firebaseAuthDomain) keys.push('FIREBASE_AUTH_DOMAIN');
  // 本番の設定で、うっかりエミュレーターに繋がないように
  if (env.appEnv === 'prod' && env.useEmulator) keys.push('USE_EMULATOR（prod では false にする）');
  return keys;
}

export function firebaseOptionsOf(env: Env): FirebaseOptions {
  return {
    apiKey: env.firebaseApiKey,
    appId: env.firebaseAppId,
    messagingSenderId: env.firebaseMessagingSenderId,
    projectId: env.firebaseProjectId,
    authDomain: env.firebaseAuthDomain || undefined,
    storageBucket: env.firebaseStorageBucket,
    measurementId: env.firebaseMeasurementId || undefined,
  };
}

export const env: Env = parseEnv(typeof __APP_ENV__ === 'undefined' ? {} : __APP_ENV__);
