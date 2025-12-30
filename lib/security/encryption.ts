

import crypto from "crypto";

import { getServerEnv } from "@/lib/env";

export type EncryptedJson = {
  v: 1;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
};

const KEY_MATERIAL = getServerEnv().DATA_ENCRYPTION_KEY;
if (!KEY_MATERIAL) {
  throw new Error("DATA_ENCRYPTION_KEY is required");
}
const ENCRYPTION_KEY = crypto.createHash("sha256").update(KEY_MATERIAL).digest();

export function encryptJson(value: unknown): EncryptedJson {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);

  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptJson<T>(enc: EncryptedJson): T {
  if (enc.v !== 1 || enc.alg !== "aes-256-gcm") {
    throw new Error("Unsupported encrypted payload");
  }

  const iv = Buffer.from(enc.iv, "base64");
  const tag = Buffer.from(enc.tag, "base64");
  const ciphertext = Buffer.from(enc.ciphertext, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(plaintext) as T;
}
