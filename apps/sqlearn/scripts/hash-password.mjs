import { Algorithm, hash } from "@node-rs/argon2";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const prompt = createInterface({ input: stdin, output: stdout });
const password = await prompt.question("Shared Sqlearn password: ");
const confirmation = await prompt.question("Confirm password: ");
prompt.close();

if (!password || password !== confirmation) {
  throw new Error("Passwords must be non-empty and match.");
}

console.log(await hash(password, {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  parallelism: 1,
  timeCost: 2,
}));
