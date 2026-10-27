import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadsAvailable } from "./available";

afterEach(() => vi.unstubAllEnvs());

describe("uploadsAvailable", () => {
  it("offers uploads where Python runs, from any page but a country shared on its own", () => {
    vi.stubEnv("NEXT_PUBLIC_UPLOADS", "1");
    expect(uploadsAvailable()).toBe(true);
    expect(uploadsAvailable("panama")).toBe(true);
    expect(uploadsAvailable("countryx")).toBe(false);
  });

  it("offers none where Python cannot run", () => {
    vi.stubEnv("NEXT_PUBLIC_UPLOADS", "0");
    expect(uploadsAvailable()).toBe(false);
  });
});
