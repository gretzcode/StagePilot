import { createHostToken, verifyHostToken } from "./jwt";

export interface HostSessionUser {
  id: string;
  email: string;
  name: string;
  role: "host";
}

export const SESSION_COOKIE_NAME = "stagepilot_session_id";
export const SESSION_TTL_SECONDS = 86400; // 24 Hours

export async function createHostSession(user: HostSessionUser): Promise<{ token: string; cookieHeader: string }> {
  const token = await createHostToken(user.id, user.email, user.name);
  const cookieHeader = `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`;
  return { token, cookieHeader };
}

export async function validateHostSessionRequest(request: Request): Promise<HostSessionUser | null> {
  const authHeader = request.headers.get("Authorization");
  const tokenFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  const cookieHeader = request.headers.get("cookie");
  const tokenFromCookie = cookieHeader
    ?.split(";")
    .find((c) => c.trim().startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];

  const token = tokenFromHeader || tokenFromCookie;
  if (!token) return null;

  const payload = await verifyHostToken(token);
  if (!payload || !payload.sub) return null;

  return {
    id: payload.sub,
    email: payload.email || "host@stagepilot.live",
    name: payload.name || "Stage Host",
    role: "host",
  };
}
