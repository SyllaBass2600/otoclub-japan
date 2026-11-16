import 'package:flutter/material.dart';

import '../../models/event_data.dart';
import '../../theme/app_theme.dart';
import '../../widgets/event_image_pager.dart';
import '../../widgets/zoomable_image_viewer.dart';

/// 画像のないイベントのヘッダー（黒地に白のアイコン）
class EventHeaderGradient extends StatelessWidget {
  const EventHeaderGradient({super.key});

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: Colors.black,
      child: Center(
        child: Icon(Icons.event, size: 80, color: Colors.white),
      ),
    );
  }
}

/// 画像（フライヤー → その他画像）を画面に収まる大きさで表示する
///
/// 横スワイプで切り替え、タップで拡大表示する。
/// [viewportHeight] はこの画面のスクロール領域の高さ。
class EventDetailImages extends StatelessWidget {
  final List<String> imageUrls;
  final double viewportHeight;

  const EventDetailImages({
    super.key,
    required this.imageUrls,
    required this.viewportHeight,
  });

  @override
  Widget build(BuildContext context) {
    const hintHeight = 40.0;
    final height = (viewportHeight - kToolbarHeight - hintHeight)
        .clamp(240.0, double.infinity);
    final hint = imageUrls.length > 1
        ? 'スワイプで次の画像 ・ タップで拡大 ・ スクロールで詳細'
        : 'タップで拡大 ・ スクロールで詳細';

    return Column(
      children: [
        EventImagePager(
          imageUrls: imageUrls,
          height: height,
          onImageTap: (url) => ZoomableImageViewer.show(context, url),
        ),
        SizedBox(
          height: hintHeight,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.keyboard_arrow_down, color: Colors.grey[600]),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  hint,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// 開催状況のバッジ（非公開なら「非公開」も並べる）
class EventStatusBadge extends StatelessWidget {
  final EventData event;

  const EventStatusBadge({super.key, required this.event});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      children: [
        _badge(event.status.label, event.status.color, filled: true),
        if (!event.isPublished) _badge('非公開', Colors.black),
      ],
    );
  }

  static Widget _badge(String label, Color color, {bool filled = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(
        color: filled ? color : Colors.white,
        border: Border.all(color: color, width: 2),
        borderRadius: BorderRadius.circular(AppDimens.radius),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: filled ? Colors.white : color,
          fontSize: 12,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

/// 開催情報の1行（開催日・時間・場所）
class EventInfoCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const EventInfoCard({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppDimens.radius),
        border: Border.all(color: Colors.black, width: AppDimens.borderWidth),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            color: Colors.black,
            child: Icon(icon, size: 22, color: Colors.white),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(fontSize: 12, color: AppColors.inkMuted),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Google マップで会場を開く・経路を調べるボタン（場所が登録されているときだけ）
class EventVenueSection extends StatelessWidget {
  final EventData event;
  final ValueChanged<String> onOpenUrl;

  const EventVenueSection({
    super.key,
    required this.event,
    required this.onOpenUrl,
  });

  @override
  Widget build(BuildContext context) {
    final place = event.placeLabel;
    if (place == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => onOpenUrl(Uri.https('www.google.com',
                  '/maps/search/', {'api': '1', 'query': place}).toString()),
              icon: const Icon(Icons.map_outlined),
              label: const Text('Google マップで開く'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => onOpenUrl(Uri.https('www.google.com',
                  '/maps/dir/', {'api': '1', 'destination': place}).toString()),
              icon: const Icon(Icons.directions),
              label: const Text('経路を調べる'),
            ),
          ),
        ],
      ),
    );
  }
}

/// 公式サイト・X のリンク
class EventLinksSection extends StatelessWidget {
  final String? websiteUrl;
  final String? twitterUrl;
  final ValueChanged<String> onOpenUrl;

  const EventLinksSection({
    super.key,
    this.websiteUrl,
    this.twitterUrl,
    required this.onOpenUrl,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '公式リンク',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            if (websiteUrl != null)
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () => onOpenUrl(websiteUrl!),
                  icon: const Icon(Icons.language),
                  label: const Text('公式サイト'),
                ),
              ),
            if (websiteUrl != null && twitterUrl != null)
              const SizedBox(width: 12),
            if (twitterUrl != null)
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () => onOpenUrl(twitterUrl!),
                  icon: const Icon(Icons.alternate_email),
                  label: const Text('X（Twitter）'),
                ),
              ),
          ],
        ),
      ],
    );
  }
}
