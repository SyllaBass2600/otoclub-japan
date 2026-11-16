import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  MdAccessTime,
  MdAlternateEmail,
  MdArrowBack,
  MdCalendarToday,
  MdDeleteOutline,
  MdDirections,
  MdEdit,
  MdEvent,
  MdEventAvailable,
  MdKeyboardArrowDown,
  MdLanguage,
  MdOutlineMap,
  MdMoreVert,
  MdPlace,
} from 'react-icons/md';
import { useNavigate, useParams } from 'react-router-dom';
import { EventFormDialog } from '../components/EventFormDialog';
import { ImagePager } from '../components/ImagePager';
import { ConfirmDialog, Modal } from '../components/Modal';
import { Badge } from '../components/SectionHeader';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { APP_NAME } from '../lib/constants';
import { userMessageOf } from '../lib/errors';
import { googleMapsDirectionsUrl, googleMapsSearchUrl, isValidHttpUrl, openExternalUrl } from '../lib/url';
import {
  canBeManagedBy,
  detailImageUrls,
  EVENT_STATUS_LABEL,
  eventStatus,
  formattedDate,
  formattedTime,
  personalCalendarUrl,
  placeLabel,
  type EventData,
} from '../models/event';
import { deleteEvent, watchEvent } from '../repositories/eventRepository';
import { deleteImageByUrl } from '../services/imageStorage';

const APP_BAR_HEIGHT = 56;
const HINT_HEIGHT = 40;

/**
 * イベント詳細画面（/events/:id）
 *
 * 登録した本人と管理者には、ヘッダーに編集・削除のメニューを出す。
 * URL で直接開けるので、イベントのリンクを共有できる。
 */
export function EventDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  // 表示していたイベントが、削除または非公開になったか
  const [noLongerAvailable, setNoLongerAvailable] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [copyLink, setCopyLink] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const hadEventRef = useRef(false);

  const subscribe = () => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = watchEvent(
      id,
      (e) => {
        setNoLongerAvailable(e === null && hadEventRef.current);
        hadEventRef.current = e !== null;
        setEvent(e);
        setLoading(false);
      },
      // 非公開になって読めなくなったときも、読み取り権限のエラーとしてここに届く
      (err) => {
        console.error('[EventDetail] イベントの読み込みに失敗', err);
        setNoLongerAvailable(hadEventRef.current);
        hadEventRef.current = false;
        setEvent(null);
        setLoading(false);
      },
    );
  };

  useEffect(() => {
    hadEventRef.current = false;
    setLoading(true);
    subscribe();
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [id, user?.uid]);

  useLayoutEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    document.title = event ? `${event.eventName} | ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = APP_NAME;
    };
  }, [event]);

  const goBack = () => {
    // 直接開いたとき（履歴がない）はトップへ
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  };

  /** URL をブラウザで開く。開けない場合はコピーできるよう案内する */
  const openUrl = (url: string) => {
    if (isValidHttpUrl(url) && openExternalUrl(url.trim())) return;
    toast.info(`リンクを開けませんでした: ${url}`, {
      label: 'コピー',
      onClick: () => void navigator.clipboard?.writeText(url),
    });
  };

  /** 個人の Google カレンダーの予定作成画面を開く（ブロックされたらリンクを見せる） */
  const addToPersonalCalendar = (e: EventData) => {
    const link = personalCalendarUrl(e);
    if (openExternalUrl(link)) {
      toast.info('Googleカレンダーを開きました。内容を確認して保存してください');
    } else {
      setCopyLink(link);
    }
  };

  /** イベントを削除する（画像も消す。公式カレンダーからは Functions が消す） */
  const remove = async (e: EventData) => {
    setConfirmingDelete(false);
    try {
      // 先に監視を止め、「削除されました」の表示を出さずに前の画面へ戻る
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      await deleteEvent(e.id!);
      for (const url of detailImageUrls(e)) await deleteImageByUrl(url);
      toast.success('イベントを削除しました');
      goBack();
    } catch (err) {
      console.error('[EventDetail] イベントの削除に失敗', err);
      toast.error(userMessageOf(err, 'イベントの削除に失敗しました'));
      subscribe(); // 削除できなかったので、監視を再開する
    }
  };

  const backButton = (
    <button type="button" className="icon-btn icon-btn-white" aria-label="戻る" onClick={goBack}>
      <MdArrowBack />
    </button>
  );

  if (loading || !event) {
    return (
      <>
        <header className="app-bar">
          <div className="app-bar-side">{backButton}</div>
          <h1 className="app-title app-title-small">イベント詳細</h1>
          <div className="app-bar-side" />
        </header>
        <div className="center-pad">
          {loading ? (
            <span className="spinner" />
          ) : (
            <p>{noLongerAvailable ? 'このイベントは削除されたか、非公開になりました' : 'イベントが見つかりません'}</p>
          )}
        </div>
      </>
    );
  }

  const images = detailImageUrls(event);
  const place = placeLabel(event);
  const status = eventStatus(event);
  const canManage = canBeManagedBy(event, user);
  const imageHeight = Math.max(240, viewportHeight - APP_BAR_HEIGHT - HINT_HEIGHT);

  return (
    <>
      <header className="app-bar app-bar-sticky">
        <div className="app-bar-side">{backButton}</div>
        <h1 className="app-title app-title-small app-title-ellipsis">{event.eventName}</h1>
        <div className="app-bar-side app-bar-actions">
          {canManage && (
            <div className="account">
              <button
                type="button"
                className="icon-btn icon-btn-white"
                aria-label="イベントの管理"
                aria-haspopup="menu"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <MdMoreVert />
              </button>
              {menuOpen && (
                <>
                  <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        setEditing(true);
                      }}
                    >
                      <MdEdit /> 編集
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmingDelete(true);
                      }}
                    >
                      <MdDeleteOutline /> 削除
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {images.length > 0 ? (
        // 開いた直後は画像を画面いっぱいに表示し、横スワイプで切り替え、スクロールで詳細へ
        <div>
          <ImagePager imageUrls={images} height={imageHeight} />
          <div className="scroll-hint" style={{ height: HINT_HEIGHT }}>
            <MdKeyboardArrowDown />
            <span>
              {images.length > 1 ? 'スワイプで次の画像 ・ タップで拡大 ・ スクロールで詳細' : 'タップで拡大 ・ スクロールで詳細'}
            </span>
          </div>
        </div>
      ) : (
        <div className="detail-hero">
          <MdEvent />
        </div>
      )}

      <main className="container detail-body">
        <div className="badges">
          <Badge label={EVENT_STATUS_LABEL[status]} filled={status !== 'past'} muted={status === 'past'} large />
          {!event.isPublished && <Badge label="非公開" large />}
        </div>

        <h2 className="detail-heading">開催情報</h2>
        <InfoCard icon={<MdCalendarToday />} label="開催日" value={formattedDate(event)} />
        <InfoCard icon={<MdAccessTime />} label="時間" value={formattedTime(event)} />
        {place && <InfoCard icon={<MdPlace />} label="場所" value={place} />}

        {place && (
          <div className="button-row">
            <button type="button" className="btn btn-outlined" onClick={() => openUrl(googleMapsSearchUrl(place))}>
              <MdOutlineMap /> Google マップで開く
            </button>
            <button type="button" className="btn btn-outlined" onClick={() => openUrl(googleMapsDirectionsUrl(place))}>
              <MdDirections /> 経路を調べる
            </button>
          </div>
        )}

        <button type="button" className="btn btn-filled btn-block" onClick={() => addToPersonalCalendar(event)}>
          <MdEventAvailable /> 個人カレンダーに追加
        </button>

        {(event.websiteUrl || event.twitterUrl) && (
          <>
            <h3 className="detail-subheading">公式リンク</h3>
            <div className="button-row">
              {event.websiteUrl && (
                <button type="button" className="btn btn-filled" onClick={() => openUrl(event.websiteUrl!)}>
                  <MdLanguage /> 公式サイト
                </button>
              )}
              {event.twitterUrl && (
                <button type="button" className="btn btn-filled" onClick={() => openUrl(event.twitterUrl!)}>
                  <MdAlternateEmail /> X（Twitter）
                </button>
              )}
            </div>
          </>
        )}

        <hr className="divider" />

        <h2 className="detail-heading">イベント詳細</h2>
        <p className="detail-description">{event.description || '（詳細はありません）'}</p>
      </main>

      {editing && <EventFormDialog event={event} onClose={() => setEditing(false)} />}
      {confirmingDelete && (
        <ConfirmDialog
          title="イベントを削除"
          message={`「${event.eventName}」を削除します。元に戻せません。よろしいですか？`}
          confirmLabel="削除する"
          onConfirm={() => void remove(event)}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
      {copyLink && <CopyLinkDialog link={copyLink} onClose={() => setCopyLink(null)} />}
    </>
  );
}

function InfoCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="info-card">
      <div className="info-card-icon">{icon}</div>
      <div>
        <div className="info-card-label">{label}</div>
        <div className="info-card-value">{value}</div>
      </div>
    </div>
  );
}

/** ポップアップがブロックされたときに、カレンダー追加のリンクをコピーできるようにする */
function CopyLinkDialog({ link, onClose }: { link: string; onClose: () => void }) {
  const toast = useToast();
  return (
    <Modal onClose={onClose} className="modal-small" labelledBy="copy-title">
      <div className="modal-body">
        <h2 id="copy-title" className="dialog-title">
          個人カレンダーに追加
        </h2>
        <p>次のリンクをブラウザで開くと、ご自身のGoogleカレンダーに追加できます。</p>
        <p className="selectable-link">{link}</p>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-text" onClick={onClose}>
          閉じる
        </button>
        <button
          type="button"
          className="btn btn-filled"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              toast.info('リンクをコピーしました');
            } catch {
              toast.error('コピーできませんでした');
            }
            onClose();
          }}
        >
          リンクをコピー
        </button>
      </div>
    </Modal>
  );
}
