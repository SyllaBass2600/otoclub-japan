import 'package:flutter/material.dart';

/// 成功したことを SnackBar で知らせる（白黒のデザインなので、色ではなくアイコンで区別する）
void showSuccessSnackBar(BuildContext context, String message) {
  _show(context, Icons.check_circle_outline, message);
}

/// 失敗したことを SnackBar で知らせる
///
/// [message] は利用者に見せてよい文言にする（例外は userMessageOf で変換する）。
void showErrorSnackBar(BuildContext context, String message) {
  _show(context, Icons.error_outline, message);
}

void _show(BuildContext context, IconData icon, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Row(
        children: [
          Icon(icon, color: Colors.white),
          const SizedBox(width: 12),
          Expanded(child: Text(message)),
        ],
      ),
    ),
  );
}
