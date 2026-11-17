// Account endpoints: sign up, log in, log out, "who am I". Thin like routes.ts: check input, call authService,
// turn the result into a status code and a session cookie.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getUserForSession, login, logout, SESSION_DAYS, signup, type PublicUser } from "../services/authService.js";

export interface AuthOptions {
  inviteCode: string | null; // null = sign-up closed
  cookieSecure: boolean; // true in production: the cookie is only sent over HTTPS
}

const SESSION_COOKIE = "session";

const signupBody = {
  type: "object",
  properties: {
    email: { type: "string", format: "email", maxLength: 254 },
    password: { type: "string", minLength: 8, maxLength: 128 },
    displayName: { type: "string", minLength: 1, maxLength: 32, pattern: "\\S" }, // at least one non-space character
    inviteCode: { type: "string", minLength: 1, maxLength: 100 },
  },
  required: ["email", "password", "displayName", "inviteCode"],
} as const;

const loginBody = {
  type: "object",
  properties: {
    email: { type: "string", maxLength: 254 },
    password: { type: "string", maxLength: 128 },
  },
  required: ["email", "password"],
} as const;

const signupErrors = {
  "signup-closed": { status: 403, error: "Sign-up is closed" },
  "invalid-invite": { status: 403, error: "Wrong invite code" },
  "email-taken": { status: 409, error: "That email is already registered" },
} as const;

// The logged-in user for a request, or undefined. Later routes that need a login (W3) use this.
export function currentUser(request: FastifyRequest): PublicUser | undefined {
  return getUserForSession(request.cookies[SESSION_COOKIE]);
}

export async function authRoutes(app: FastifyInstance, options: AuthOptions): Promise<void> {
  // httpOnly: page JavaScript can't read the cookie, so an XSS bug can't steal the session.
  // sameSite "lax": the browser doesn't send it on POSTs from other sites, which protects against CSRF.
  function setSessionCookie(reply: FastifyReply, token: string): void {
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: options.cookieSecure,
      path: "/",
      maxAge: SESSION_DAYS * 24 * 60 * 60, // seconds
    });
  }

  app.post<{ Body: { email: string; password: string; displayName: string; inviteCode: string } }>(
    "/api/signup",
    { schema: { body: signupBody } },
    async (request, reply) => {
      const result = await signup(request.body, options.inviteCode);
      if (!result.ok) {
        const { status, error } = signupErrors[result.reason];
        return reply.code(status).send({ error });
      }
      setSessionCookie(reply, result.sessionToken);
      return reply.code(201).send({ user: result.user });
    },
  );

  app.post<{ Body: { email: string; password: string } }>(
    "/api/login",
    { schema: { body: loginBody } },
    async (request, reply) => {
      const result = await login(request.body.email, request.body.password);
      if (!result.ok) {
        return reply.code(401).send({ error: "Invalid email or password" });
      }
      setSessionCookie(reply, result.sessionToken);
      return { user: result.user };
    },
  );

  app.post("/api/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      logout(token);
    }
    return reply.clearCookie(SESSION_COOKIE, { path: "/" }).code(204).send();
  });

  app.get("/api/me", async (request, reply) => {
    const user = currentUser(request);
    return user ? { user } : reply.code(401).send({ error: "Not logged in" });
  });
}
