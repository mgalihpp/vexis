import { adminRouter } from "@/features/admin/admin.router.server";
import { agentsRouter } from "@/features/agents/agents.router.server";
import { analyticsRouter } from "@/features/analytics/analytics.router.server";
import { authRouter } from "@/features/auth/auth.router.server";
import { inviteRouter } from "@/features/landing/invite-request.router.server";
import { notificationsRouter } from "@/features/notifications/notifications.router.server";
import { officeRouter } from "@/features/office/office.router.server";
import { portfolioRouter } from "@/features/portfolio/portfolio.router.server";
import { screenerRouter } from "@/features/screener/screener.router.server";
import { router } from "./init.server";

export const appRouter = router({
  admin: adminRouter,
  agents: agentsRouter,
  analytics: analyticsRouter,
  auth: authRouter,
  invite: inviteRouter,
  notifications: notificationsRouter,
  office: officeRouter,
  portfolio: portfolioRouter,
  screener: screenerRouter,
});

export type AppRouter = typeof appRouter;
