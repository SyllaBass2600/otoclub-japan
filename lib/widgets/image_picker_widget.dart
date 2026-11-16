import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../services/image_storage_service.dart';
import '../models/app_exception.dart';
import '../utils/logger.dart';
import '../utils/snack_bars.dart';

/// 画像選択ウィジェット
class ImagePickerWidget extends StatefulWidget {
  final String? initialImageUrl;
  final Function(String imageUrl)? onImageSelected;
  final Function(Uint8List imageBytes)? onImageBytesSelected;
  final String labelText;
  final double maxSizeKB;
  final double width;
  final double height;
  final double pickMaxWidth; // 選択時に縮小する最大幅（px）
  final BoxFit previewFit; // プレビューの表示方法（チラシは contain で全体表示）

  const ImagePickerWidget({
    super.key,
    this.initialImageUrl,
    this.onImageSelected,
    this.onImageBytesSelected,
    this.labelText = '画像を選択',
    this.maxSizeKB = 300,
    this.width = 200,
    this.height = 200,
    this.pickMaxWidth = 1200,
    this.previewFit = BoxFit.cover,
  });

  @override
  State<ImagePickerWidget> createState() => _ImagePickerWidgetState();
}

class _ImagePickerWidgetState extends State<ImagePickerWidget> {
  final ImagePicker _picker = ImagePicker();
  Uint8List? _imageBytes;
  String? _imageUrl;
  bool _isUploading = false;

  @override
  void initState() {
    super.initState();
    _imageUrl = widget.initialImageUrl;
  }

  Future<void> _pickImage() async {
    try {
      // image_picker は Web / モバイル双方に対応
      await _pickImageFromGallery();
    } catch (e) {
      Logger.error('ImagePickerWidget', '画像の選択に失敗', error: e);
      if (mounted) {
        showErrorSnackBar(context, userMessageOf(e, fallback: '画像の選択に失敗しました'));
      }
    } finally {
      if (mounted) {
        setState(() {
          _isUploading = false;
        });
      }
    }
  }

  /// 画像選択（image_picker：Web / モバイル共通）
  Future<void> _pickImageFromGallery() async {
    final XFile? image = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: widget.pickMaxWidth,
      imageQuality: 85,
    );

    if (image == null) {
      return;
    }

    setState(() {
      _isUploading = true;
    });

    final imageBytes = await image.readAsBytes();

    await _processImage(imageBytes);
  }

  /// 画像データを処理
  Future<void> _processImage(Uint8List imageBytes) async {
    // サイズチェック
    final sizeKB = ImageStorageService.getImageSizeKB(imageBytes);
    Logger.debug('ImagePickerWidget', '選択した画像: ${sizeKB.toStringAsFixed(2)} KB');

    if (sizeKB > widget.maxSizeKB * 2) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '画像が大きすぎます（${sizeKB.toStringAsFixed(0)}KB）\n'
              '目安: ${widget.maxSizeKB.toStringAsFixed(0)}KB以下',
            ),
          ),
        );
      }
    }

    setState(() {
      _imageBytes = imageBytes;
      _imageUrl = null; // プレビュー用にローカル画像を優先
    });

    // コールバックで画像バイトデータを返す
    if (widget.onImageBytesSelected != null) {
      widget.onImageBytesSelected!(imageBytes);
    } else {
      Logger.warning('ImagePickerWidget', 'onImageBytesSelected が設定されていません');
    }

    if (mounted) {
      showSuccessSnackBar(
        context,
        '画像を選択しました（${ImageStorageService.formatImageSize(imageBytes)}）',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.labelText,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 8),
        InkWell(
          onTap: _isUploading ? null : _pickImage,
          borderRadius: BorderRadius.circular(8),
          child: Container(
            width: widget.width,
            height: widget.height,
            decoration: BoxDecoration(
              border: Border.all(color: Colors.black, width: 1.5),
              borderRadius: BorderRadius.circular(8),
              color: Colors.white,
            ),
            child: _isUploading
                ? const Center(child: CircularProgressIndicator())
                : _buildImagePreview(),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          '最大サイズ: ${widget.maxSizeKB.toStringAsFixed(0)}KB',
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey[600],
          ),
        ),
      ],
    );
  }

  Widget _buildImagePreview() {
    if (_imageBytes != null) {
      // ローカル画像（選択直後）
      return Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.memory(
              _imageBytes!,
              fit: widget.previewFit,
            ),
          ),
          Positioned(
            top: 8,
            right: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Text(
                '未保存',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
          Center(
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.5),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.edit,
                color: Colors.white,
                size: 24,
              ),
            ),
          ),
        ],
      );
    } else if (_imageUrl != null) {
      // アップロード済み画像
      return Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.network(
              key: ValueKey(_imageUrl),
              _imageUrl!,
              // <img> で表示する（Storage が CORS を許可していないため。ダウンロードを試さないので速い）
              webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
              fit: widget.previewFit,
              loadingBuilder: (context, child, loadingProgress) {
                if (loadingProgress == null) return child;
                return const Center(child: CircularProgressIndicator());
              },
              errorBuilder: (context, error, stackTrace) {
                return const Center(
                  child: Icon(Icons.error, color: Colors.red),
                );
              },
            ),
          ),
          Center(
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.5),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.edit,
                color: Colors.white,
                size: 24,
              ),
            ),
          ),
        ],
      );
    } else {
      // 画像未選択
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.add_photo_alternate,
            size: 48,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 8),
          Text(
            'タップして画像を選択',
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey[600],
            ),
          ),
        ],
      );
    }
  }

  /// 選択された画像データを取得
  Uint8List? get selectedImageBytes => _imageBytes;

  /// 画像が選択されているか
  bool get hasSelectedImage => _imageBytes != null;
}
