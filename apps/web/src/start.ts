import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { humanGate } from "@/features/turnstile/human.server";

// A custom start.ts turns off Start's automatic CSRF middleware, so it is added back for server functions.
const csrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" });

export const startInstance = createStart(() => ({
  requestMiddleware: [humanGate, csrfMiddleware],
}));
