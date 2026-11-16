import 'dart:async';

/// 2つのストリームの最新値を組み合わせる（両方に値が届いてから流す）
Stream<R> combineLatest<A, B, R>(
    Stream<A> a, Stream<B> b, R Function(A, B) combine) {
  late StreamController<R> controller;
  StreamSubscription<A>? subA;
  StreamSubscription<B>? subB;
  A? lastA;
  B? lastB;
  var hasA = false;
  var hasB = false;
  var doneCount = 0;

  void emit() {
    if (hasA && hasB) controller.add(combine(lastA as A, lastB as B));
  }

  void onDone() {
    if (++doneCount == 2) controller.close();
  }

  controller = StreamController<R>(
    onListen: () {
      subA = a.listen((v) {
        lastA = v;
        hasA = true;
        emit();
      }, onError: controller.addError, onDone: onDone);
      subB = b.listen((v) {
        lastB = v;
        hasB = true;
        emit();
      }, onError: controller.addError, onDone: onDone);
    },
    onPause: () {
      subA?.pause();
      subB?.pause();
    },
    onResume: () {
      subA?.resume();
      subB?.resume();
    },
    onCancel: () async {
      await subA?.cancel();
      await subB?.cancel();
    },
  );
  return controller.stream;
}
