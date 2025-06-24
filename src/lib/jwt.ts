import * as jose from 'jose';

const alg = 'HS256';

async function getSecretKey() {
  const secretString = import.meta.env.JWT_SECRET;
  if (!secretString) {
    throw new Error('JWT_SECRET environment variable not set');
  }
  const secret = new TextEncoder().encode(secretString);
  return secret;
}

export async function signJwt(payload: jose.JWTPayload) {
  const secret = await getSecretKey();
  return new jose.SignJWT(payload).setProtectedHeader({ alg }).setIssuedAt().setExpirationTime('1y').sign(secret);
}

export async function verifyJwt(jwt: string) {
  const secret = await getSecretKey();
  const { payload } = await jose.jwtVerify(jwt, secret);
  return payload;
}
