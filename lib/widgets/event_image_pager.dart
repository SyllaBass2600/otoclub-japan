import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// イベント詳細の先頭に出す画像（フライヤー → その他画像）を、横スワイプで切り替える表示
///
/// - 画像は全体が見えるように表示する（タップで [onImageTap]。拡大表示に使う）
/// - 2枚以上のときは、何枚目かを示すドットと、左右の矢印ボタンを出す
///   （スワイプのほか、矢印ボタンでも切り替えられる）
class EventImagePager extends StatefulWidget {
  const EventImagePager({
    super.key,
    required this.imageUrls,
    required this.height,
    this.onImageTap,
  });

  final List<String> imageUrls;
  final double height;
  final ValueChanged<String>? onImageTap;

  @override
  State<EventImagePager> createState() => _EventImagePagerState();
}

class _EventImagePagerState extends State<EventImagePager> {
  final PageController _controller = PageController();
  int _page = 0;

  @override
  void didUpdateWidget(EventImagePager oldWidget) {
    super.didUpdateWidget(oldWidget);
    // 編集で画像が減ったときに、存在しないページを指さないようにする
    if (_page >= widget.imageUrls.length && widget.imageUrls.isNotEmpty) {
      _page = widget.imageUrls.length - 1;
      _controller.jumpToPage(_page);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _goTo(int page) {
    final reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (reduceMotion) {
      _controller.jumpToPage(page);
    } else {
      _controller.animateToPage(
        page,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final count = widget.imageUrls.length;
    final showArrows = count > 1;

    return Container(
      height: widget.height,
      width: double.infinity,
      color: Colors.grey[900],
      child: Stack(
        children: [
          PageView.builder(
            controller: _controller,
            itemCount: count,
            onPageChanged: (page) => setState(() => _page = page),
            itemBuilder: (context, index) {
              final url = widget.imageUrls[index];
              return Semantics(
                image: true,
                label: '画像 ${index + 1} / $count',
                child: GestureDetector(
                  onTap: widget.onImageTap == null
                      ? null
                      : () => widget.onImageTap!(url),
                  child: Image.network(
                    key: ValueKey(url),
                    url,
                    // <img> で表示する（Storage が CORS を許可していないため。ダウンロードを試さないので速い）
                    webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                    fit: BoxFit.contain,
                    loadingBuilder: (context, child, loadingProgress) {
                      if (loadingProgress == null) return child;
                      return const Center(
                        child: CircularProgressIndicator(color: Colors.white),
                      );
                    },
                    errorBuilder: (context, error, stackTrace) => const Center(
                      child: Icon(Icons.broken_image,
                          color: Colors.white54, size: 64),
                    ),
                  ),
                ),
              );
            },
          ),
          if (showArrows) ...[
            Align(
              alignment: Alignment.centerLeft,
              child: _ArrowButton(
                icon: Icons.chevron_left,
                tooltip: '前の画像',
                onPressed: _page > 0 ? () => _goTo(_page - 1) : null,
              ),
            ),
            Align(
              alignment: Alignment.centerRight,
              child: _ArrowButton(
                icon: Icons.chevron_right,
                tooltip: '次の画像',
                onPressed: _page < count - 1 ? () => _goTo(_page + 1) : null,
              ),
            ),
          ],
          if (count > 1)
            Positioned(
              left: 0,
              right: 0,
              bottom: 10,
              child: _PageDots(count: count, current: _page),
            ),
        ],
      ),
    );
  }
}

class _ArrowButton extends StatelessWidget {
  const _ArrowButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: IconButton.filled(
        tooltip: tooltip,
        onPressed: onPressed,
        style: IconButton.styleFrom(
          backgroundColor: Colors.white.withValues(alpha: 0.85),
          foregroundColor: AppColors.ink,
          disabledBackgroundColor: Colors.white.withValues(alpha: 0.25),
          disabledForegroundColor: Colors.white54,
        ),
        icon: Icon(icon),
      ),
    );
  }
}

/// 何枚目かを示すドット
class _PageDots extends StatelessWidget {
  const _PageDots({required this.count, required this.current});

  final int count;
  final int current;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '${current + 1}枚目 / 全$count枚',
      excludeSemantics: true,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (var i = 0; i < count; i++)
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: i == current ? 18 : 8,
              height: 8,
              decoration: BoxDecoration(
                color: i == current ? AppColors.primary : Colors.white54,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
        ],
      ),
    );
  }
}
