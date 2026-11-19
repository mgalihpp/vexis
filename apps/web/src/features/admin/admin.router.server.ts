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
import { router } from "@/trpc/init.server";
import { adminProcedure, adminWriteProcedure } from "./admin.middleware";
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

// Every procedure here goes through `adminProcedure`: the session is read fresh and the role comes from the database.
// Reads are queries, writes are mutations behind `adminWriteProcedure` (origin check and rate limit). A write answers
// with a small tagged result instead of throwing for the cases an admin can cause, so the page can say what happened.

const Id = z.string().min(1).max(100);
const InviteId = z.string().uuid();

export const adminRouter = router({
  counts: adminProcedure.query(() => loadCounts()),
  invites: adminProcedure.input(InviteList).query(({ input }) => loadInvites(input)),
  createInvite: adminWriteProcedure.input(CreateInvite).mutation(({ ctx, input }) => createInvite(ctx.admin, input)),
  sendRequest: adminWriteProcedure
    .input(z.object({ email: Email }))
    .mutation(({ ctx, input }) => sendRequest(ctx.admin, input.email)),
  revokeInvite: adminWriteProcedure
    .input(z.object({ id: InviteId }))
    .mutation(({ ctx, input }) => revokeInvite(ctx.admin, input.id)),
  extendInvite: adminWriteProcedure
    .input(z.object({ id: InviteId }))
    .mutation(async ({ ctx, input }) => ({ expiresAt: await extendInvite(ctx.admin, input.id) })),
  users: adminProcedure.input(UserList).query(({ ctx, input }) => loadUsers(input, ctx.admin.id)),
  changeRole: adminWriteProcedure
    .input(z.object({ userId: Id, role: z.enum(["admin", "member"]) }))
    .mutation(({ ctx, input }) => changeRole(ctx.admin, input.userId, input.role)),
  offices: adminProcedure.input(OfficeList).query(({ input }) => loadOffices(input)),
  enableOffice: adminWriteProcedure
    .input(EnableOffice)
    .mutation(({ ctx, input }) => enableOffice(ctx.admin, input.email, input.vexisDailyUsd)),
  disableOffice: adminWriteProcedure
    .input(z.object({ userId: Id }))
    .mutation(({ ctx, input }) => disableOffice(ctx.admin, input.userId)),
  setOfficeCap: adminWriteProcedure
    .input(OfficeCap)
    .mutation(({ ctx, input }) => setOfficeCap(ctx.admin, input.userId, input.vexisDailyUsd)),
  stopAll: adminWriteProcedure.mutation(({ ctx }) => stopAll(ctx.admin)),
  resumeAll: adminWriteProcedure.mutation(async ({ ctx }) => ({ resumed: await resumeAll(ctx.admin) })),
  agents: adminProcedure.query(() => loadAgents()),
  system: adminProcedure.query(() => loadSystem()),
  audit: adminProcedure.input(AuditList).query(({ input }) => loadAudit(input.page)),
});
