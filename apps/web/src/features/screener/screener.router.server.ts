import { router, viewerProcedure } from "@/trpc/init.server";
import { loadScreener } from "./screener.server";

export const screenerRouter = router({
  list: viewerProcedure.query(() => loadScreener()),
});
