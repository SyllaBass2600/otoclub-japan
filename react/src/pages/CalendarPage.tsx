import { useState, type ReactNode } from 'react';
import { MdAdd, MdCalendarMonth, MdChevronLeft, MdChevronRight, MdErrorOutline, MdEvent, MdEventBusy } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';
import { AccountButton, useSignIn } from '../components/AccountButton';
import { EventCard } from '../components/EventCard';
import { EventFormDialog } from '../components/EventFormDialog';
import { SectionHeader } from '../components/SectionHeader';
import { useAuth } from '../hooks/useAuth';
import { useMonthEvents } from '../hooks/useMonthEvents';
import { APP_NAME } from '../lib/constants';
import { formatMonthDayWeekday, formatYearMonth, isSameDay, monthGrid } from '../lib/dates';
import { userMessageOf } from '../lib/errors';
import { startDateTime } from '../models/event';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * カレンダー画面（トップ画面）
 *
 * 月のイベントを読み、日付グリッドの印と選択日の一覧の両方に使う。
 * 公開中のイベントは誰でも見られる。ログインすると、イベントを登録でき、自分の非公開のイベントも表示される。
 */
export function CalendarPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { signingIn, signIn } = useSignIn();

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [focusedMonth, setFocusedMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [formOpen, setFormOpen] = useState(false);

  const year = focusedMonth.getFullYear();
  const month = focusedMonth.getMonth();
  const { events, error } = useMonthEvents(year, month);

  /** 月を切り替える。今月なら今日、それ以外は1日を選択する */
  const changeMonth = (delta: number) => {
    const now = new Date();
    const next = new Date(year, month + delta, 1);
    setFocusedMonth(next);
    setSelectedDate(next.getFullYear() === now.getFullYear() && next.getMonth() === now.getMonth() ? now : next);
  };

  /** イベントを登録する（選択中の日付を初期値にする）。ログインしていなければ先にログインする */
  const addEvent = async () => {
    if (!user) {
      const ok = await signIn();
      if (!ok) return;
    }
    setFormOpen(true);
  };

  const eventDays = new Set((events ?? []).map((e) => e.date.getDate()));
  const dayEvents = (events ?? [])
    .filter((e) => isSameDay(e.date, selectedDate))
    .sort((a, b) => startDateTime(a).getTime() - startDateTime(b).getTime());
  const today = new Date();

  return (
    <>
      <header className="app-bar">
        <div className="app-bar-side" />
        <h1 className="app-title">{APP_NAME}</h1>
        <div className="app-bar-side app-bar-actions">
          <AccountButton signingIn={signingIn} onSignIn={signIn} />
        </div>
      </header>

      <main className="container">
        <SectionHeader title="カレンダー" icon={<MdCalendarMonth />} />
        <div className="card calendar-card">
          <div className="month-selector">
            <button type="button" className="icon-btn" aria-label="前の月" onClick={() => changeMonth(-1)}>
              <MdChevronLeft />
            </button>
            <div className="month-label">{formatYearMonth(focusedMonth)}</div>
            <button type="button" className="icon-btn" aria-label="次の月" onClick={() => changeMonth(1)}>
              <MdChevronRight />
            </button>
          </div>
          <div className="weekdays">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={i === 0 || i === 6 ? 'weekend' : ''}>
                {w}
              </div>
            ))}
          </div>
          <div className="day-grid">
            {monthGrid(year, month).flat().map((day, i) => {
              if (day === null) return <div key={`e${i}`} className="day day-empty" />;
              const date = new Date(year, month, day);
              const selected = isSameDay(selectedDate, date);
              const isToday = isSameDay(today, date);
              const cls = ['day', selected && 'day-selected', isToday && !selected && 'day-today'].filter(Boolean).join(' ');
              return (
                <button
                  key={day}
                  type="button"
                  className={cls}
                  aria-pressed={selected}
                  aria-label={`${month + 1}月${day}日${eventDays.has(day) ? '（イベントあり）' : ''}`}
                  onClick={() => setSelectedDate(date)}
                >
                  <span>{day}</span>
                  <span className={`dot ${eventDays.has(day) ? 'dot-on' : ''}`} />
                </button>
              );
            })}
          </div>
        </div>

        <SectionHeader title={`${formatMonthDayWeekday(selectedDate)}のイベント`} icon={<MdEvent />} />
        {error ? (
          <Message icon={<MdErrorOutline />} text={userMessageOf(error, 'イベントの読み込みに失敗しました')} />
        ) : events === null ? (
          <div className="center-pad">
            <span className="spinner" />
          </div>
        ) : dayEvents.length === 0 ? (
          <Message icon={<MdEventBusy />} text="この日のイベントはありません" />
        ) : (
          <div className="event-list">
            {dayEvents.map((event) => (
              <EventCard key={event.id} event={event} onClick={() => navigate(`/events/${event.id}`)} />
            ))}
          </div>
        )}
        {/* 右下の登録ボタンに一覧が隠れないよう余白を取る */}
        <div style={{ height: 96 }} />
      </main>

      <button type="button" className="fab" onClick={addEvent} disabled={signingIn}>
        <MdAdd /> イベントを登録
      </button>

      {formOpen && <EventFormDialog initialDate={selectedDate} onClose={() => setFormOpen(false)} />}
    </>
  );
}

function Message({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="message">
      <div className="message-icon">{icon}</div>
      <p>{text}</p>
    </div>
  );
}
