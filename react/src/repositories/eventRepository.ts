import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  Timestamp,
  where,
  type Query,
  type QueryConstraint,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { AppError, UpdateConflictError } from '../lib/errors';
import { eventFields, eventFromFirestore, type EventData } from '../models/event';

/**
 * イベント（events）の読み書き
 *
 * 公開中のイベントは誰でも（ログインしていなくても）読める。
 * 非公開のイベントは、登録した本人と管理者だけが読める（firestore.rules）。
 * ルールは絞り込み条件ではないため、クエリには isPublished == true か createdBy == 自分 を付ける
 * （付けないとクエリ全体が拒否される）。管理者は付けずに全件を読む。
 */
export const EVENTS = 'events';

const eventsRef = () => collection(db, EVENTS);

/** 新しいイベントのID（画像の保存先と揃えるため、保存前に決める） */
export const newEventId = (): string => doc(eventsRef()).id;

/** Date を Timestamp にする */
const toFirestoreValues = (fields: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, v instanceof Date ? Timestamp.fromDate(v) : v]),
  );

/** 新規作成用。値のない項目は書き込まない */
const forCreate = (event: EventData): Record<string, unknown> =>
  Object.fromEntries(Object.entries(toFirestoreValues(eventFields(event))).filter(([, v]) => v != null));

/** 更新用。作成日時・登録者は変えず、画面で消した値は項目ごと削除する */
function forUpdate(event: EventData): Record<string, unknown> {
  const fields = toFirestoreValues(eventFields(event));
  delete fields.createdAt;
  delete fields.createdBy;
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v ?? deleteField()]));
}

const toEvents = (snap: QuerySnapshot): EventData[] =>
  snap.docs.map((d) => eventFromFirestore(d.data(), d.id));

/** イベントの変化を監視する（ない場合・削除された場合は null） */
export function watchEvent(
  id: string,
  onChange: (event: EventData | null) => void,
  onError: (e: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, EVENTS, id),
    (snap) => {
      const data = snap.data();
      onChange(data ? eventFromFirestore(data, snap.id) : null);
    },
    onError,
  );
}

/**
 * from 以上 until 未満の日付のイベントを監視する（日付順）
 *
 * 公開中のイベントと、myUid が登録したイベント（非公開を含む）を合わせる。
 * ログインしていなければ公開中のイベントだけ。管理者（includeAll）は非公開を含むすべて。
 * 必要な複合インデックスは firestore.indexes.json にある。
 */
export function watchEventsBetween(
  from: Date,
  until: Date,
  opts: { myUid: string | null; includeAll: boolean },
  onChange: (events: EventData[]) => void,
  onError: (e: unknown) => void,
): Unsubscribe {
  const range: QueryConstraint[] = [
    where('date', '>=', Timestamp.fromDate(from)),
    where('date', '<', Timestamp.fromDate(until)),
    orderBy('date'),
  ];
  const q = (...filters: QueryConstraint[]): Query => query(eventsRef(), ...filters, ...range);

  if (opts.includeAll) {
    return onSnapshot(q(), (s) => onChange(toEvents(s)), onError);
  }
  if (opts.myUid == null) {
    return onSnapshot(q(where('isPublished', '==', true)), (s) => onChange(toEvents(s)), onError);
  }

  // 公開中と自分の分の両方が届いてから流す（combineLatest）
  let published: EventData[] | null = null;
  let mine: EventData[] | null = null;
  const emit = () => {
    if (published === null || mine === null) return;
    const ids = new Set(published.map((e) => e.id));
    const merged = [...published, ...mine.filter((e) => !ids.has(e.id))];
    merged.sort((a, b) => a.date.getTime() - b.date.getTime());
    onChange(merged);
  };
  const unsubA = onSnapshot(
    q(where('isPublished', '==', true)),
    (s) => {
      published = toEvents(s);
      emit();
    },
    onError,
  );
  const unsubB = onSnapshot(
    q(where('createdBy', '==', opts.myUid)),
    (s) => {
      mine = toEvents(s);
      emit();
    },
    onError,
  );
  return () => {
    unsubA();
    unsubB();
  };
}

/** イベントを作成する（id は newEventId で決めたもの） */
export async function createEvent(id: string, event: EventData): Promise<void> {
  await setDoc(doc(db, EVENTS, id), forCreate(event));
}

/**
 * イベントを更新する
 *
 * 編集を始めてから保存するまでに別の画面で更新されていた場合は、上書きせずに
 * UpdateConflictError を投げる（version で判定する楽観ロック）。
 */
export async function updateEvent(event: EventData): Promise<void> {
  if (!event.id) throw new AppError('イベントが見つかりません');
  const ref = doc(db, EVENTS, event.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new AppError('イベントが見つかりません。削除された可能性があります', 'not-found');
    }
    const raw = snap.data().version;
    const version = typeof raw === 'number' ? Math.trunc(raw) : 0;
    if (version !== event.version) {
      throw new UpdateConflictError(
        '別の画面で先にこのイベントが更新されました。画面を開き直して、最新の内容で編集してください',
      );
    }
    tx.update(ref, { ...forUpdate(event), version: version + 1 });
  });
}

export async function deleteEvent(id: string): Promise<void> {
  await deleteDoc(doc(db, EVENTS, id));
}
