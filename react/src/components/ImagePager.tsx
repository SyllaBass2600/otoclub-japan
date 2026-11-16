import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MdBrokenImage, MdChevronLeft, MdChevronRight, MdClose, MdZoomIn, MdZoomOut } from 'react-icons/md';

/**
 * 画像（フライヤー → その他画像）を横スワイプで切り替える
 *
 * スワイプは CSS のスクロールスナップで行い、PC では左右の矢印でも切り替えられる。
 * タップで拡大表示する。
 */
export function ImagePager({ imageUrls, height }: { imageUrls: string[]; height: number }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const goTo = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(imageUrls.length - 1, i));
    track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
  };

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setIndex(Math.round(track.scrollLeft / track.clientWidth));
  };

  return (
    <div className="pager" style={{ height }}>
      <div className="pager-track" ref={trackRef} onScroll={onScroll}>
        {imageUrls.map((url) => (
          <button
            key={url}
            type="button"
            className="pager-page"
            onClick={() => setZoomUrl(url)}
            aria-label="画像を拡大"
          >
            {failed.has(url) ? (
              <MdBrokenImage className="placeholder-icon" />
            ) : (
              <img src={url} alt="" onError={() => setFailed((s) => new Set(s).add(url))} />
            )}
          </button>
        ))}
      </div>
      {imageUrls.length > 1 && (
        <>
          {index > 0 && (
            <button type="button" className="pager-arrow pager-arrow-left" aria-label="前の画像" onClick={() => goTo(index - 1)}>
              <MdChevronLeft />
            </button>
          )}
          {index < imageUrls.length - 1 && (
            <button type="button" className="pager-arrow pager-arrow-right" aria-label="次の画像" onClick={() => goTo(index + 1)}>
              <MdChevronRight />
            </button>
          )}
          <div className="pager-dots">
            {imageUrls.map((url, i) => (
              <button
                key={url}
                type="button"
                className={`pager-dot ${i === index ? 'active' : ''}`}
                aria-label={`${i + 1}枚目`}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        </>
      )}
      {zoomUrl && <ZoomableImageViewer url={zoomUrl} onClose={() => setZoomUrl(null)} />}
    </div>
  );
}

/** 画像の拡大表示（ダブルクリック／ボタンで拡大・縮小、拡大中はドラッグやスクロールで移動） */
export function ZoomableImageViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="viewer">
      <div className="viewer-toolbar">
        <button type="button" aria-label={zoomed ? '縮小' : '拡大'} onClick={() => setZoomed((z) => !z)}>
          {zoomed ? <MdZoomOut /> : <MdZoomIn />}
        </button>
        <button type="button" aria-label="閉じる" onClick={onClose}>
          <MdClose />
        </button>
      </div>
      <div
        className={`viewer-scroll ${zoomed ? 'zoomed' : ''}`}
        // 画像の外をクリックしたら閉じる（拡大中は移動の邪魔をしないよう閉じない）
        onClick={(e) => {
          if (!zoomed && e.target === e.currentTarget) onClose();
        }}
      >
        <img src={url} alt="" onDoubleClick={() => setZoomed((z) => !z)} />
      </div>
    </div>,
    document.body,
  );
}
