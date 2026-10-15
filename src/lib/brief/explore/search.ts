/** Lower case without accents, so "Política" matches "politica". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Targets whose label or text holds every word of the query (two letters or
 * more), ignoring case and accents. Returns their indices, in order.
 */
export function searchTargets(items: { label: string; text: string }[], query: string): number[] {
  const words = fold(query)
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  if (words.length === 0) return [];
  const out: number[] = [];
  items.forEach((item, i) => {
    const hay = fold(`${item.label} ${item.text}`);
    if (words.every((w) => hay.includes(w))) out.push(i);
  });
  return out;
}
