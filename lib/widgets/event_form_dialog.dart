import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:image_picker/image_picker.dart';
import '../models/app_exception.dart';
import '../models/event_data.dart';
import '../repositories/event_repository.dart';
import '../services/image_storage_service.dart';
import '../utils/constants.dart';
import '../utils/date_formats.dart';
import '../utils/logger.dart';
import '../utils/snack_bars.dart';
import '../utils/url_utils.dart';
import 'image_picker_widget.dart';

/// イベントの登録・編集ダイアログ
///
/// ログインした人が自分のイベントを登録する。編集できるのは登録した本人だけ。
class EventFormDialog extends StatefulWidget {
  final EventData? event; // 編集時
  final DateTime? initialDate; // 新規登録時の日付（カレンダーで選択中の日）

  const EventFormDialog({
    super.key,
    this.event,
    this.initialDate,
  });

  @override
  State<EventFormDialog> createState() => _EventFormDialogState();
}

class _EventFormDialogState extends State<EventFormDialog> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _locationController = TextEditingController();
  final _websiteUrlController = TextEditingController();
  final _twitterUrlController = TextEditingController();

  DateTime _selectedDate = DateTime.now();
  TimeOfDay _startTime = const TimeOfDay(hour: 10, minute: 0);
  TimeOfDay _endTime = const TimeOfDay(hour: 18, minute: 0);
  bool _isSaving = false;

  bool _isPublished = true;
  String? _flyerImageUrl;
  String? _selectedPrefecture; // 開催地の都道府県

  Uint8List? _selectedFlyerBytes;
  // フライヤー画像を外したときに ImagePickerWidget を作り直すためのキー
  int _flyerPickerVersion = 0;

  /// その他画像（保存済みの画像と、まだアップロードしていない画像。並び順どおり）
  List<_OtherImage> _otherImages = [];
  bool _isPickingOtherImages = false;

  @override
  void initState() {
    super.initState();
    if (widget.event != null) {
      _loadEventData();
    } else if (widget.initialDate != null) {
      _selectedDate = widget.initialDate!;
    }
  }

  void _loadEventData() {
    final event = widget.event!;
    _titleController.text = event.eventName;
    _descriptionController.text = event.description;
    _locationController.text = event.location ?? '';
    _selectedPrefecture =
        prefectures.contains(event.prefecture) ? event.prefecture : null;
    _selectedDate = event.date;

    // startTimeとendTimeをTimeOfDayに変換
    final startParts = event.startTime.split(':');
    _startTime = TimeOfDay(
      hour: int.parse(startParts[0]),
      minute: int.parse(startParts[1]),
    );

    final endParts = event.endTime.split(':');
    _endTime = TimeOfDay(
      hour: int.parse(endParts[0]),
      minute: int.parse(endParts[1]),
    );

    _websiteUrlController.text = event.websiteUrl ?? '';
    _twitterUrlController.text = event.twitterUrl ?? '';

    _isPublished = event.isPublished;
    _flyerImageUrl = event.flyerImageUrl;
    _otherImages = [
      for (final url in event.otherImageUrls) _OtherImage.saved(url),
    ];
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _locationController.dispose();
    _websiteUrlController.dispose();
    _twitterUrlController.dispose();
    super.dispose();
  }

  Future<void> _saveEvent() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isSaving = true;
    });

    final imageStorage = ImageStorageService.instance;
    // この保存でアップロードした画像（保存に失敗したら消す）
    final uploadedUrls = <String>[];

    try {
      final currentUser = FirebaseAuth.instance.currentUser;
      if (currentUser == null) {
        throw Exception('ログインが必要です');
      }

      // 新規作成時もここで ID を決め、画像の保存先（users/{uid}/events/{eventId}/）と揃える
      final eventId = widget.event?.id ?? EventRepository.instance.newEventId();
      // 画像は登録した本人のフォルダに置く
      final ownerUid = widget.event?.createdBy ?? currentUser.uid;

      String? uploadedFlyerImageUrl = _flyerImageUrl;
      if (_selectedFlyerBytes != null) {
        uploadedFlyerImageUrl = await imageStorage.uploadEventFlyerImage(
          ownerUid,
          eventId,
          _selectedFlyerBytes!,
        );
        uploadedUrls.add(uploadedFlyerImageUrl);
      }

      // その他画像: 新しく選んだ画像だけアップロードし、並び順はそのまま保つ
      final otherImageUrls = <String>[];
      for (final image in _otherImages) {
        final url = image.url ??
            await imageStorage.uploadEventImage(ownerUid, eventId, image.bytes!);
        if (image.url == null) uploadedUrls.add(url);
        otherImageUrls.add(url);
      }

      final eventData = EventData(
        id: widget.event?.id,
        eventName: _titleController.text.trim(),
        date: DateTime(
            _selectedDate.year, _selectedDate.month, _selectedDate.day),
        startTime: DateFormats.timeOfDay(_startTime),
        endTime: DateFormats.timeOfDay(_endTime),
        description: _descriptionController.text.trim(),
        prefecture: _selectedPrefecture,
        location: _locationController.text.trim().isEmpty
            ? null
            : _locationController.text.trim(),
        createdAt: widget.event?.createdAt ?? DateTime.now(),
        createdBy: widget.event?.createdBy ?? currentUser.uid,
        // googleCalendarEventId は Cloud Functions だけが書き込む（toFirestore* には含めない）
        // 編集を始めた時点の版。保存時に、別の画面で先に更新されていないかを確かめる
        version: widget.event?.version ?? 0,
        isPublished: _isPublished,
        flyerImageUrl: uploadedFlyerImageUrl,
        otherImageUrls: otherImageUrls,
        websiteUrl: UrlUtils.normalizeOptional(_websiteUrlController.text),
        twitterUrl: UrlUtils.normalizeOptional(_twitterUrlController.text),
      );

      // Firestoreに保存
      if (widget.event != null) {
        // 更新
        await EventRepository.instance.update(eventData);
      } else {
        // 新規作成
        await EventRepository.instance.create(eventId, eventData);
      }

      // 公式Googleカレンダーへの登録・更新は Cloud Functions が行う。
      // アプリからは書き込まない（二重登録を防ぐため）。

      // 外した画像・差し替えた画像を Storage から消す（失敗しても保存は成功扱い）
      final previous = widget.event;
      if (previous != null) {
        final removed = removedEventImageUrls(
          before: [
            if (previous.flyerImageUrl != null) previous.flyerImageUrl!,
            ...previous.otherImageUrls,
          ],
          after: [
            ?uploadedFlyerImageUrl,
            ...otherImageUrls,
          ],
        );
        for (final url in removed) {
          await imageStorage.deleteImageByUrl(url);
        }
      }

      if (mounted) {
        Navigator.of(context).pop(true);
        showSuccessSnackBar(
            context, widget.event != null ? 'イベントを更新しました' : 'イベントを登録しました');
      }
    } catch (e) {
      // 画像のアップロードに失敗した場合はイベントも保存していない（入力内容はダイアログに残る）。
      // この回にアップロードした画像はどこからも使われないので消す
      for (final url in uploadedUrls) {
        await imageStorage.deleteImageByUrl(url);
      }
      Logger.error('EventFormDialog', 'イベントの保存に失敗', error: e);
      if (mounted) {
        showErrorSnackBar(
            context, userMessageOf(e, fallback: 'イベントの保存に失敗しました'));
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: Container(
        width: MediaQuery.of(context).size.width * 0.9,
        constraints: const BoxConstraints(maxWidth: 600, maxHeight: 700),
        child: Column(
          children: [
            // ヘッダー
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Theme.of(context).primaryColor,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(4),
                  topRight: Radius.circular(4),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    widget.event != null
                        ? Icons.edit
                        : Icons.add_circle_outline,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    widget.event != null ? 'イベントを編集' : 'イベントを登録',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),

            // フォーム
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // イベント名
                      TextFormField(
                        controller: _titleController,
                        decoration: const InputDecoration(
                          labelText: 'イベント名 *',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.event),
                        ),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'イベント名を入力してください';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),

                      // 日付
                      InkWell(
                        onTap: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: _selectedDate,
                            firstDate: DateTime(2000),
                            lastDate: DateTime(2100),
                          );
                          if (picked != null) {
                            setState(() {
                              _selectedDate = picked;
                            });
                          }
                        },
                        child: InputDecorator(
                          decoration: const InputDecoration(
                            labelText: '日付 *',
                            border: OutlineInputBorder(),
                            prefixIcon: Icon(Icons.calendar_today),
                          ),
                          child: Text(
                            DateFormats.date(_selectedDate),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // 開始時刻・終了時刻
                      Row(
                        children: [
                          Expanded(
                            child: InkWell(
                              onTap: () async {
                                final picked = await showTimePicker(
                                  context: context,
                                  initialTime: _startTime,
                                );
                                if (picked != null) {
                                  setState(() {
                                    _startTime = picked;
                                  });
                                }
                              },
                              child: InputDecorator(
                                decoration: const InputDecoration(
                                  labelText: '開始時刻 *',
                                  border: OutlineInputBorder(),
                                  prefixIcon: Icon(Icons.access_time),
                                ),
                                child: Text(
                                  DateFormats.timeOfDay(_startTime),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: InkWell(
                              onTap: () async {
                                final picked = await showTimePicker(
                                  context: context,
                                  initialTime: _endTime,
                                );
                                if (picked != null) {
                                  setState(() {
                                    _endTime = picked;
                                  });
                                }
                              },
                              child: InputDecorator(
                                decoration: const InputDecoration(
                                  labelText: '終了時刻 *',
                                  border: OutlineInputBorder(),
                                  prefixIcon: Icon(Icons.access_time),
                                ),
                                child: Text(
                                  DateFormats.timeOfDay(_endTime),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // 開催地の都道府県
                      DropdownButtonFormField<String?>(
                        key: ValueKey('prefecture-$_selectedPrefecture'),
                        initialValue: _selectedPrefecture,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: '都道府県',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.map_outlined),
                        ),
                        items: [
                          const DropdownMenuItem<String?>(
                            value: null,
                            child: Text('未選択'),
                          ),
                          for (final prefecture in prefectures)
                            DropdownMenuItem<String?>(
                              value: prefecture,
                              child: Text(prefecture),
                            ),
                        ],
                        onChanged: _isSaving
                            ? null
                            : (value) =>
                                setState(() => _selectedPrefecture = value),
                      ),
                      const SizedBox(height: 16),

                      // 開催場所（自由記述）
                      TextFormField(
                        controller: _locationController,
                        decoration: const InputDecoration(
                          labelText: '開催場所',
                          hintText: '会場名・住所など（例: 〇〇ホール 2F）',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.location_on),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // 説明
                      TextFormField(
                        controller: _descriptionController,
                        decoration: const InputDecoration(
                          labelText: '説明',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.description),
                        ),
                        maxLines: 5,
                      ),
                      const SizedBox(height: 16),

                      // 公式サイトURL
                      TextFormField(
                        controller: _websiteUrlController,
                        decoration: const InputDecoration(
                          labelText: '公式サイトURL',
                          hintText: 'https://example.com',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.language),
                        ),
                        keyboardType: TextInputType.url,
                        validator: UrlUtils.validateOptionalHttpUrl,
                      ),
                      const SizedBox(height: 16),

                      // X（Twitter）URL
                      TextFormField(
                        controller: _twitterUrlController,
                        decoration: const InputDecoration(
                          labelText: 'X（Twitter）URL',
                          hintText: 'https://x.com/...',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.alternate_email),
                        ),
                        keyboardType: TextInputType.url,
                        validator: UrlUtils.validateOptionalHttpUrl,
                      ),
                      const SizedBox(height: 16),

                      // フライヤー画像（ホームの開催予定・詳細画面に表示する）
                      ImagePickerWidget(
                        key: ValueKey('flyer-$_flyerPickerVersion'),
                        // 外した後（version > 0）は空の状態で作り直す
                        initialImageUrl: _flyerPickerVersion == 0
                            ? widget.event?.flyerImageUrl
                            : null,
                        onImageBytesSelected: (bytes) {
                          setState(() {
                            _selectedFlyerBytes = bytes;
                          });
                        },
                        labelText: 'フライヤー画像（A4縦長・任意）',
                        maxSizeKB:
                            ImageStorageService.flyerMaxSizeKB.toDouble(),
                        width: 210,
                        height: 297,
                        pickMaxWidth:
                            ImageStorageService.flyerMaxWidth.toDouble(),
                        previewFit: BoxFit.contain,
                      ),
                      if (_flyerImageUrl != null || _selectedFlyerBytes != null)
                        TextButton.icon(
                          onPressed: () {
                            setState(() {
                              _flyerImageUrl = null;
                              _selectedFlyerBytes = null;
                              _flyerPickerVersion++;
                            });
                          },
                          icon: const Icon(Icons.delete_outline),
                          label: const Text('フライヤー画像を外す'),
                        ),
                      // 保存済みで、差し替えていないときだけ URL をコピーできる
                      if (_flyerImageUrl != null && _selectedFlyerBytes == null)
                        TextButton.icon(
                          onPressed: () =>
                              _copyImageUrl(context, _flyerImageUrl!),
                          icon: const Icon(Icons.link),
                          label: const Text('フライヤー画像の URL をコピー'),
                        ),
                      const _ImageFieldHint(
                        'カレンダーの一覧と、イベント詳細の1枚目に表示されます',
                      ),
                      const SizedBox(height: 24),

                      // その他画像（複数枚。詳細画面でフライヤーの後ろにスワイプで表示する）
                      _buildOtherImagesField(),
                      const SizedBox(height: 16),

                      const Divider(height: 32),

                      // 公開設定
                      SwitchListTile(
                        title: const Text('公開'),
                        subtitle: Text(_isPublished
                            ? 'カレンダーに表示し、公式カレンダーにも登録します'
                            : '自分にだけ表示します（公式カレンダーには登録しません）'),
                        value: _isPublished,
                        onChanged: (value) {
                          setState(() {
                            _isPublished = value;
                          });
                        },
                      ),

                    ],
                  ),
                ),
              ),
            ),

            // アクションボタン
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                border: const Border(
                  top: BorderSide(color: Colors.black, width: 2),
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed:
                        _isSaving ? null : () => Navigator.of(context).pop(),
                    child: const Text('キャンセル'),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: _isSaving ? null : _saveEvent,
                    child: _isSaving
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(widget.event != null ? '更新' : '登録'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// その他画像の欄（サムネイルの一覧と追加ボタン）
  Widget _buildOtherImagesField() {
    final remaining = EventData.maxOtherImages - _otherImages.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'その他画像（最大${EventData.maxOtherImages}枚・任意）',
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (var i = 0; i < _otherImages.length; i++)
              _OtherImageThumbnail(
                key: ObjectKey(_otherImages[i]),
                image: _otherImages[i],
                onRemove: _isSaving
                    ? null
                    : () => setState(() => _otherImages.removeAt(i)),
              ),
            if (remaining > 0)
              _AddImageTile(
                onTap: _isSaving || _isPickingOtherImages
                    ? null
                    : () => _pickOtherImages(remaining),
                isLoading: _isPickingOtherImages,
              ),
          ],
        ),
        const _ImageFieldHint(
          'イベント詳細で、フライヤーの後ろにスワイプで表示されます。'
          'フライヤーがないときは、1枚目が一覧に表示されます',
        ),
      ],
    );
  }

  /// その他画像を選ぶ（残りの枚数まで、まとめて選べる）
  Future<void> _pickOtherImages(int remaining) async {
    setState(() => _isPickingOtherImages = true);
    try {
      final picker = ImagePicker();
      final maxWidth = ImageStorageService.maxWidth.toDouble();
      // pickMultiImage の limit は 2 以上でないと使えないため、残り1枚のときは1枚だけ選ぶ
      final List<XFile> files;
      if (remaining >= 2) {
        files = await picker.pickMultiImage(
          maxWidth: maxWidth,
          imageQuality: 85,
          limit: remaining,
        );
      } else {
        final file = await picker.pickImage(
          source: ImageSource.gallery,
          maxWidth: maxWidth,
          imageQuality: 85,
        );
        files = file == null ? const [] : [file];
      }
      if (files.isEmpty) return;

      final picked = <_OtherImage>[];
      for (final file in files.take(remaining)) {
        picked.add(_OtherImage.picked(await file.readAsBytes()));
      }
      if (!mounted) return;
      setState(() => _otherImages = [..._otherImages, ...picked]);
      if (files.length > remaining) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                'その他画像は${EventData.maxOtherImages}枚までです。先頭の$remaining枚を追加しました'),
          ),
        );
      }
    } catch (e) {
      Logger.error('EventFormDialog', 'その他画像の選択に失敗', error: e);
      if (mounted) {
        showErrorSnackBar(context, userMessageOf(e, fallback: '画像の選択に失敗しました'));
      }
    } finally {
      if (mounted) setState(() => _isPickingOtherImages = false);
    }
  }
}

/// 編集中のその他画像（保存済みの画像の URL か、まだアップロードしていない画像データ）
class _OtherImage {
  _OtherImage.saved(String this.url) : bytes = null;
  _OtherImage.picked(Uint8List this.bytes) : url = null;

  final String? url;
  final Uint8List? bytes;
}

/// 保存のあとで Storage から消してよい画像
///
/// 保存前にあって保存後にない画像を返す。
@visibleForTesting
Set<String> removedEventImageUrls({
  required Iterable<String> before,
  required Iterable<String> after,
}) {
  final remaining = after.toSet();
  return {
    for (final url in before)
      if (!remaining.contains(url)) url,
  };
}

/// 画像の URL をクリップボードにコピーする
///
/// Storage のダウンロード URL はトークン付きのため、ログインしていなくても開ける。
/// SNS などにそのまま貼れる。
Future<void> _copyImageUrl(BuildContext context, String url) async {
  final messenger = ScaffoldMessenger.of(context);
  await Clipboard.setData(ClipboardData(text: url));
  messenger.showSnackBar(
    const SnackBar(content: Text('画像の URL をコピーしました')),
  );
}

/// 画像欄の下に出す説明
class _ImageFieldHint extends StatelessWidget {
  const _ImageFieldHint(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Text(
        text,
        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
      ),
    );
  }
}

/// その他画像のサムネイル（右上の × で外す）
class _OtherImageThumbnail extends StatelessWidget {
  const _OtherImageThumbnail({
    super.key,
    required this.image,
    required this.onRemove,
  });

  static const double size = 96;

  final _OtherImage image;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final bytes = image.bytes;
    final url = image.url;
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: bytes != null
                ? Image.memory(bytes, fit: BoxFit.cover)
                : Image.network(
                    key: ValueKey(url),
                    url!,
                    // <img> で表示する（Storage が CORS を許可していないため。ダウンロードを試さないので速い）
                    webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) =>
                        const Icon(Icons.broken_image, color: Colors.grey),
                  ),
          ),
          if (bytes != null)
            Positioned(
              left: 4,
              bottom: 4,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  '未保存',
                  style: TextStyle(color: Colors.white, fontSize: 10),
                ),
              ),
            ),
          // 保存済みの画像だけ URL をコピーできる（未保存の画像はまだ URL がない）
          if (url != null)
            Positioned(
              top: 2,
              left: 2,
              child: Material(
                color: Colors.black.withValues(alpha: 0.6),
                shape: const CircleBorder(),
                child: IconButton(
                  tooltip: '画像の URL をコピー',
                  visualDensity: VisualDensity.compact,
                  iconSize: 16,
                  color: Colors.white,
                  onPressed: () => _copyImageUrl(context, url),
                  icon: const Icon(Icons.link),
                ),
              ),
            ),
          Positioned(
            top: 2,
            right: 2,
            child: Material(
              color: Colors.black.withValues(alpha: 0.6),
              shape: const CircleBorder(),
              child: IconButton(
                tooltip: '画像を外す',
                visualDensity: VisualDensity.compact,
                iconSize: 16,
                color: Colors.white,
                onPressed: onRemove,
                icon: const Icon(Icons.close),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// その他画像の「＋ 画像を追加」ボタン
class _AddImageTile extends StatelessWidget {
  const _AddImageTile({required this.onTap, required this.isLoading});

  final VoidCallback? onTap;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: '画像を追加',
      excludeSemantics: true,
      onTap: onTap,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: _OtherImageThumbnail.size,
          height: _OtherImageThumbnail.size,
          decoration: BoxDecoration(
            border: Border.all(color: Colors.black, width: 1.5),
            borderRadius: BorderRadius.circular(2),
            color: Colors.white,
          ),
          child: isLoading
              ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
              : Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.add_photo_alternate, color: Colors.black),
                    const SizedBox(height: 4),
                    Text(
                      '画像を追加',
                      style: TextStyle(fontSize: 12, color: Colors.grey[700]),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}
