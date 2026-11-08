import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { BellIcon, LogOutIcon, SettingsIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { signOut } from "@/features/auth/auth.functions";
import { NotificationsDialog } from "@/features/notifications/components/notifications-dialog";
import { SettingsDialog, type SettingsSection } from "@/features/settings/components/settings-dialog";
import { useNotifications } from "@/stores/notifications";

export function HeaderActions() {
  const unread = useNotifications((s) => s.items.filter((n) => !n.read).length);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [section, setSection] = useState<SettingsSection | null>(null);

  const openSettings = (next: SettingsSection | null) => {
    setSection(next);
    setNotificationsOpen(false);
    setSettingsOpen(true);
  };

  return (
    <div className="ml-auto flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
            className="relative"
            onClick={() => setNotificationsOpen(true)}
          >
            <BellIcon />
            {unread > 0 && (
              <span className="absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand px-0.75 text-[0.55rem] leading-none font-semibold text-brand-foreground tabular-nums">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Settings" onClick={() => openSettings(null)}>
            <SettingsIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Settings</TooltipContent>
      </Tooltip>
      <SignOutButton />
      <NotificationsDialog
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        onOpenSettings={() => openSettings("notifications")}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        section={section}
        onSectionChange={setSection}
      />
    </div>
  );
}

function SignOutButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const leave = async () => {
    setPending(true);
    try {
      await signOut();
      // Another user may sign in on this browser next, so nothing cached for this one may stay.
      queryClient.clear();
      await router.navigate({ to: "/" });
    } finally {
      setPending(false);
    }
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Sign out" onClick={leave} disabled={pending}>
          <LogOutIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Sign out</TooltipContent>
    </Tooltip>
  );
}
