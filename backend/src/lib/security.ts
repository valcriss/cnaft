import crypto from "node:crypto";

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  keyLen: 64,
};

function scryptAsync(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_PARAMS.keyLen, { N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p }, (err, key) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(key as Buffer);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scryptAsync(password, salt);
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, hash: string) {
  const [salt, expectedHex] = hash.split(":");
  if (!salt || !expectedHex) return false;
  const key = await scryptAsync(password, salt);
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== key.length) return false;
  return crypto.timingSafeEqual(expected, key);
}
