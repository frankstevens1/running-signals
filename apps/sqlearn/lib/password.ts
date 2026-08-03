import "server-only";

import { verify } from "@node-rs/argon2";

export async function verifySqlearnPassword(password: string) {
  const hash = process.env.SQLEARN_PASSWORD_HASH;
  if (!hash?.startsWith("$argon2id$")) {
    throw new Error("Sqlearn password verification is not configured.");
  }

  return verify(hash, password);
}
