/**
 * sha256 hex digest via WebCrypto. Client-safe (browsers in a secure
 * context, which https on Azure and localhost both are) and available in
 * Node 20 / vitest via globalThis.crypto.subtle.
 */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
