/**
 * A document while it is read: one square per part, in its colour once the
 * part is read, the part being read pulsing. Before the parts are known, one
 * square pulses. The words beside it say the same, so it is hidden from
 * assistive technology.
 */
export function ReadingMarks({ part = 0, parts, color }: { part?: number; parts?: number; color: string }) {
  const total = parts && parts > 0 ? parts : 1;
  const done = Math.min(part, total);
  // Once every part is read, the last one pulses while the reading is put together.
  const current = Math.min(done, total - 1);
  return (
    <span className="up-reading" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="up-reading-part"
          data-done={(i < done && i !== current) || undefined}
          data-current={i === current || undefined}
          style={i <= current ? { background: color } : undefined}
        />
      ))}
    </span>
  );
}
