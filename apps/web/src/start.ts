import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

// The server module is imported inside .server(), which Start strips from the client bundle; a top-level import
// of a *.server.ts file here is denied because start.ts is part of the client graph.
const humanGate = createMiddleware({ type: "request" }).server(async (ctx) => {
  const { humanGate } = await import("@/features/turnstile/human.server");
  return humanGate(ctx);
});

// A custom start.ts turns off Start's automatic CSRF middleware, so it is added back for server functions.
const csrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" });

export const startInstance = createStart(() => ({
  requestMiddleware: [humanGate, csrfMiddleware],
}));
