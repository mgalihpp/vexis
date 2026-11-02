import { useNavigate } from "@tanstack/react-router";
import { BellIcon, CircleCheckIcon, CircleXIcon, SettingsIcon, TrendingUpIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { ago } from "@/lib/format";
import { useNotifications } from "@/stores/notifications";
import { useSettings } from "@/stores/settings";
import type { Notice, NoticeKind } from "../notifications";

const ICON: Record<NoticeKind, ReactNode> = {
  "out-of-range": <TriangleAlertIcon />,
  opened: <CircleCheckIcon />,
  closed: <CircleXIcon />,
  "volume-spike": <TrendingUpIcon />,
};

const NOTICE_LABEL: Record<NoticeKind, string> = {
  "out-of-range": "Out of range",
  opened: "Opened",
  closed: "Closed",
  "volume-spike": "Volume spike",
};

const NOTICE_TONE: Record<NoticeKind, string> = {
  "out-of-range": "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  opened: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  closed: "bg-muted text-muted-foreground",
  "volume-spike": "bg-blue-500/15 text-blue-700 dark:text-blue-400",
};

const DAY_MS = 86_400_000;

export function NotificationsDialog({
  open,
  onOpenChange,
  onOpenSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
}) {
  const { items, markRead, markAllRead, clear } = useNotifications();
  const currency = useSettings((s) => s.currency);
  const navigate = useNavigate();
  const now = Date.now();
  const today = items.filter((n) => now - n.at < DAY_MS);
  const earlier = items.filter((n) => now - n.at >= DAY_MS);
  const unread = items.some((n) => !n.read);

  const select = (n: Notice) => {
    markRead(n.id);
    onOpenChange(false);
    if (n.pool) navigate({ to: "/analytics", search: { pool: n.pool } });
    else if (n.wallet) navigate({ to: "/portfolio/$wallet", params: { wallet: n.wallet }, search: { currency } });
  };

  const isMobile = useIsMobile();
  const Title = isMobile ? DrawerTitle : DialogTitle;
  const Description = isMobile ? DrawerDescription : DialogDescription;
  const content = (
    <>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Title className="flex-1 text-sm font-semibold">Notifications</Title>
        <Description className="sr-only">Alerts for your favorite wallets and pools</Description>
        {unread && (
          <Button variant="ghost" size="sm" onClick={markAllRead} className="hover:bg-brand/10 hover:text-brand">
            Mark all as read
          </Button>
        )}
        {items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clear} className="hover:bg-destructive/10 hover:text-destructive">
            Clear all
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" aria-label="Notification settings" onClick={onOpenSettings}>
          <SettingsIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <BellIcon className="size-4.5 text-muted-foreground" />
            </span>
            <p className="text-sm font-medium">No notifications</p>
            <p className="text-xs text-muted-foreground">Star a wallet or pool to get alerts here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {today.length > 0 && <Section title="Today" items={today} now={now} onSelect={select} />}
            {earlier.length > 0 && <Section title="Earlier" items={earlier} now={now} onSelect={select} />}
          </div>
        )}
      </div>
    </>
  );

  if (isMobile)
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[85dvh] data-[vaul-drawer-direction=bottom]:max-h-[85dvh]">{content}</DrawerContent>
      </Drawer>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[min(36rem,85dvh)] flex-col gap-0 p-0 sm:max-w-md">
        {content}
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  items,
  now,
  onSelect,
}: {
  title: string;
  items: Notice[];
  now: number;
  onSelect: (n: Notice) => void;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-1 text-xs font-medium text-muted-foreground">{title}</h3>
      {items.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => onSelect(n)}
          className="flex items-start gap-2.5 rounded-xl bg-muted/50 p-2.5 text-left ring-1 ring-foreground/5 transition-colors hover:bg-muted"
        >
          <PairIcons pair={noticePair(n)} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-baseline gap-2">
              <span className={`flex-1 truncate text-xs ${n.read ? "font-medium" : "font-semibold"}`}>{n.title}</span>
              <span className="shrink-0 text-[0.65rem] text-muted-foreground tabular-nums">{ago(now - n.at)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6rem] font-medium ${NOTICE_TONE[n.kind]} [&>svg]:size-3`}
              >
                {ICON[n.kind]}
                {NOTICE_LABEL[n.kind]}
              </span>
              {noticePair(n) && <span className="text-[0.65rem] font-medium text-foreground/75">{noticePair(n)}</span>}
            </span>
            <span className="text-[0.7rem] text-muted-foreground">{n.body}</span>
          </span>
          {!n.read && (
            <span className="mt-1.5 size-1.75 shrink-0 rounded-full bg-brand">
              <span className="sr-only">Unread</span>
            </span>
          )}
        </button>
      ))}
    </section>
  );
}

function noticePair(n: Notice) {
  return `${n.title} ${n.body}`.match(/\b[A-Z0-9]{2,}-[A-Z0-9]{2,}\b/)?.[0] ?? null;
}

function PairIcons({ pair }: { pair: string | null }) {
  const tokens = pair?.split("-").slice(0, 2) ?? [];
  return (
    <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center">
      {tokens.length ? (
        <span className="flex -space-x-2">
          {tokens.map((token) => (
            <TokenMark key={token} token={token} />
          ))}
        </span>
      ) : (
        <span className="flex size-7 items-center justify-center rounded-lg bg-foreground/[0.08] text-foreground [&>svg]:size-3.5">
          {ICON["volume-spike"]}
        </span>
      )}
    </span>
  );
}

function TokenMark({ token }: { token: string }) {
  const logo = token === "SOL" ? "/Solana_logo.png" : token === "USDC" ? "/usd-coin-usdc-logo.png" : null;
  return logo ? (
    <img src={logo} alt={token} className="size-6 rounded-full border-2 border-background bg-background object-cover" />
  ) : (
    <span
      aria-hidden="true"
      className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[0.6rem] font-bold text-foreground"
    >
      {token.slice(0, 1)}
    </span>
  );
}
