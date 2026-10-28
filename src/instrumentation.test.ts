import { afterEach, describe, expect, it, vi } from "vitest";

const queue = vi.hoisted(() => ({ bootQueue: vi.fn(), watchQueue: vi.fn() }));
vi.mock("@/lib/upload/queue", () => queue);

import { register } from "./instrumentation";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function productionServer(uploads: "0" | "1") {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_UPLOADS", uploads);
}

describe("register", () => {
  it("starts the upload queue where uploads run", async () => {
    productionServer("1");
    await register();
    expect(queue.bootQueue).toHaveBeenCalledOnce();
    expect(queue.watchQueue).toHaveBeenCalledOnce();
  });

  it("leaves the queue out where uploads are off (Vercel)", async () => {
    productionServer("0");
    await register();
    expect(queue.bootQueue).not.toHaveBeenCalled();
    expect(queue.watchQueue).not.toHaveBeenCalled();
  });
});
