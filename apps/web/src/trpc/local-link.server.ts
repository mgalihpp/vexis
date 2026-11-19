import { localLink } from "@trpc/client";
import superjson from "superjson";
import { createContext } from "./init.server";
import { appRouter } from "./router.server";

/** SSR calls the router in this process: no HTTP round trip to ourselves, and the request's cookies ride along. */
export const serverLink = localLink({ router: appRouter, createContext, transformer: superjson });
