import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * ダイアログの土台（黒枠・影なし）
 *
 * 背景のクリックと Esc で onClose を呼ぶ。dismissible が false のとき（保存中など）は閉じない。
 */
export function Modal({
  children,
  onClose,
  dismissible = true,
  className = '',
  labelledBy,
}: {
  children: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
  className?: string;
  labelledBy?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, dismissible]);

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissible) onClose();
      }}
    >
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** はい／いいえの確認ダイアログ */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal onClose={onCancel} className="modal-small" labelledBy="confirm-title">
      <div className="modal-body">
        <h2 id="confirm-title" className="dialog-title">
          {title}
        </h2>
        <p>{message}</p>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-text" onClick={onCancel}>
          キャンセル
        </button>
        <button type="button" className="btn btn-filled" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
