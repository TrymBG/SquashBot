// Account endpoints: sign up, log in, log out, "who am I". Thin like routes.ts: check input, call authService,
// turn the result into a status code and a session cookie.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { deleteAccount } from "../services/accountService.js";
import { getUserForSession, login, logout, resetPassword, SESSION_DAYS, signup, type PublicUser } from "../services/authService.js";

export interface AuthOptions {
  inviteCode: string | null; // null = sign-up closed
  cookieSecure: boolean; // true in production: the cookie is only sent over HTTPS
  rateLimit: { max: number; timeWindowMs: number }; // attempts per IP per window, for login and for sign-up (separately)
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

const resetBody = {
  type: "object",
  properties: {
    token: { type: "string", minLength: 1, maxLength: 100 },
    password: { type: "string", minLength: 8, maxLength: 128 }, // same rule as sign-up
  },
  required: ["token", "password"],
} as const;

const deleteAccountBody = {
  type: "object",
  properties: { password: { type: "string", maxLength: 128 } },
  required: ["password"],
} as const;

const signupErrors = {
  "signup-closed": { status: 403, error: "Sign-up is closed" },
  "invalid-invite": { status: 403, error: "Wrong invite code" },
  "email-taken": { status: 409, error: "That email is already registered" },
} as const;

// The logged-in user for a request, or undefined.
export function currentUser(request: FastifyRequest): PublicUser | undefined {
  return getUserForSession(request.cookies[SESSION_COOKIE]);
}

// Adds a `user` field to Fastify's request type ("declaration merging": we extend the library's interface).
// It's set by requireLogin below, for routes that use it.
declare module "fastify" {
  interface FastifyRequest {
    user: PublicUser | null;
  }
}

// An onRequest hook for routes that need a login, like a Spring Security filter in front of the controllers.
// It runs before body validation, so someone who isn't logged in always gets 401 and learns nothing about the input rules.
// Use in a plugin: app.decorateRequest("user", null); app.addHook("onRequest", requireLogin);
export async function requireLogin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = currentUser(request);
  if (!user) {
    return reply.code(401).send({ error: "Not logged in" });
  }
  request.user = user;
}

// The logged-in user inside a route protected by requireLogin.
export function loggedInUser(request: FastifyRequest): PublicUser {
  if (!request.user) {
    throw new Error("loggedInUser() used on a route without the requireLogin hook");
  }
  return request.user;
}

// Sets the session cookie after a login (also used by the dev "Log in as…").
// httpOnly: page JavaScript can't read the cookie, so an XSS bug can't steal the session.
// sameSite "lax": the browser doesn't send it on POSTs from other sites, which protects against CSRF.
export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60, // seconds
  });
}

export async function authRoutes(app: FastifyInstance, options: AuthOptions): Promise<void> {
  // Too many attempts from one IP → 429 for the rest of the window, which slows down password guessing.
  // Login and sign-up each have their own counter: @fastify/rate-limit gives every route with its own settings a
  // separate store (`groupId` only groups keys inside one store). The `error` text is what the website's forms show.
  const rateLimit = {
    max: options.rateLimit.max,
    timeWindow: options.rateLimit.timeWindowMs,
    errorResponseBuilder: () => ({ statusCode: 429, error: "Too many attempts. Try again in a few minutes." }),
  };


  app.post<{ Body: { email: string; password: string; displayName: string; inviteCode: string } }>(
    "/api/signup",
    { schema: { body: signupBody }, config: { rateLimit } },
    async (request, reply) => {
      const result = await signup(request.body, options.inviteCode);
      if (!result.ok) {
        const { status, error } = signupErrors[result.reason];
        return reply.code(status).send({ error });
      }
      setSessionCookie(reply, result.sessionToken, options.cookieSecure);
      return reply.code(201).send({ user: result.user });
    },
  );

  app.post<{ Body: { email: string; password: string } }>(
    "/api/login",
    { schema: { body: loginBody }, config: { rateLimit } },
    async (request, reply) => {
      const result = await login(request.body.email, request.body.password);
      if (!result.ok) {
        return reply.code(401).send({ error: "Invalid email or password" });
      }
      setSessionCookie(reply, result.sessionToken, options.cookieSecure);
      return { user: result.user };
    },
  );

  // Set a new password with a one-time link from the admin (npm run reset-link). Logs you in on success.
  // Rate limited like login, although the token is random and can't be guessed anyway.
  app.post<{ Body: { token: string; password: string } }>(
    "/api/reset-password",
    { schema: { body: resetBody }, config: { rateLimit } },
    async (request, reply) => {
      const result = await resetPassword(request.body.token, request.body.password);
      if (!result.ok) {
        return reply.code(400).send({ error: "This reset link is invalid, used or expired. Ask for a new one." });
      }
      setSessionCookie(reply, result.sessionToken, options.cookieSecure);
      return { user: result.user };
    },
  );

  // Delete my account (asks for the password again). requireLogin runs first, so logged out always gives 401.
  // The request decoration is per plugin (Fastify encapsulation), so this plugin declares its own.
  app.decorateRequest("user", null);
  app.post<{ Body: { password: string } }>(
    "/api/account/delete",
    { onRequest: requireLogin, schema: { body: deleteAccountBody } },
    async (request, reply) => {
      const result = await deleteAccount(loggedInUser(request), request.body.password);
      if (!result.ok) {
        return reply.code(403).send({ error: "Wrong password" });
      }
      return reply.clearCookie(SESSION_COOKIE, { path: "/" }).code(204).send();
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
