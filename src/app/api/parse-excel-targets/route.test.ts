import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "./route";

function uploadRequest(file: File): NextRequest {
  const form = new FormData();
  form.set("file", file);
  return { formData: async () => form } as unknown as NextRequest;
}

describe("POST /api/parse-excel-targets size guard", () => {
  it("rejects an Excel upload larger than 15 MB with 413", async () => {
    const big = new File([new Uint8Array(16 * 1024 * 1024)], "huge.xlsx");
    const res = await POST(uploadRequest(big));
    expect(res.status).toBe(413);
  });

  it("rejects a non-Excel file with 400 (before the size check)", async () => {
    const wrong = new File([new Uint8Array(10)], "notes.txt");
    const res = await POST(uploadRequest(wrong));
    expect(res.status).toBe(400);
  });
});
