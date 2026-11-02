import { BellIcon, SettingsIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
