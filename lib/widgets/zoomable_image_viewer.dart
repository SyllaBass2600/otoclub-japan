import 'package:flutter/material.dart';

/// 画像を全画面で表示し、ピンチ・ダブルタップで拡大できるビューア
class ZoomableImageViewer extends StatefulWidget {
  final String imageUrl;

  const ZoomableImageViewer({super.key, required this.imageUrl});

  /// 全画面で開く（メイン画面のタブの中からでも、ヘッダー・フッターを隠して表示する）
  static Future<void> show(BuildContext context, String imageUrl) {
    return Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (context) => ZoomableImageViewer(imageUrl: imageUrl),
      ),
    );
  }

  @override
  State<ZoomableImageViewer> createState() => _ZoomableImageViewerState();
}

class _ZoomableImageViewerState extends State<ZoomableImageViewer> {
  static const double _doubleTapScale = 2.5;

  final _controller = TransformationController();
  TapDownDetails? _doubleTapDetails;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// ダブルタップした位置を拡大、拡大中なら元に戻す
  void _handleDoubleTap() {
    if (_controller.value != Matrix4.identity()) {
      _controller.value = Matrix4.identity();
      return;
    }
    final position = _doubleTapDetails?.localPosition;
    if (position == null) return;
    _controller.value = Matrix4.identity()
      ..translateByDouble(
        -position.dx * (_doubleTapScale - 1),
        -position.dy * (_doubleTapScale - 1),
        0,
        1,
      )
      ..scaleByDouble(_doubleTapScale, _doubleTapScale, 1, 1);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
      ),
      body: GestureDetector(
        onDoubleTapDown: (details) => _doubleTapDetails = details,
        onDoubleTap: _handleDoubleTap,
        child: InteractiveViewer(
          transformationController: _controller,
          minScale: 1,
          maxScale: 5,
          child: Center(
            child: Image.network(
              key: ValueKey(widget.imageUrl),
              widget.imageUrl,
              // <img> で表示する（Storage が CORS を許可していないため。ダウンロードを試さないので速い）
              webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
              fit: BoxFit.contain,
              loadingBuilder: (context, child, loadingProgress) {
                if (loadingProgress == null) return child;
                return const CircularProgressIndicator(color: Colors.white);
              },
              errorBuilder: (context, error, stackTrace) {
                return const Icon(Icons.broken_image,
                    color: Colors.white54, size: 64);
              },
            ),
          ),
        ),
      ),
    );
  }
}
