import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { MdCheckCircleOutline, MdErrorOutline, MdInfoOutline } from 'react-icons/md';

/**
 * 画面下に出す短いお知らせ（Flutter 版の SnackBar）
 *
 * 白黒のデザインなので、成功・失敗は色ではなくアイコンで区別する。
 */
type Kind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: Kind;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  success(message: string): void;
  error(message: string): void;
  info(message: string, action?: ToastItem['action']): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const show = useCallback((kind: Kind, message: string, action?: ToastItem['action']) => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-2), { id, kind, message, action }]);
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), action ? 8000 : 4000);
  }, []);

  const api = useRef<ToastApi>({
    success: (m) => show('success', m),
    error: (m) => show('error', m),
    info: (m, a) => show('info', m, a),
  }).current;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-area" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            {t.kind === 'success' ? <MdCheckCircleOutline /> : t.kind === 'error' ? <MdErrorOutline /> : <MdInfoOutline />}
            <span className="toast-message">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action?.onClick();
                  setItems((list) => list.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('ToastProvider の中で使ってください');
  return api;
}
