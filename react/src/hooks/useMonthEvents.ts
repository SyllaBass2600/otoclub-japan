import { useEffect, useState } from 'react';
import { isAdminUser } from '../config/admin';
import { watchEventsBetween } from '../repositories/eventRepository';
import type { EventData } from '../models/event';
import { useAuth } from './useAuth';

interface MonthEvents {
  /** 読み込み中は null */
  events: EventData[] | null;
  error: unknown;
}

/**
 * 表示中の月のイベント（日付順）
 *
 * ログイン・ログアウトしたら、自分の非公開イベントを含めて読み直す。
 */
export function useMonthEvents(year: number, month: number): MonthEvents {
  const { user, ready } = useAuth();
  const uid = user?.uid ?? null;
  const admin = isAdminUser(user);
  const [state, setState] = useState<MonthEvents>({ events: null, error: null });

  useEffect(() => {
    if (!ready) return;
    setState({ events: null, error: null });
    const from = new Date(year, month, 1);
    const until = new Date(year, month + 1, 1);
    return watchEventsBetween(
      from,
      until,
      { myUid: uid, includeAll: admin },
      (events) => setState({ events, error: null }),
      (error) => {
        console.error('[Calendar] イベントの読み込みに失敗', error);
        setState({ events: null, error });
      },
    );
  }, [year, month, uid, admin, ready]);

  return state;
}
