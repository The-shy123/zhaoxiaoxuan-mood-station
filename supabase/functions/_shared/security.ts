async function sha256(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export async function verifyAccessToken(received: unknown): Promise<boolean> {
  const expected = Deno.env.get("BABY_ACCESS_TOKEN");
  if (!expected || typeof received !== "string" || !received) return false;

  const [receivedHash, expectedHash] = await Promise.all([
    sha256(received),
    sha256(expected),
  ]);
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index += 1) {
    difference |= receivedHash[index] ^ expectedHash[index];
  }
  return difference === 0;
}
