import { jwtVerify, SignJWT } from "jose";

export const SQLEARN_SESSION_COOKIE = "sqlearn_session";
export const SQLEARN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function getSessionSecret() {
  const secret = process.env.SQLEARN_SESSION_SECRET;
  if (!secret) throw new Error("Sqlearn session signing is not configured.");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken() {
  return new SignJWT({ scope: "sqlearn" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SQLEARN_SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSessionSecret());
}

export async function hasValidSession(token: string | undefined) {
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), { algorithms: ["HS256"] });
    return payload.scope === "sqlearn";
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  maxAge: SQLEARN_SESSION_MAX_AGE_SECONDS,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
