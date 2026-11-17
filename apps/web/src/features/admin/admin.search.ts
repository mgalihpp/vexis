// The admin tabs keep their filter, search and page in the URL. Bad values fall back to the defaults.

import { INVITE_FILTERS, MAX_PAGE, OFFICE_FILTERS, USER_FILTERS } from "@vexis/shared/admin";
import { z } from "zod";

const page = z.number().int().min(1).max(MAX_PAGE).default(1).catch(1);
const q = z.string().max(100).default("").catch("");

export const InviteSearch = z.object({ filter: z.enum(INVITE_FILTERS).default("all").catch("all"), q, page });
export type InviteSearch = z.infer<typeof InviteSearch>;

export const UserSearch = z.object({ filter: z.enum(USER_FILTERS).default("all").catch("all"), q, page });
export type UserSearch = z.infer<typeof UserSearch>;

export const OfficeSearch = z.object({ filter: z.enum(OFFICE_FILTERS).default("all").catch("all"), q });
export type OfficeSearch = z.infer<typeof OfficeSearch>;

export const SEARCH_DEFAULTS = { filter: "all", q: "", page: 1 } as const;
export const OFFICE_DEFAULTS = { filter: "all", q: "" } as const;
