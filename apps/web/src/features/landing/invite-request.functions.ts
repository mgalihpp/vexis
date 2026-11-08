import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { InviteRequestInput } from "./invite-request";
import { handleInviteRequest } from "./invite-request.server";

export const requestInvite = createServerFn({ method: "POST" })
  .validator(InviteRequestInput)
  .handler(({ data }) => handleInviteRequest(data, getRequestIP({ xForwardedFor: true }) ?? "unknown"));
