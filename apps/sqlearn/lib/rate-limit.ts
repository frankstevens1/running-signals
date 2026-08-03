import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

type RateLimitKind = "login" | "query";

const limits = {
  login: { count: 5, window: "15 m" },
  query: { count: 60, window: "1 h" },
} as const;

const limiters = new Map<RateLimitKind, Ratelimit | null>();

function getLimiter(kind: RateLimitKind) {
  const existing = limiters.get(kind);
  if (existing !== undefined) return existing;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Sqlearn rate limiting is not configured.");
    }
    limiters.set(kind, null);
    return null;
  }

  const limit = limits[kind];
  const limiter = new Ratelimit({
    limiter: Ratelimit.slidingWindow(limit.count, limit.window),
    prefix: `sqlearn:${kind}`,
    redis: new Redis({ url, token }),
  });
  limiters.set(kind, limiter);
  return limiter;
}

function getClientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
}

export async function enforceRateLimit(request: NextRequest, kind: RateLimitKind) {
  const limiter = getLimiter(kind);
  if (!limiter) return null;

  const result = await limiter.limit(getClientIp(request));
  void result.pending;
  if (result.success) return null;

  return NextResponse.json(
    { error: "Too many requests. Try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))) },
    },
  );
}
