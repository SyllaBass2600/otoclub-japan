import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  MdAccessTime,
  MdAddCircleOutline,
  MdAddPhotoAlternate,
  MdAlternateEmail,
  MdCalendarToday,
  MdClose,
  MdDeleteOutline,
  MdDescription,
  MdEdit,
  MdEvent,
  MdLanguage,
  MdLink,
  MdLocationOn,
  MdOutlineMap,
} from 'react-icons/md';
import { useAuth } from '../hooks/useAuth';
import { PREFECTURES, isPrefecture } from '../lib/constants';
import { fromDateInputValue, isValidTime, startOfDay, toDateInputValue } from '../lib/dates';
import { AppError, userMessageOf } from '../lib/errors';
import { formatSize } from '../lib/imageCompress';
import { normalizeOptional, validateOptionalHttpUrl } from '../lib/url';
import { MAX_OTHER_IMAGES, removedEventImageUrls, type EventData } from '../models/event';
import { createEvent, newEventId, updateEvent } from '../repositories/eventRepository';
import { deleteImageByUrl, uploadEventFlyerImage, uploadEventImage } from '../services/imageStorage';
import { Modal } from './Modal';
import { useToast } from './Toast';

/** 編集中の画像（保存済みの URL か、まだアップロードしていないファイル） */
type PendingImage = { key: string; url: string; file?: undefined } | { key: string; url?: undefined; file: File };

let imageKeySeq = 0;
const savedImage = (url: string): PendingImage => ({ key: `s${imageKeySeq++}`, url });
const pickedImage = (file: File): PendingImage => ({ key: `p${imageKeySeq++}`, file });

/** ファイルのプレビュー用 URL（使い終わったら解放する） */
function useObjectUrl(file: File | undefined): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

/**
 * イベントの登録・編集ダイアログ
 *
 * ログインした人が自分のイベントを登録する。編集できるのは登録した本人と管理者だけ。
 */
export function EventFormDialog({
  event,
  initialDate,
  onClose,
}: {
  /** 編集時 */
  event?: EventData;
  /** 新規登録時の日付（カレンダーで選択中の日） */
  initialDate?: Date;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const isEdit = event != null;

  const [eventName, setEventName] = useState(event?.eventName ?? '');
  const [date, setDate] = useState(toDateInputValue(event?.date ?? initialDate ?? new Date()));
  const [startTime, setStartTime] = useState(event && isValidTime(event.startTime) ? event.startTime : '10:00');
  const [endTime, setEndTime] = useState(event && isValidTime(event.endTime) ? event.endTime : '18:00');
  const [prefecture, setPrefecture] = useState(isPrefecture(event?.prefecture) ? event!.prefecture! : '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [websiteUrl, setWebsiteUrl] = useState(event?.websiteUrl ?? '');
  const [twitterUrl, setTwitterUrl] = useState(event?.twitterUrl ?? '');
  const [isPublished, setIsPublished] = useState(event?.isPublished ?? true);

  const [flyerUrl, setFlyerUrl] = useState<string | null>(event?.flyerImageUrl ?? null);
  const [flyerFile, setFlyerFile] = useState<File | null>(null);
  const [otherImages, setOtherImages] = useState<PendingImage[]>(() => (event?.otherImageUrls ?? []).map(savedImage));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const flyerInput = useRef<HTMLInputElement>(null);
  const otherInput = useRef<HTMLInputElement>(null);
  const flyerPreview = useObjectUrl(flyerFile ?? undefined);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (eventName.trim() === '') next.eventName = 'イベント名を入力してください';
    if (!fromDateInputValue(date)) next.date = '日付を選んでください';
    if (!isValidTime(startTime)) next.startTime = '時刻を選んでください';
    if (!isValidTime(endTime)) next.endTime = '時刻を選んでください';
    const w = validateOptionalHttpUrl(websiteUrl);
    if (w) next.websiteUrl = w;
    const t = validateOptionalHttpUrl(twitterUrl);
    if (t) next.twitterUrl = t;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || !validate()) return;
    setSaving(true);
    // この保存でアップロードした画像（保存に失敗したら消す）
    const uploaded: string[] = [];
    try {
      if (!user) throw new AppError('ログインが必要です');

      // 新規作成時もここで ID を決め、画像の保存先（users/{uid}/events/{eventId}/）と揃える
      const eventId = event?.id ?? newEventId();
      // 画像は登録した本人のフォルダに置く
      const ownerUid = event?.createdBy ?? user.uid;

      let newFlyerUrl = flyerUrl;
      if (flyerFile) {
        newFlyerUrl = await uploadEventFlyerImage(ownerUid, eventId, flyerFile);
        uploaded.push(newFlyerUrl);
      }

      // その他画像: 新しく選んだ画像だけアップロードし、並び順はそのまま保つ
      const otherUrls: string[] = [];
      for (const image of otherImages) {
        if (image.url) {
          otherUrls.push(image.url);
        } else {
          const url = await uploadEventImage(ownerUid, eventId, image.file);
          uploaded.push(url);
          otherUrls.push(url);
        }
      }

      const data: EventData = {
        id: event?.id ?? null,
        eventName: eventName.trim(),
        date: startOfDay(fromDateInputValue(date)!),
        startTime,
        endTime,
        description: description.trim(),
        prefecture: prefecture || null,
        location: normalizeOptional(location),
        createdAt: event?.createdAt ?? new Date(),
        createdBy: event?.createdBy ?? user.uid,
        // googleCalendarEventId は Cloud Functions だけが書き込む（保存する項目には含めない）
        googleCalendarEventId: event?.googleCalendarEventId ?? null,
        // 編集を始めた時点の版。保存時に、別の画面で先に更新されていないかを確かめる
        version: event?.version ?? 0,
        isPublished,
        flyerImageUrl: newFlyerUrl,
        otherImageUrls: otherUrls,
        websiteUrl: normalizeOptional(websiteUrl),
        twitterUrl: normalizeOptional(twitterUrl),
      };

      if (isEdit) await updateEvent(data);
      else await createEvent(eventId, data);
      // 公式 Google カレンダーへの登録・更新は Cloud Functions が行う（アプリからは書き込まない）

      // 外した画像・差し替えた画像を Storage から消す（失敗しても保存は成功扱い）
      if (event) {
        const before = [...(event.flyerImageUrl ? [event.flyerImageUrl] : []), ...event.otherImageUrls];
        const after = [...(newFlyerUrl ? [newFlyerUrl] : []), ...otherUrls];
        for (const url of removedEventImageUrls(before, after)) await deleteImageByUrl(url);
      }

      toast.success(isEdit ? 'イベントを更新しました' : 'イベントを登録しました');
      onClose();
    } catch (err) {
      // この回にアップロードした画像はどこからも使われないので消す（入力内容はダイアログに残る）
      for (const url of uploaded) await deleteImageByUrl(url);
      console.error('[EventForm] イベントの保存に失敗', err);
      toast.error(userMessageOf(err, 'イベントの保存に失敗しました'));
      setSaving(false);
    }
  };

  const onPickFlyer = (files: FileList | null) => {
    const file = files?.[0];
    if (file) setFlyerFile(file);
  };

  const onPickOthers = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_OTHER_IMAGES - otherImages.length;
    const picked = Array.from(files).slice(0, remaining).map(pickedImage);
    setOtherImages((list) => [...list, ...picked]);
    if (files.length > remaining) {
      toast.info(`その他画像は${MAX_OTHER_IMAGES}枚までです。先頭の${remaining}枚を追加しました`);
    }
  };

  const copyFlyerUrl = async () => {
    if (!flyerUrl) return;
    try {
      await navigator.clipboard.writeText(flyerUrl);
      toast.info('画像の URL をコピーしました');
    } catch {
      toast.error('コピーできませんでした');
    }
  };

  const flyerShown = flyerPreview ?? flyerUrl;
  const remaining = MAX_OTHER_IMAGES - otherImages.length;

  return (
    <Modal onClose={onClose} dismissible={!saving} className="modal-form" labelledBy="event-form-title">
      <form className="form-dialog" onSubmit={save} noValidate>
        <div className="dialog-header">
          {isEdit ? <MdEdit /> : <MdAddCircleOutline />}
          <h2 id="event-form-title">{isEdit ? 'イベントを編集' : 'イベントを登録'}</h2>
          <button type="button" className="icon-btn icon-btn-white" aria-label="閉じる" onClick={onClose} disabled={saving}>
            <MdClose />
          </button>
        </div>

        <div className="modal-body form-fields">
          <Field label="イベント名 *" icon={<MdEvent />} error={errors.eventName}>
            <input value={eventName} onChange={(e) => setEventName(e.target.value)} maxLength={200} autoFocus />
          </Field>

          <Field label="日付 *" icon={<MdCalendarToday />} error={errors.date}>
            <input type="date" value={date} min="2000-01-01" max="2100-12-31" onChange={(e) => setDate(e.target.value)} />
          </Field>

          <div className="field-row">
            <Field label="開始時刻 *" icon={<MdAccessTime />} error={errors.startTime}>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Field>
            <Field label="終了時刻 *" icon={<MdAccessTime />} error={errors.endTime}>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </Field>
          </div>

          <Field label="都道府県" icon={<MdOutlineMap />}>
            <select value={prefecture} onChange={(e) => setPrefecture(e.target.value)} disabled={saving}>
              <option value="">未選択</option>
              {PREFECTURES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>

          <Field label="開催場所" icon={<MdLocationOn />}>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="会場名・住所など（例: 〇〇ホール 2F）"
              maxLength={500}
            />
          </Field>

          <Field label="説明" icon={<MdDescription />}>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={5000} />
          </Field>

          <Field label="公式サイトURL" icon={<MdLanguage />} error={errors.websiteUrl}>
            <input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://example.com" />
          </Field>

          <Field label="X（Twitter）URL" icon={<MdAlternateEmail />} error={errors.twitterUrl}>
            <input type="url" value={twitterUrl} onChange={(e) => setTwitterUrl(e.target.value)} placeholder="https://x.com/..." />
          </Field>

          {/* フライヤー画像 */}
          <div className="image-field">
            <div className="image-field-label">フライヤー画像（A4縦長・任意）</div>
            <button
              type="button"
              className="flyer-picker"
              onClick={() => flyerInput.current?.click()}
              disabled={saving}
              aria-label="フライヤー画像を選ぶ"
            >
              {flyerShown ? (
                <img src={flyerShown} alt="" />
              ) : (
                <span className="picker-empty">
                  <MdAddPhotoAlternate />
                  タップして画像を選択
                </span>
              )}
            </button>
            {flyerFile && <div className="hint">選択中: {flyerFile.name}（{formatSize(flyerFile.size)}・保存時に圧縮します）</div>}
            <input
              ref={flyerInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                onPickFlyer(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="image-field-actions">
              {(flyerUrl || flyerFile) && (
                <button
                  type="button"
                  className="btn btn-text"
                  disabled={saving}
                  onClick={() => {
                    setFlyerUrl(null);
                    setFlyerFile(null);
                  }}
                >
                  <MdDeleteOutline /> フライヤー画像を外す
                </button>
              )}
              {/* 保存済みで、差し替えていないときだけ URL をコピーできる */}
              {flyerUrl && !flyerFile && (
                <button type="button" className="btn btn-text" onClick={copyFlyerUrl}>
                  <MdLink /> フライヤー画像の URL をコピー
                </button>
              )}
            </div>
            <div className="hint">カレンダーの一覧と、イベント詳細の1枚目に表示されます</div>
          </div>

          {/* その他画像 */}
          <div className="image-field">
            <div className="image-field-label">その他画像（最大{MAX_OTHER_IMAGES}枚・任意）</div>
            <div className="thumbs">
              {otherImages.map((image) => (
                <OtherImageThumb
                  key={image.key}
                  image={image}
                  disabled={saving}
                  onRemove={() => setOtherImages((list) => list.filter((x) => x.key !== image.key))}
                />
              ))}
              {remaining > 0 && (
                <button
                  type="button"
                  className="thumb thumb-add"
                  onClick={() => otherInput.current?.click()}
                  disabled={saving}
                  aria-label="画像を追加"
                >
                  <MdAddPhotoAlternate />
                  <span>追加</span>
                </button>
              )}
            </div>
            <input
              ref={otherInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                onPickOthers(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="hint">
              イベント詳細で、フライヤーの後ろにスワイプで表示されます。フライヤーがないときは、1枚目が一覧に表示されます
            </div>
          </div>

          <hr />

          <label className="switch-row">
            <div>
              <div className="switch-title">公開</div>
              <div className="hint">
                {isPublished
                  ? 'カレンダーに表示し、公式カレンダーにも登録します'
                  : '自分にだけ表示します（公式カレンダーには登録しません）'}
              </div>
            </div>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
            />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-text" onClick={onClose} disabled={saving}>
            キャンセル
          </button>
          <button type="submit" className="btn btn-filled" disabled={saving}>
            {saving ? <span className="spinner spinner-small spinner-white" /> : isEdit ? '更新' : '登録'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  icon,
  error,
  children,
}: {
  label: string;
  icon: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className={`field ${error ? 'field-error' : ''}`}>
      <span className="field-label">{label}</span>
      <span className="field-box">
        <span className="field-icon" aria-hidden="true">
          {icon}
        </span>
        {children}
      </span>
      {error && <span className="field-message">{error}</span>}
    </label>
  );
}

function OtherImageThumb({
  image,
  disabled,
  onRemove,
}: {
  image: PendingImage;
  disabled: boolean;
  onRemove: () => void;
}) {
  const preview = useObjectUrl(image.file);
  return (
    <div className="thumb">
      <img src={preview ?? image.url} alt="" />
      <button type="button" className="thumb-remove" aria-label="この画像を外す" onClick={onRemove} disabled={disabled}>
        <MdClose />
      </button>
    </div>
  );
}
