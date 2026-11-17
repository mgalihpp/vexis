import { createServerFn } from "@tanstack/react-start";
import {
  AuditList,
  CreateInvite,
  Email,
  EnableOffice,
  InviteList,
  OfficeCap,
  OfficeList,
  UserList,
} from "@vexis/shared/admin";
import { z } from "zod";
import { requireAdmin, requireAdminWrite } from "./admin.middleware";
import {
  changeRole,
  createInvite,
  disableOffice,
  enableOffice,
  extendInvite,
  loadAgents,
  loadAudit,
  loadCounts,
  loadInvites,
  loadOffices,
  loadSystem,
  loadUsers,
  resumeAll,
  revokeInvite,
  sendRequest,
  setOfficeCap,
  stopAll,
} from "./admin.server";

// Every function here goes through `requireAdmin`: the session is read fresh and the role comes from the database.
// Reads are GETs, writes are POSTs behind `requireAdminWrite` (origin check and rate limit). A write answers with
// a small tagged result instead of throwing for the cases an admin can cause, so the page can say what happened.

const Id = z.string().min(1).max(100);
const InviteId = z.string().uuid();

export const getAdminCounts = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(() => loadCounts());

export const getInvites = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator(InviteList)
  .handler(({ data }) => loadInvites(data));

export const createInviteFn = createServerFn({ method: "POST" })
  .middleware([requireAdminWrite])
  .validator(CreateInvite)
  .handler(({ context, data }) => createInvite(context.admin, data));

export const sendRequestFn = createServerFn({ method: "POST" })
  .middleware([requireAdminWrite])
  .validator(z.object({ email: Email }))
  .handler(({ context, data }) => sendRequest(context.admin, data.email));

export const revokeInviteFn = createServerFn({ method: "POST" })
  .middleware([requireAdminWrite])
  .validator(z.object({ id: InviteId }))
  .handler(({ context, data }) => revokeInvite(context.admin, data.id));

export const extendInviteFn = createServerFn({ method: "POST" })
  .middleware([requireAdminWrite])
  .validator(z.object({ id: InviteId }))
  .handler(async ({ context, data }) => ({ expiresAt: await extendInvite(context.admin, data.id) }));

export const getUsers = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator(UserList)
  .handler(({ context, data }) => loadUsers(data, context.admin.id));

export const changeRoleFn = createServerFn({ method: "POST" })
  .middleware([requireAdminWrite])
  .validator(z.object({ userId: Id, role: z.enum(["admin", "member"]) }))
  .handler(({ context, data }) => changeRole(context.admin, data.userId, data.role));

export const getOffices = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator(OfficeList)
  .handler(({ data }) => loadOffices(data));

export const enableOfficeFn = createServerFn({ method: "POST" })
  .middleware([requireAdminWrite])
  .validator(EnableOffice)
  .handler(({ context, data }) => enableOffice(context.admin, data.email, data.vexisDailyUsd));

export const disableOfficeFn = createServerFn({ method: "POST" })
  .middleware([requireAdminWrite])
  .validator(z.object({ userId: Id }))
  .handler(({ context, data }) => disableOffice(context.admin, data.userId));

export const setOfficeCapFn = createServerFn({ method: "POST" })
  .middleware([requireAdminWrite])
  .validator(OfficeCap)
  .handler(({ context, data }) => setOfficeCap(context.admin, data.userId, data.vexisDailyUsd));

export const stopAllFn = createServerFn({ method: "POST" })
  .middleware([requireAdminWrite])
  .handler(({ context }) => stopAll(context.admin));

export const resumeAllFn = createServerFn({ method: "POST" })
  .middleware([requireAdminWrite])
  .handler(async ({ context }) => ({ resumed: await resumeAll(context.admin) }));

export const getAgents = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(() => loadAgents());

export const getSystem = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(() => loadSystem());

export const getAudit = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator(AuditList)
  .handler(({ data }) => loadAudit(data.page));
