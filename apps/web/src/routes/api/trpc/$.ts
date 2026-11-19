import { createFileRoute } from "@tanstack/react-router";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "@/trpc/init.server";
import { appRouter } from "@/trpc/router.server";

const handle = ({ request }: { request: Request }) =>
  fetchRequestHandler({ endpoint: "/api/trpc", req: request, router: appRouter, createContext });

export const Route = createFileRoute("/api/trpc/$")({
  server: { handlers: { GET: handle, POST: handle } },
});
