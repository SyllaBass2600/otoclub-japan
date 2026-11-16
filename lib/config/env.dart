import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;

/// アプリの環境
///
/// - [dev]: ローカル開発（エミュレーター）
/// - [stg]: ステージング（develop）
/// - [prod]: 本番（main）
enum AppEnv { dev, stg, prod }

/// 接続先の設定
///
/// ビルド時に `--dart-define-from-file=env/<環境>.json` で渡す（README.md）。
/// ここの値はビルド結果に埋め込まれ、Web では誰でも見られる。秘密情報は入れないこと。
class Env {
  const Env({
    required this.appEnvName,
    required this.firebaseProjectId,
    required this.firebaseApiKey,
    required this.firebaseAppId,
    required this.firebaseMessagingSenderId,
    required this.firebaseAuthDomain,
    required this.firebaseStorageBucket,
    required this.firebaseMeasurementId,
    required this.useEmulator,
    required this.emulatorHost,
  });

  /// ビルド時に渡された設定
  static const Env current = Env(
    appEnvName: String.fromEnvironment('APP_ENV'),
    firebaseProjectId: String.fromEnvironment('FIREBASE_PROJECT_ID'),
    firebaseApiKey: String.fromEnvironment('FIREBASE_API_KEY'),
    firebaseAppId: String.fromEnvironment('FIREBASE_APP_ID'),
    firebaseMessagingSenderId:
        String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID'),
    firebaseAuthDomain: String.fromEnvironment('FIREBASE_AUTH_DOMAIN'),
    firebaseStorageBucket: String.fromEnvironment('FIREBASE_STORAGE_BUCKET'),
    firebaseMeasurementId: String.fromEnvironment('FIREBASE_MEASUREMENT_ID'),
    useEmulator: bool.fromEnvironment('USE_EMULATOR'),
    emulatorHost:
        String.fromEnvironment('EMULATOR_HOST', defaultValue: 'localhost'),
  );

  final String appEnvName;
  final String firebaseProjectId;
  final String firebaseApiKey;
  final String firebaseAppId;
  final String firebaseMessagingSenderId;
  final String firebaseAuthDomain;
  final String firebaseStorageBucket;
  final String firebaseMeasurementId;

  /// Auth / Firestore / Storage のエミュレーターに接続するか
  final bool useEmulator;
  final String emulatorHost;

  /// 環境（APP_ENV が不正なら null）
  AppEnv? get appEnv {
    for (final env in AppEnv.values) {
      if (env.name == appEnvName) return env;
    }
    return null;
  }

  bool get isProd => appEnv == AppEnv.prod;

  /// 足りない設定の名前（空なら起動できる）
  List<String> get missingKeys {
    return [
      if (appEnv == null) 'APP_ENV',
      if (firebaseProjectId.isEmpty) 'FIREBASE_PROJECT_ID',
      if (firebaseApiKey.isEmpty) 'FIREBASE_API_KEY',
      if (firebaseAppId.isEmpty) 'FIREBASE_APP_ID',
      if (firebaseMessagingSenderId.isEmpty) 'FIREBASE_MESSAGING_SENDER_ID',
      if (firebaseStorageBucket.isEmpty) 'FIREBASE_STORAGE_BUCKET',
      // エミュレーターのログインは Google を通らないので、ドメインは要らない
      if (!useEmulator && firebaseAuthDomain.isEmpty) 'FIREBASE_AUTH_DOMAIN',
      // 本番の設定で、うっかりエミュレーターに繋がないように
      if (isProd && useEmulator) 'USE_EMULATOR（prod では false にする）',
    ];
  }

  /// Web 用の Firebase の接続設定
  FirebaseOptions get firebaseOptions => FirebaseOptions(
        apiKey: firebaseApiKey,
        appId: firebaseAppId,
        messagingSenderId: firebaseMessagingSenderId,
        projectId: firebaseProjectId,
        authDomain: firebaseAuthDomain.isEmpty ? null : firebaseAuthDomain,
        storageBucket: firebaseStorageBucket,
        measurementId:
            firebaseMeasurementId.isEmpty ? null : firebaseMeasurementId,
      );
}
