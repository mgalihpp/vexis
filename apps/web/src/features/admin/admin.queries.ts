import { queryOptions } from "@tanstack/react-query";
import type { AuditList, InviteList, OfficeList, UserList } from "@vexis/shared/admin";
import type { z } from "zod";
import { trpc } from "@/trpc/client";

export const countsQuery = queryOptions({ queryKey: ["admin", "counts"], queryFn: () => trpc.admin.counts.query() });

export const invitesQuery = (q: z.input<typeof InviteList>) =>
  queryOptions({ queryKey: ["admin", "invites", q], queryFn: () => trpc.admin.invites.query(q) });

export const usersQuery = (q: z.input<typeof UserList>) =>
  queryOptions({ queryKey: ["admin", "users", q], queryFn: () => trpc.admin.users.query(q) });

export const officesQuery = (q: z.input<typeof OfficeList>) =>
  queryOptions({ queryKey: ["admin", "offices", q], queryFn: () => trpc.admin.offices.query(q) });

export const agentsQuery = queryOptions({ queryKey: ["admin", "agents"], queryFn: () => trpc.admin.agents.query() });

export const systemQuery = queryOptions({ queryKey: ["admin", "system"], queryFn: () => trpc.admin.system.query() });

export const auditQuery = (q: z.input<typeof AuditList>) =>
  queryOptions({ queryKey: ["admin", "audit", q], queryFn: () => trpc.admin.audit.query(q) });
