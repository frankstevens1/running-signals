import { beforeEach, describe, expect, it } from "vitest";

import { createSessionToken, hasValidSession } from "./auth";

describe("Sqlearn sessions", () => {
  beforeEach(() => {
    process.env.SQLEARN_SESSION_SECRET = "test-session-secret-with-sufficient-length";
  });

  it("accepts a token it created", async () => {
    await expect(hasValidSession(await createSessionToken())).resolves.toBe(true);
  });

  it("rejects a modified token", async () => {
    const token = await createSessionToken();
    await expect(hasValidSession(`${token}invalid`)).resolves.toBe(false);
  });

  it("rejects a missing token", async () => {
    await expect(hasValidSession(undefined)).resolves.toBe(false);
  });
});
