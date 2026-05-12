interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  color?: string;
  /** Large visual emphasis variant */
  variant?: "default" | "hero";
}

/** Simple statistic card following UNDP clean design. */
export function StatCard({
  label,
  value,
  sublabel,
  color,
  variant = "default",
}: StatCardProps) {
  if (variant === "hero") {
    return (
      <div className="text-center">
        <p
          className="text-5xl font-bold tabular-nums"
          style={{ color: color ?? "var(--undp-blue)" }}
        >
          {value}
        </p>
        <p className="text-sm text-[var(--undp-gray)] mt-1 leading-snug">
          {label}
        </p>
        {sublabel && (
          <p className="text-xs text-[var(--undp-gray)]/60 mt-0.5">
            {sublabel}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-md p-5">
      <p className="text-sm text-[var(--undp-gray)] mb-1">{label}</p>
      <p
        className="text-3xl font-light tabular-nums"
        style={{ color: color ?? "var(--undp-black)" }}
      >
        {value}
      </p>
      {sublabel && (
        <p className="text-xs text-[var(--undp-gray)] mt-1">{sublabel}</p>
      )}
    </div>
  );
}
