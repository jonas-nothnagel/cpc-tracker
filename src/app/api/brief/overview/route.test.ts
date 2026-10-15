import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

// On the committed data, not fixtures: the landing has to show what the
// country's brief opens with.
const get = (query: string) => GET(new NextRequest(`http://localhost/api/brief/overview?${query}`));

describe("GET /api/brief/overview", () => {
  it("rejects a country that is not in the registry", async () => {
    expect((await get("country=atlantis")).status).toBe(404);
  });

  it("gives Panama's brief figures: its four standard documents, without the hidden ones or the reported actions", async () => {
    // Read off /panama/brief (2026-10-05): 4 policy documents, 100 targets,
    // 3,613 target pairs compared. The old landing wheel drew 5 documents.
    const res = await get("country=panama");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect([body.documents, body.targets, body.counts.total]).toEqual([4, 100, 3613]);
    const { reinforce, partial, apart, none } = body.counts;
    expect(reinforce + partial + apart + none).toBe(3613);
  });
});
