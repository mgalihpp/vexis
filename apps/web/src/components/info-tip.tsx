import { type ComponentProps, type ReactNode, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** The tooltip look, for popovers that stand in for a tooltip. */
export const TIP_CLASS =
  "w-fit max-w-xs gap-0 rounded-md p-0 px-3 py-1.5 text-[0.625rem] ring-1 ring-foreground/10 data-open:zoom-in-95";

/**
 * A tooltip that also works on touch screens. A mouse opens it on hover, like a tooltip; a tap opens it and a tap
 * anywhere else closes it. Radix's Tooltip cannot do the second part: it closes on press by design.
 */
export function InfoTip({
  content,
  contentClassName = "",
  children,
  ...trigger
}: { content: ReactNode; contentClassName?: string; children: ReactNode } & ComponentProps<typeof PopoverTrigger>) {
  const [open, setOpen] = useState(false);
  const mouse = useRef(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        {...trigger}
        onPointerDown={(e) => {
          mouse.current = e.pointerType === "mouse";
        }}
        onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
        // Hover already opened it; a mouse click must not toggle it shut. Radix skips its toggle when prevented.
        onClick={(e) => mouse.current && e.preventDefault()}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        className={`${TIP_CLASS} ${contentClassName}`}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}
