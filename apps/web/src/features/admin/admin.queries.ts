import { queryOptions } from "@tanstack/react-query";
import type { AuditList, InviteList, OfficeList, UserList } from "@vexis/shared/admin";
import type { z } from "zod";
import { getAdminCounts, getAgents, getAudit, getInvites, getOffices, getSystem, getUsers } from "./admin.functions";

export const countsQuery = queryOptions({ queryKey: ["admin", "counts"], queryFn: () => getAdminCounts() });

export const invitesQuery = (q: z.input<typeof InviteList>) =>
  queryOptions({ queryKey: ["admin", "invites", q], queryFn: () => getInvites({ data: q }) });

export const usersQuery = (q: z.input<typeof UserList>) =>
  queryOptions({ queryKey: ["admin", "users", q], queryFn: () => getUsers({ data: q }) });

export const officesQuery = (q: z.input<typeof OfficeList>) =>
  queryOptions({ queryKey: ["admin", "offices", q], queryFn: () => getOffices({ data: q }) });

export const agentsQuery = queryOptions({ queryKey: ["admin", "agents"], queryFn: () => getAgents() });

export const systemQuery = queryOptions({ queryKey: ["admin", "system"], queryFn: () => getSystem() });

export const auditQuery = (q: z.input<typeof AuditList>) =>
  queryOptions({ queryKey: ["admin", "audit", q], queryFn: () => getAudit({ data: q }) });
