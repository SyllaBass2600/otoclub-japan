import 'package:flutter/material.dart';

/// イベントの開催状況（白黒のデザインなので、終了だけ灰色にする）
enum EventStatus {
  ongoing('開催中', Colors.black),
  today('本日開催', Colors.black),
  past('終了', Color(0xFF888888)),
  upcoming('開催予定', Colors.black);

  const EventStatus(this.label, this.color);

  /// 画面に表示する名前
  final String label;

  /// バッジの色
  final Color color;
}
