import { openBotStore } from "@vexis/bot-state/server";

// Re-read per request: the registry is tiny and edits apply without a restart.
export const botStore = () => openBotStore(process.env.VEXIS_BOTS_FILE ?? "../../bots.json");
