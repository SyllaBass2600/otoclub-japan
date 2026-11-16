import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'config/env.dart';
import 'screens/events/calendar_screen.dart';
import 'theme/app_theme.dart';
import 'utils/logger.dart';

/// アプリの名前（ブラウザのタブ・ヘッダーに出す）
const String appName = '日本音クラ情報局';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  FlutterError.onError = (FlutterErrorDetails details) {
    FlutterError.presentError(details);
    Logger.error('App', 'Flutter のエラー',
        error: details.exception, stackTrace: details.stack);
  };

  // 日本語ロケールを初期化（曜日の表示に使う）
  await initializeDateFormatting('ja_JP', null);

  // 環境ファイル（--dart-define-from-file=env/<環境>.json）の付け忘れに気付けるようにする
  final missing = Env.current.missingKeys;
  if (missing.isNotEmpty) {
    Logger.error('App', '環境の設定が足りません: ${missing.join(', ')}');
    runApp(EnvErrorApp(missingKeys: missing));
    return;
  }

  await Firebase.initializeApp(options: Env.current.firebaseOptions);

  // ローカル開発では Auth / Firestore / Storage のエミュレーターに接続する
  if (Env.current.useEmulator) {
    await _connectEmulators(Env.current.emulatorHost);
  }

  runApp(const OtoclubApp());
}

/// エミュレーターに接続する（ポートは firebase.json の emulators と揃える）
Future<void> _connectEmulators(String host) async {
  try {
    await FirebaseAuth.instance.useAuthEmulator(host, 9100);
    FirebaseFirestore.instance.useFirestoreEmulator(host, 8180);
    await FirebaseStorage.instance.useStorageEmulator(host, 9200);
    Logger.info('App', 'エミュレーターに接続しました ($host)');
  } catch (e) {
    Logger.warning('App', 'エミュレーターへの接続に失敗', error: e);
  }
}

class OtoclubApp extends StatelessWidget {
  const OtoclubApp({super.key});

  @override
  Widget build(BuildContext context) {
    final env = Env.current.appEnv;
    final isProd = env == null || env == AppEnv.prod;
    return MaterialApp(
      title: isProd ? appName : '【${env.name.toUpperCase()}】$appName',
      locale: const Locale('ja', 'JP'),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('ja', 'JP')],
      theme: AppTheme.light(),
      debugShowCheckedModeBanner: false,
      // 本番以外では、画面の隅に環境名を出す
      builder: (context, child) => isProd
          ? child!
          : Banner(
              message: env.name.toUpperCase(),
              location: BannerLocation.bottomStart,
              child: child,
            ),
      home: const CalendarScreen(),
    );
  }
}

/// 環境の設定が足りないときの画面
class EnvErrorApp extends StatelessWidget {
  const EnvErrorApp({super.key, required this.missingKeys});

  final List<String> missingKeys;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              '環境の設定が足りません: ${missingKeys.join(', ')}\n'
              '${kIsWeb ? 'flutter run -d chrome' : 'flutter run'} '
              '--dart-define-from-file=env/dev.json で起動してください',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
    );
  }
}
