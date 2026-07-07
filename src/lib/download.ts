/**
 * Browser-side file download helper.
 *
 * Triggers a download via Blob + URL.createObjectURL + synthetic <a> click.
 * Used by the sustainability CSV export and the model-comparison ratings
 * export. Kept dependency-free so any client component can import it.
 */

export function downloadFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
