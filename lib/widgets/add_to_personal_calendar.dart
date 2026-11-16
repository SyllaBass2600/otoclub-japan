import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../utils/open_url.dart';

/// 個人カレンダーへの追加画面（Google カレンダー）を開く
///
/// Web では新しいタブで Google カレンダーの予定作成画面を開く。
/// 開けない場合（Web 以外、ポップアップのブロック）は、リンクをコピーできるダイアログを出す。
///
/// ポップアップがブロックされないよう、ボタンのタップ処理から await を挟まずに呼ぶこと。
Future<void> addToPersonalCalendar(BuildContext context, Uri url) async {
  final messenger = ScaffoldMessenger.of(context);
  final link = url.toString();

  if (openExternalUrl(link)) {
    messenger.showSnackBar(
      const SnackBar(
        content: Text('Googleカレンダーを開きました。内容を確認して保存してください'),
      ),
    );
    return;
  }

  await showDialog<void>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('個人カレンダーに追加'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('次のリンクをブラウザで開くと、ご自身のGoogleカレンダーに追加できます。'),
          const SizedBox(height: 12),
          SelectableText(link, style: const TextStyle(fontSize: 12)),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: const Text('閉じる'),
        ),
        FilledButton.icon(
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: link));
            if (dialogContext.mounted) Navigator.pop(dialogContext);
            messenger.showSnackBar(
              const SnackBar(content: Text('リンクをコピーしました')),
            );
          },
          icon: const Icon(Icons.copy, size: 18),
          label: const Text('リンクをコピー'),
        ),
      ],
    ),
  );
}
