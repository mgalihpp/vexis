import { createServerFn } from "@tanstack/react-start";
import { requireViewer } from "@/features/auth/auth.middleware";
import { loadScreener } from "./screener.server";

export const getScreener = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .handler(() => loadScreener());
