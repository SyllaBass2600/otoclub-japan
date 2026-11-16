import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// 平行四辺形のアクセント付きセクション見出し
class SectionHeader extends StatelessWidget {
  const SectionHeader({super.key, required this.title, required this.icon});

  final String title;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          // 斜めに傾けた小さなバー
          Transform(
            transform: Matrix4.skewX(-0.35),
            alignment: Alignment.center,
            child: Container(
              width: 8,
              height: 22,
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Icon(icon, color: AppColors.primaryDeep),
          const SizedBox(width: 8),
          Text(
            title,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppColors.ink,
            ),
          ),
        ],
      ),
    );
  }
}
