import { publicProcedure, router } from "@/trpc/init.server";
import { InviteRequestInput } from "./invite-request";
import { handleInviteRequest } from "./invite-request.server";

export const inviteRouter = router({
  request: publicProcedure.input(InviteRequestInput).mutation(({ input, ctx }) => handleInviteRequest(input, ctx.ip)),
});
