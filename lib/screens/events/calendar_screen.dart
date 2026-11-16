import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../config/admin.dart';
import '../../main.dart' show appName;
import '../../models/app_exception.dart';
import '../../models/event_data.dart';
import '../../repositories/event_repository.dart';
import '../../services/auth_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/date_formats.dart';
import '../../utils/snack_bars.dart';
import '../../widgets/event_form_dialog.dart';
import '../../widgets/section_header.dart';
import 'event_detail_screen.dart';

/// カレンダー画面（トップ画面）
///
/// 月のイベントを読み、日付グリッドの印と選択日の一覧の両方に使う。
/// 公開中のイベントは誰でも見られる。ログインすると、イベントを登録でき、
/// 自分が登録した非公開のイベントも表示される。
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  static const _weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  // 白黒のデザインなので、土日は色ではなく文字の濃さで分ける
  static const _sundayColor = AppColors.ink;
  static const _saturdayColor = AppColors.ink;

  DateTime _selectedDate = DateTime.now();
  DateTime _focusedMonth = DateTime.now();

  User? _user = AuthService.instance.currentUser;
  StreamSubscription<User?>? _authSubscription;
  bool _isSigningIn = false;

  late Stream<List<EventData>> _monthEvents = _monthEventsStream();

  @override
  void initState() {
    super.initState();
    // ログイン・ログアウトしたら、自分の非公開イベントを含めて読み直す
    _authSubscription = AuthService.instance.authStateChanges.listen((user) {
      if (!mounted || user?.uid == _user?.uid) return;
      setState(() {
        _user = user;
        _monthEvents = _monthEventsStream();
      });
    });
  }

  @override
  void dispose() {
    _authSubscription?.cancel();
    super.dispose();
  }

  /// 表示中の月のイベント（日付順）
  Stream<List<EventData>> _monthEventsStream() {
    final start = DateTime(_focusedMonth.year, _focusedMonth.month, 1);
    final end = DateTime(_focusedMonth.year, _focusedMonth.month + 1, 1);
    return EventRepository.instance
        .watchEventsBetween(start, end,
            myUid: _user?.uid, includeAll: isAdminUser(_user));
  }

  /// 月を切り替える。今月なら今日、それ以外は1日を選択する
  void _changeMonth(int delta) {
    final now = DateTime.now();
    final month = DateTime(_focusedMonth.year, _focusedMonth.month + delta);
    setState(() {
      _focusedMonth = month;
      _selectedDate = month.year == now.year && month.month == now.month
          ? now
          : month;
      _monthEvents = _monthEventsStream();
    });
  }

  static bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  Future<void> _signIn() async {
    setState(() => _isSigningIn = true);
    try {
      await AuthService.instance.signInWithGoogle();
    } catch (e) {
      if (mounted) showErrorSnackBar(context, userMessageOf(e));
    } finally {
      if (mounted) setState(() => _isSigningIn = false);
    }
  }

  Future<void> _signOut() async {
    try {
      await AuthService.instance.signOut();
    } catch (e) {
      if (mounted) showErrorSnackBar(context, userMessageOf(e));
    }
  }

  /// イベントを登録する（選択中の日付を初期値にする）。ログインしていなければ先にログインする
  Future<void> _addEvent() async {
    if (_user == null) {
      await _signIn();
      if (!mounted || AuthService.instance.currentUser == null) return;
    }
    await showDialog<bool>(
      context: context,
      builder: (context) => EventFormDialog(initialDate: _selectedDate),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(appName),
        actions: [_buildAccountButton(), const SizedBox(width: 8)],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _isSigningIn ? null : _addEvent,
        icon: const Icon(Icons.add),
        label: const Text('イベントを登録'),
      ),
      body: Stack(
        children: [
          StreamBuilder<List<EventData>>(
            stream: _monthEvents,
            builder: (context, snapshot) {
              final events = snapshot.data ?? const <EventData>[];
              return SingleChildScrollView(
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 760),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const SizedBox(height: 16),
                        const SectionHeader(
                          title: 'カレンダー',
                          icon: Icons.calendar_month,
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: _buildCalendarCard(events),
                        ),
                        const SizedBox(height: 20),
                        SectionHeader(
                          title:
                              '${DateFormats.monthDayWeekday(_selectedDate)}のイベント',
                          icon: Icons.event,
                        ),
                        _buildEventList(snapshot, events),
                        // 右下の登録ボタンに一覧が隠れないよう余白を取る
                        const SizedBox(height: 96),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  /// ヘッダー右のログイン / アカウントのボタン
  Widget _buildAccountButton() {
    final user = _user;
    if (user == null) {
      return TextButton.icon(
        onPressed: _isSigningIn ? null : _signIn,
        // ヘッダーは黒地なので白抜きの枠線ボタンにする
        style: TextButton.styleFrom(
          foregroundColor: Colors.white,
          side: const BorderSide(color: Colors.white, width: 1.5),
        ),
        icon: _isSigningIn
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            : const Icon(Icons.login),
        label: const Text('ログイン'),
      );
    }
    final name = user.displayName?.trim().isNotEmpty == true
        ? user.displayName!
        : (user.email ?? 'ログイン中');
    return PopupMenuButton<String>(
      tooltip: 'アカウント',
      onSelected: (value) {
        if (value == 'signOut') _signOut();
      },
      itemBuilder: (context) => [
        PopupMenuItem<String>(
          enabled: false,
          child: Text(
            isAdminUser(user) ? '$name（管理者）' : name,
            style: const TextStyle(color: AppColors.ink),
          ),
        ),
        const PopupMenuDivider(),
        const PopupMenuItem<String>(
          value: 'signOut',
          child: ListTile(
            leading: Icon(Icons.logout),
            title: Text('ログアウト'),
            contentPadding: EdgeInsets.zero,
          ),
        ),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: CircleAvatar(
          radius: 16,
          backgroundColor: AppColors.selectedBackground,
          foregroundImage:
              user.photoURL != null
              ? NetworkImage(user.photoURL!,
                  webHtmlElementStrategy: WebHtmlElementStrategy.prefer)
              : null,
          child: Text(
            name.characters.first,
            style: const TextStyle(color: AppColors.primaryDeep),
          ),
        ),
      ),
    );
  }

  /// 月選択と日付グリッドのカード
  Widget _buildCalendarCard(List<EventData> events) {
    final eventDays = {for (final event in events) event.date.day};
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 4, 8, 12),
        child: Column(
          children: [
            _buildMonthSelector(),
            const SizedBox(height: 4),
            Row(
              children: [
                for (var i = 0; i < 7; i++)
                  Expanded(
                    child: Center(
                      child: Text(
                        _weekdays[i],
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: i == 0
                              ? _sundayColor
                              : i == 6
                                  ? _saturdayColor
                                  : AppColors.inkMuted,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            _buildDayGrid(eventDays),
          ],
        ),
      ),
    );
  }

  /// 月選択ヘッダー
  Widget _buildMonthSelector() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        IconButton(
          tooltip: '前の月',
          color: AppColors.primaryDeep,
          icon: const Icon(Icons.chevron_left),
          onPressed: () => _changeMonth(-1),
        ),
        Text(
          DateFormats.yearMonth(_focusedMonth),
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: AppColors.ink,
          ),
        ),
        IconButton(
          tooltip: '次の月',
          color: AppColors.primaryDeep,
          icon: const Icon(Icons.chevron_right),
          onPressed: () => _changeMonth(1),
        ),
      ],
    );
  }

  /// 日付グリッド（イベントがある日には印を付ける）
  Widget _buildDayGrid(Set<int> eventDays) {
    final firstDayOfMonth = DateTime(_focusedMonth.year, _focusedMonth.month, 1);
    final daysInMonth =
        DateTime(_focusedMonth.year, _focusedMonth.month + 1, 0).day;
    final startWeekday = firstDayOfMonth.weekday % 7; // 日曜日を0にする
    final weeks = ((startWeekday + daysInMonth) / 7).ceil();
    final now = DateTime.now();

    return Column(
      children: List.generate(weeks, (weekIndex) {
        return Row(
          children: List.generate(7, (dayIndex) {
            final dayNumber = weekIndex * 7 + dayIndex - startWeekday + 1;
            if (dayNumber < 1 || dayNumber > daysInMonth) {
              return const Expanded(child: SizedBox(height: 44));
            }

            final date =
                DateTime(_focusedMonth.year, _focusedMonth.month, dayNumber);
            final isSelected = _isSameDay(_selectedDate, date);
            final isToday = _isSameDay(now, date);
            final hasEvent = eventDays.contains(dayNumber);

            final Color textColor = isSelected
                ? Colors.white
                : dayIndex == 0
                    ? _sundayColor
                    : dayIndex == 6
                        ? _saturdayColor
                        : AppColors.ink;

            return Expanded(
              child: Padding(
                padding: const EdgeInsets.all(2),
                child: Material(
                  color: isSelected
                      ? AppColors.primaryDeep
                      : isToday
                          ? AppColors.selectedBackground
                          : Colors.transparent,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppDimens.radius),
                    side: isToday && !isSelected
                        ? const BorderSide(color: AppColors.primary, width: 2)
                        : BorderSide.none,
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => setState(() => _selectedDate = date),
                    child: SizedBox(
                      height: 44,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            '$dayNumber',
                            style: TextStyle(
                              color: textColor,
                              fontWeight: isSelected || isToday
                                  ? FontWeight.bold
                                  : FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Container(
                            width: 6,
                            height: 6,
                            decoration: BoxDecoration(
                              color: !hasEvent
                                  ? Colors.transparent
                                  : isSelected
                                      ? Colors.white
                                      : AppColors.pinkAccent,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            );
          }),
        );
      }),
    );
  }

  /// 選択日のイベント一覧
  Widget _buildEventList(
    AsyncSnapshot<List<EventData>> snapshot,
    List<EventData> monthEvents,
  ) {
    if (snapshot.hasError) {
      return _buildMessage(
        Icons.error_outline,
        userMessageOf(snapshot.error, fallback: 'イベントの読み込みに失敗しました'),
      );
    }
    if (!snapshot.hasData) {
      return const Padding(
        padding: EdgeInsets.all(40),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    final events = monthEvents
        .where((event) => _isSameDay(event.date, _selectedDate))
        .toList()
      ..sort((a, b) => a.startDateTime.compareTo(b.startDateTime));

    if (events.isEmpty) {
      return _buildMessage(Icons.event_busy, 'この日のイベントはありません');
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          for (final event in events)
            Padding(
              // イベントごとに別のカードとして作る（日付を切り替えたとき、前の日の画像を使い回さない）
              key: ValueKey(event.id),
              padding: const EdgeInsets.only(bottom: 12),
              child: CalendarEventCard(
                event: event,
                onTap: () => _navigateToEventDetail(event),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildMessage(IconData icon, String message) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 32),
      child: Column(
        children: [
          Icon(icon, size: 56, color: AppColors.inkMuted),
          const SizedBox(height: 12),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14, color: AppColors.inkMuted),
          ),
        ],
      ),
    );
  }

  void _navigateToEventDetail(EventData event) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => EventDetailScreen(eventId: event.id!),
      ),
    );
  }
}

/// 選択日のイベントのカード（左にフライヤー、右にイベントの情報）
class CalendarEventCard extends StatelessWidget {
  const CalendarEventCard({super.key, required this.event, required this.onTap});

  final EventData event;
  final VoidCallback onTap;

  /// フライヤーの表示幅（高さは A4 縦の比率）
  static const double _flyerWidth = 110;

  @override
  Widget build(BuildContext context) {
    final imageUrl = event.listImageUrl;
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: _flyerWidth,
              height: _flyerWidth * 297 / 210,
              child: ColoredBox(
                color: AppColors.selectedBackground,
                child: imageUrl != null
                    ? Image.network(
                        // 画像が変わったら <img> を作り直す（同じ場所の <img> は URL を変えても切り替わらない）
                        key: ValueKey(imageUrl),
                        imageUrl,
                        // <img> で表示する（Storage が CORS を許可していないため。ダウンロードを試さないので速い）
                        webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                        fit: BoxFit.contain,
                        errorBuilder: (context, error, stack) =>
                            _placeholder(),
                      )
                    : _placeholder(),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        _badge(event.status.label, event.status.color),
                        if (!event.isPublished)
                          _badge('非公開', AppColors.ink, filled: true),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      event.eventName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 8),
                    _infoRow(Icons.access_time, event.formattedTime),
                    if (event.placeLabel != null)
                      _infoRow(Icons.place_outlined, event.placeLabel!),
                    if (event.description.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        event.description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.inkMuted,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const Padding(
              padding: EdgeInsets.only(top: 12, right: 8),
              child: Icon(Icons.chevron_right, color: AppColors.inkMuted),
            ),
          ],
        ),
      ),
    );
  }

  static Widget _placeholder() => const Center(
        child: Icon(Icons.event, size: 40, color: AppColors.inkMuted),
      );

  /// バッジ（枠線だけ、または黒の塗り）
  static Widget _badge(String label, Color color, {bool filled = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: filled ? color : Colors.white,
        border: Border.all(color: color, width: 1.5),
        borderRadius: BorderRadius.circular(AppDimens.radius),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          color: filled ? Colors.white : color,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }

  static Widget _infoRow(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 15, color: AppColors.primaryDeep),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              text,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13, color: AppColors.ink),
            ),
          ),
        ],
      ),
    );
  }
}
