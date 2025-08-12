import * as jose from "jose";

const alg = "HS256";

async function getSecretKey() {
  // 在测试环境中直接使用环境变量，避免配置系统的依赖问题
  let secretString: string;

  if (process.env.NODE_ENV === "test") {
    secretString = process.env.JWT_SECRET || "test-jwt-secret-key-for-testing-only-32-chars";
  } else {
    // 在生产环境中直接使用环境变量
    secretString = process.env.JWT_SECRET || "default-jwt-secret-key-change-in-production";
  }

  const secret = new TextEncoder().encode(secretString);
  return secret;
}

export async function signJwt(payload: jose.JWTPayload) {
  const secret = await getSecretKey();
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime("1y")
    .sign(secret);
}

export async function verifyJwt(jwt: string) {
  const secret = await getSecretKey();
  const { payload } = await jose.jwtVerify(jwt, secret);
  return payload;
}
