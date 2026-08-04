import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));

vi.mock("next/cache", () => ({ revalidateTag }));

import { POST } from "./route";
import { SITE_DATA_CACHE_TAG } from "@/app/lib/site-data-cache";

const originalSecret = process.env.SITE_REVALIDATE_SECRET;

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    revalidateTag.mockReset();
    process.env.SITE_REVALIDATE_SECRET = "test-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.SITE_REVALIDATE_SECRET;
    } else {
      process.env.SITE_REVALIDATE_SECRET = originalSecret;
    }
  });

  it("rejects a missing or invalid secret", async () => {
    const missing = await POST(new Request("http://localhost/api/revalidate", { method: "POST" }));
    const invalid = await POST(new Request("http://localhost/api/revalidate", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
    }));

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("fails safely when the deployment secret is absent", async () => {
    delete process.env.SITE_REVALIDATE_SECRET;

    const response = await POST(new Request("http://localhost/api/revalidate", { method: "POST" }));

    expect(response.status).toBe(500);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("expires the shared site-data cache tag", async () => {
    const response = await POST(new Request("http://localhost/api/revalidate", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(revalidateTag).toHaveBeenCalledWith(SITE_DATA_CACHE_TAG, { expire: 0 });
  });
});
