import { verifyToken, type VerifyTokenOptions } from "@clerk/backend";
import { Context, Next } from "hono";
import { getEnv } from "../config/env.js";

export interface AuthUser {
  userId: string;
  sessionId: string;
}

export async function clerkAuth(c: Context, next: Next) {
  try {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      c.set("user", null);
      return next();
    }

    const token = authHeader.slice(7);
    const env = getEnv();

    const options: VerifyTokenOptions = {
      secretKey: env.CLERK_SECRET_KEY!,
    };

    const verifiedToken = await verifyToken(token, options);

    const user: AuthUser = {
      userId: verifiedToken.sub,
      sessionId: verifiedToken.sid || "",
    };

    c.set("user", user);
  } catch (error) {
    console.error(error);
    c.set("user", null);
  }

  return next();
}

export function requireAuth(c: Context) {
  const user = c.get("user") as AuthUser | null;
  if (!user) {
    c.status(401);
    c.json({ error: "Unauthorized" }, 401);
    return null;
  }
  return user;
}
