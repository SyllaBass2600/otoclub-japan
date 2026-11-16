import type { ReactNode } from 'react';

/** 斜めのバー付きのセクション見出し */
export function SectionHeader({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <div className="section-header">
      <span className="section-bar" aria-hidden="true" />
      <span className="section-icon" aria-hidden="true">
        {icon}
      </span>
      <h2>{title}</h2>
    </div>
  );
}

/** 開催状況などのバッジ（枠線だけ、または黒の塗り） */
export function Badge({
  label,
  filled = false,
  muted = false,
  large = false,
}: {
  label: string;
  filled?: boolean;
  muted?: boolean;
  large?: boolean;
}) {
  const cls = ['badge', filled && 'badge-filled', muted && 'badge-muted', large && 'badge-large']
    .filter(Boolean)
    .join(' ');
  return <span className={cls}>{label}</span>;
}
