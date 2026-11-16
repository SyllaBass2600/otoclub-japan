import 'package:flutter/material.dart';

/// 日本音クラ情報局のデザイントークン
///
/// 白と黒だけの、くっきりしたモノクロのデザイン。
/// 色で区別せず、黒の塗り・黒の枠線・太字で強弱を付ける。
/// 角はほぼ立て、影は使わず、黒い太めの枠線で区切る。
class AppColors {
  AppColors._();

  /// 主役の黒（ボタン・選択中・アイコン）
  static const Color primary = Color(0xFF000000);
  static const Color primaryDeep = Color(0xFF000000);

  /// 文字
  static const Color ink = Color(0xFF000000);
  static const Color inkMuted = Color(0xFF555555);

  static const Color background = Color(0xFFFFFFFF);
  static const Color surface = Color(0xFFFFFFFF);

  /// カードなどの枠線（黒）
  static const Color border = Color(0xFF000000);
  static const Color divider = Color(0xFFDDDDDD);

  /// 今日・画像の下地など、ごく薄い面
  static const Color selectedBackground = Color(0xFFF2F2F2);

  /// イベントのある日の印
  static const Color pinkAccent = Color(0xFF000000);
}

/// 角丸・枠線の共通寸法
class AppDimens {
  AppDimens._();

  static const double radius = 2;
  static const double borderWidth = 2;
}

class AppTheme {
  AppTheme._();

  static ThemeData light() {
    const black = AppColors.primary;
    const white = AppColors.surface;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(AppDimens.radius),
    );
    final outlinedShape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(AppDimens.radius),
      side: const BorderSide(color: black, width: AppDimens.borderWidth),
    );
    const inputBorder = OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(AppDimens.radius)),
      borderSide: BorderSide(color: black, width: 1.5),
    );

    final colorScheme = const ColorScheme.light(
      primary: black,
      onPrimary: white,
      primaryContainer: AppColors.selectedBackground,
      onPrimaryContainer: black,
      secondary: black,
      onSecondary: white,
      tertiary: black,
      surface: white,
      onSurface: black,
      onSurfaceVariant: AppColors.inkMuted,
      outline: black,
      outlineVariant: AppColors.divider,
      error: Color(0xFFB00020),
      inversePrimary: AppColors.selectedBackground,
      surfaceTint: Colors.transparent,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      primaryColor: black,
      scaffoldBackgroundColor: AppColors.background,
      splashFactory: NoSplash.splashFactory,
      appBarTheme: const AppBarTheme(
        backgroundColor: black,
        foregroundColor: white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          color: white,
          fontSize: 18,
          fontWeight: FontWeight.w900,
          letterSpacing: 2,
        ),
      ),
      cardTheme: CardThemeData(
        color: white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: outlinedShape,
      ),
      dividerTheme: const DividerThemeData(color: black, thickness: 1),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: black,
          foregroundColor: white,
          shape: shape,
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
          textStyle: const TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: black,
          foregroundColor: white,
          elevation: 0,
          shape: shape,
          textStyle: const TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: black,
          side: const BorderSide(color: black, width: 1.5),
          shape: shape,
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
          textStyle: const TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: black,
          shape: shape,
          textStyle: const TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: black,
        foregroundColor: white,
        elevation: 0,
        focusElevation: 0,
        hoverElevation: 0,
        highlightElevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimens.radius),
          side: const BorderSide(color: white, width: 2),
        ),
        extendedTextStyle: const TextStyle(fontWeight: FontWeight.bold),
      ),
      inputDecorationTheme: const InputDecorationTheme(
        border: inputBorder,
        enabledBorder: inputBorder,
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(AppDimens.radius)),
          borderSide: BorderSide(color: black, width: 2.5),
        ),
        prefixIconColor: black,
        floatingLabelStyle: TextStyle(color: black, fontWeight: FontWeight.bold),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: white,
        surfaceTintColor: Colors.transparent,
        shape: outlinedShape,
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: outlinedShape,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? white : black),
        trackColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? black : white),
        trackOutlineColor: const WidgetStatePropertyAll(black),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: white,
        side: const BorderSide(color: black),
        shape: shape,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: black,
        contentTextStyle: const TextStyle(color: white),
        actionTextColor: white,
        shape: shape,
        behavior: SnackBarBehavior.floating,
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: black),
      datePickerTheme: DatePickerThemeData(
        backgroundColor: white,
        surfaceTintColor: Colors.transparent,
        shape: outlinedShape,
        headerBackgroundColor: black,
        headerForegroundColor: white,
      ),
      timePickerTheme: TimePickerThemeData(
        backgroundColor: white,
        shape: outlinedShape,
      ),
    );
  }
}
