import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/app_exception.dart';
import '../../models/event_data.dart';
import '../../repositories/event_repository.dart';
import '../../services/auth_service.dart';
import '../../services/calendar_service.dart';
import '../../services/image_storage_service.dart';
import '../../utils/logger.dart';
import '../../utils/snack_bars.dart';
import '../../utils/url_utils.dart';
import '../../widgets/add_to_personal_calendar.dart';
import '../../widgets/event_form_dialog.dart';
import 'event_detail_sections.dart';

/// イベント詳細画面
///
/// 登録した本人と管理者には、ヘッダーに編集・削除のメニューを出す。
class EventDetailScreen extends StatefulWidget {
  final String eventId;

  const EventDetailScreen({super.key, required this.eventId});

  @override
  State<EventDetailScreen> createState() => _EventDetailScreenState();
}

class _EventDetailScreenState extends State<EventDetailScreen> {
  EventData? _event;
  bool _isLoading = true;
  // 表示していたイベントが、削除または非公開になったか
  bool _noLongerAvailable = false;
  StreamSubscription<EventData?>? _eventSubscription;

  @override
  void initState() {
    super.initState();
    _eventSubscription = EventRepository.instance
        .watchEvent(widget.eventId)
        .listen(_onEventChanged, onError: _onEventError);
  }

  @override
  void dispose() {
    _eventSubscription?.cancel();
    super.dispose();
  }

  void _onEventChanged(EventData? event) {
    if (!mounted) return;
    setState(() {
      _noLongerAvailable = event == null && _event != null;
      _event = event;
      _isLoading = false;
    });
  }

  // 非公開になって読めなくなったときも、読み取り権限のエラーとしてここに届く
  void _onEventError(Object e) {
    Logger.error('EventDetailScreen', 'イベントの読み込みに失敗', error: e);
    if (!mounted) return;
    setState(() {
      _noLongerAvailable = _event != null;
      _event = null;
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        appBar: AppBar(title: const Text('イベント詳細')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_event == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('イベント詳細')),
        body: Center(
          child: Text(
            _noLongerAvailable ? 'このイベントは削除されたか、非公開になりました' : 'イベントが見つかりません',
          ),
        ),
      );
    }

    final event = _event!;
    final imageUrls = event.detailImageUrls;
    final canManage = event.canBeManagedBy(AuthService.instance.currentUser);

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          // 画像がある場合: 開いた直後は画像（フライヤー → その他画像）を大きく表示し、
          // 横スワイプで切り替え、スクロールで詳細へ
          if (imageUrls.isNotEmpty) ...[
            SliverAppBar(
              pinned: true,
              title: Text(event.eventName),
              actions: _buildAppBarActions(event, canManage),
            ),
            SliverLayoutBuilder(
              builder: (context, constraints) => SliverToBoxAdapter(
                child: EventDetailImages(
                  imageUrls: imageUrls,
                  viewportHeight: constraints.viewportMainAxisExtent,
                ),
              ),
            ),
          ] else
            SliverAppBar(
              expandedHeight: 250,
              pinned: true,
              flexibleSpace: FlexibleSpaceBar(
                title: Text(
                  event.eventName,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
                background: const EventHeaderGradient(),
              ),
              actions: _buildAppBarActions(event, canManage),
            ),

          SliverToBoxAdapter(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 760),
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: _buildBody(event),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(EventData event) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        EventStatusBadge(event: event),
        const SizedBox(height: 24),

        const Text(
          '開催情報',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 16),

        EventInfoCard(
          icon: Icons.calendar_today,
          label: '開催日',
          value: event.formattedDate,
        ),
        const SizedBox(height: 12),
        EventInfoCard(
          icon: Icons.access_time,
          label: '時間',
          value: event.formattedTime,
        ),
        if (event.placeLabel != null) ...[
          const SizedBox(height: 12),
          EventInfoCard(
            icon: Icons.place,
            label: '場所',
            value: event.placeLabel!,
          ),
        ],

        // Google マップのボタン（場所があるときだけ）
        EventVenueSection(event: event, onOpenUrl: _openUrl),

        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            // ポップアップがブロックされないよう、await を挟まずに開く
            onPressed: () => addToPersonalCalendar(
              context,
              CalendarService.urlForEvent(event),
            ),
            icon: const Icon(Icons.event_available),
            label: const Text('個人カレンダーに追加'),
          ),
        ),

        const SizedBox(height: 24),

        if (event.websiteUrl != null || event.twitterUrl != null) ...[
          EventLinksSection(
            websiteUrl: event.websiteUrl,
            twitterUrl: event.twitterUrl,
            onOpenUrl: _openUrl,
          ),
          const SizedBox(height: 24),
        ],

        const Divider(),
        const SizedBox(height: 24),

        const Text(
          'イベント詳細',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 16),
        Text(
          event.description.isEmpty ? '（詳細はありません）' : event.description,
          style: const TextStyle(fontSize: 16, color: Colors.black, height: 1.8),
        ),
        const SizedBox(height: 32),
      ],
    );
  }

  /// ヘッダーのボタン（登録した本人と管理者にだけ編集・削除を出す）
  List<Widget> _buildAppBarActions(EventData event, bool canManage) {
    if (!canManage) return const [];
    return [
      PopupMenuButton<String>(
        tooltip: 'イベントの管理',
        icon: const Icon(Icons.more_vert),
        onSelected: (value) {
          if (value == 'edit') _editEvent(event);
          if (value == 'delete') _deleteEvent(event);
        },
        itemBuilder: (context) => const [
          PopupMenuItem(
            value: 'edit',
            child: ListTile(
              leading: Icon(Icons.edit),
              title: Text('編集'),
              contentPadding: EdgeInsets.zero,
            ),
          ),
          PopupMenuItem(
            value: 'delete',
            child: ListTile(
              leading: Icon(Icons.delete_outline),
              title: Text('削除'),
              contentPadding: EdgeInsets.zero,
            ),
          ),
        ],
      ),
    ];
  }

  /// 編集ダイアログを開く（保存した内容は監視で画面に反映される）
  void _editEvent(EventData event) {
    showDialog<bool>(
      context: context,
      builder: (context) => EventFormDialog(event: event),
    );
  }

  /// 確認してからイベントを削除する（画像も消す。公式カレンダーからは Functions が消す）
  Future<void> _deleteEvent(EventData event) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('イベントを削除'),
        content: Text('「${event.eventName}」を削除します。元に戻せません。よろしいですか？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('キャンセル'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('削除する'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    try {
      // 先に監視を止め、「削除されました」の表示を出さずに前の画面へ戻る
      await _eventSubscription?.cancel();
      await EventRepository.instance.delete(event.id!);
      for (final url in event.detailImageUrls) {
        await ImageStorageService.instance.deleteImageByUrl(url);
      }
      if (!mounted) return;
      Navigator.of(context).pop();
      showSuccessSnackBar(context, 'イベントを削除しました');
    } catch (e) {
      Logger.error('EventDetailScreen', 'イベントの削除に失敗', error: e);
      if (!mounted) return;
      showErrorSnackBar(context, userMessageOf(e, fallback: 'イベントの削除に失敗しました'));
      // 削除できなかったので、監視を再開する
      _eventSubscription = EventRepository.instance
          .watchEvent(widget.eventId)
          .listen(_onEventChanged, onError: _onEventError);
    }
  }

  /// URLをブラウザで開く。開けない場合はコピーできるよう案内する
  Future<void> _openUrl(String url) async {
    var opened = false;
    if (UrlUtils.isValidHttpUrl(url)) {
      try {
        opened = await launchUrl(
          Uri.parse(url.trim()),
          mode: LaunchMode.externalApplication,
        );
      } catch (e) {
        Logger.warning('EventDetailScreen', 'URLを開けませんでした', error: e);
      }
    }
    if (opened || !mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('リンクを開けませんでした: $url'),
        action: SnackBarAction(
          label: 'コピー',
          onPressed: () => Clipboard.setData(ClipboardData(text: url)),
        ),
      ),
    );
  }
}
