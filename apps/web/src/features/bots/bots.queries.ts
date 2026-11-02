import { queryOptions } from "@tanstack/react-query";
import type { EventKind } from "@vexis/bot-state";
import { getBot, getBotEvents, getFleet, getFleetActivity } from "./bots.functions";

export const fleetQuery = queryOptions({ queryKey: ["fleet"], queryFn: () => getFleet() });

export const fleetActivityQuery = queryOptions({ queryKey: ["fleet-activity"], queryFn: () => getFleetActivity() });

export const botQuery = (botId: string) =>
  queryOptions({ queryKey: ["bot", botId], queryFn: () => getBot({ data: { botId } }) });

export const botEventsQuery = (input: { botId: string; kinds?: EventKind[]; limit: number; offset?: number }) =>
  queryOptions({ queryKey: ["bot-events", input], queryFn: () => getBotEvents({ data: input }) });
