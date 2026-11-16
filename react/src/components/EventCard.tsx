import { useState } from 'react';
import { MdAccessTime, MdChevronRight, MdEvent, MdPlace } from 'react-icons/md';
import {
  EVENT_STATUS_LABEL,
  eventStatus,
  formattedTime,
  listImageUrl,
  placeLabel,
  type EventData,
} from '../models/event';
import { Badge } from './SectionHeader';

/** 選択日のイベントのカード（左にフライヤー、右にイベントの情報） */
export function EventCard({ event, onClick }: { event: EventData; onClick: () => void }) {
  const imageUrl = listImageUrl(event);
  const [imageFailed, setImageFailed] = useState(false);
  const status = eventStatus(event);
  const place = placeLabel(event);

  return (
    <button type="button" className="card event-card" onClick={onClick}>
      <div className="event-card-flyer">
        {imageUrl && !imageFailed ? (
          <img src={imageUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} />
        ) : (
          <MdEvent className="placeholder-icon" />
        )}
      </div>
      <div className="event-card-body">
        <div className="badges">
          <Badge label={EVENT_STATUS_LABEL[status]} muted={status === 'past'} />
          {!event.isPublished && <Badge label="非公開" filled />}
        </div>
        <div className="event-card-title">{event.eventName}</div>
        <div className="info-row">
          <MdAccessTime />
          <span>{formattedTime(event)}</span>
        </div>
        {place && (
          <div className="info-row">
            <MdPlace />
            <span>{place}</span>
          </div>
        )}
        {event.description && <div className="event-card-desc">{event.description}</div>}
      </div>
      <MdChevronRight className="event-card-chevron" />
    </button>
  );
}
