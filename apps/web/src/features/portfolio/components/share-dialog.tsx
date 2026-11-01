import { toBlob } from "html-to-image";
import { CopyIcon, DownloadIcon, PaletteIcon, RotateCcwIcon } from "lucide-react";
import { type CSSProperties, type MouseEvent, type ReactNode, useRef, useState } from "react";
import { Logo } from "@/components/icons";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { CurrencyToggle } from "./currency-toggle";

const BACKGROUNDS = [null, "#0f3b3a", "#2b1846", "#13233f", "#0f3a1c", "#3a2a0a", "#1c2433"] as const;

// Textures draw in currentColor, so they read as light-on-dark or dark-on-light with the card.
// Dark ink on a light card is far more visible than light ink on a dark one, so --texture-ink scales it down.
const ink = (pct: number) => `color-mix(in oklch, currentColor calc(${pct}% * var(--texture-ink)), transparent)`;

const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E\")";

interface Texture {
  id: string;
  size: number;
  style: (size: string) => CSSProperties;
}

const pattern = (id: string, size: number, image: string): Texture => ({
  id,
  size,
  style: (s) => ({ backgroundImage: image, backgroundSize: s }),
});

const TEXTURES: Texture[] = [
  // The noise SVG has fixed colors, so it is used as a mask over a currentColor fill.
  {
    id: "noise",
    size: 120,
    style: (s) => ({
      backgroundColor: ink(40),
      maskImage: NOISE,
      maskSize: s,
      WebkitMaskImage: NOISE,
      WebkitMaskSize: s,
    }),
  },
  pattern("solid", 8, `linear-gradient(${ink(13)}, ${ink(13)})`),
  pattern("diag", 8, `repeating-linear-gradient(45deg, ${ink(20)} 0 1px, transparent 1px 8px)`),
  pattern("diag-dense", 4, `repeating-linear-gradient(45deg, ${ink(20)} 0 1px, transparent 1px 4px)`),
  pattern(
    "grid",
    16,
    `linear-gradient(${ink(20)} 1px, transparent 1px), linear-gradient(90deg, ${ink(20)} 1px, transparent 1px)`,
  ),
  pattern("dots", 10, `radial-gradient(${ink(27)} 1px, transparent 1.5px)`),
  pattern("dots-dense", 5, `radial-gradient(${ink(27)} 1px, transparent 1.5px)`),
  pattern("checker", 8, `conic-gradient(${ink(13)} 25%, transparent 0 50%, ${ink(13)} 0 75%, transparent 0)`),
  pattern("cross", 6, `repeating-linear-gradient(-45deg, ${ink(20)} 0 1px, transparent 1px 6px)`),
  pattern("big-dots", 14, `radial-gradient(${ink(20)} 2px, transparent 2.5px)`),
  pattern("rows", 5, `repeating-linear-gradient(0deg, ${ink(13)} 0 1px, transparent 1px 5px)`),
  pattern("cols", 5, `repeating-linear-gradient(90deg, ${ink(13)} 0 1px, transparent 1px 5px)`),
  pattern("waves", 16, `radial-gradient(circle at 50% 0, transparent 6px, ${ink(13)} 7px, transparent 8px)`),
  pattern(
    "plaid",
    10,
    `repeating-linear-gradient(0deg, ${ink(13)} 0 2px, transparent 2px 10px), repeating-linear-gradient(90deg, ${ink(13)} 0 2px, transparent 2px 10px)`,
  ),
  pattern("rows-wide", 9, `repeating-linear-gradient(0deg, ${ink(13)} 0 3px, transparent 3px 9px)`),
  pattern("cols-wide", 9, `repeating-linear-gradient(90deg, ${ink(13)} 0 3px, transparent 3px 9px)`),
];

// A chosen background decides the card's text theme: dark colors get light text.
const isDarkColor = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
};

const DEFAULT_OPACITY = 50;
const DEFAULT_ZOOM = 1.5;

export function ShareDialog({
  open,
  onOpenChange,
  hint,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hint: string;
  title: string;
  children: ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [background, setBackground] = useState<string | null>(null);
  const [texture, setTexture] = useState<string | null>("noise");
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [busy, setBusy] = useState<"copy" | "download" | null>(null);

  const tex = TEXTURES.find((t) => t.id === texture);
  const layer: CSSProperties = tex
    ? { ...tex.style(`${tex.size * zoom}px ${tex.size * zoom}px`), opacity: opacity / 100 }
    : {};
  // No background follows the app theme; a picked color sets light or dark text for itself.
  const scope = background === null ? "" : isDarkColor(background) ? "dark" : "light-card";

  // Any element marked data-share-item can be hidden from the image by clicking it.
  const toggleItem = (e: MouseEvent) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>("[data-share-item]");
    if (!item) return;
    if (item.dataset.hidden) delete item.dataset.hidden;
    else item.dataset.hidden = "true";
  };

  const render = async () => {
    if (!card.current) throw new Error("Nothing to render");
    const blob = await toBlob(card.current, { pixelRatio: 2, cacheBust: true });
    if (!blob) throw new Error("Rendering failed");
    return blob;
  };

  const download = async () => {
    setBusy("download");
    try {
      const url = URL.createObjectURL(await render());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    setBusy("copy");
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": render() })]);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(55rem,calc(100vw-2rem))] gap-0 p-0 sm:max-w-[55rem]">
        <DialogTitle className="sr-only">Share {title}</DialogTitle>
        <div className="grid gap-8 p-9 md:grid-cols-[1fr_11.5rem]">
          <div className="min-w-0">
            <CurrencyToggle />
            <p className="mt-1.5 mb-2.5 text-[0.65rem] text-muted-foreground">{hint}</p>
            {/* Fixed width so the exported image looks the same whatever the dialog size. */}
            <div className="overflow-x-auto">
              {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: pointer-only editing aid; the image renders without it */}
              <div
                ref={card}
                onClick={toggleItem}
                className={`${scope} relative w-[36.75rem] overflow-hidden bg-card p-6 text-card-foreground [&_[data-hidden]]:opacity-0 [&_[data-share-item]]:cursor-pointer`}
                style={{ backgroundColor: background ?? undefined }}
              >
                <div className="pointer-events-none absolute inset-0" style={layer} />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.25 text-xs font-bold">
                      <Logo height={14} />
                      Vexis
                    </span>
                    <span className="text-[0.625rem] text-muted-foreground">DLMM portfolio</span>
                  </div>
                  {children}
                  <p className="mt-2.5 text-right text-[0.625rem] text-muted-foreground">
                    {new Date().toISOString().slice(0, 19).replace("T", " ")} UTC
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4.75">
            <div>
              <h3 className="mb-2.5 font-semibold">Background</h3>
              <div className="flex flex-wrap gap-1.5">
                {BACKGROUNDS.map((color) => (
                  <button
                    key={color ?? "none"}
                    type="button"
                    aria-label={color ?? "No background"}
                    onClick={() => setBackground(color)}
                    className={`relative size-5.5 overflow-hidden rounded-md border bg-card ${background === color ? "ring-2 ring-foreground" : ""}`}
                    style={color ? { backgroundColor: color } : undefined}
                  >
                    {color === null && <span className="absolute inset-0 m-auto h-px w-7.25 -rotate-45 bg-loss" />}
                  </button>
                ))}
                <label className="relative flex size-5.5 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground">
                  <PaletteIcon className="size-3.25" />
                  <input
                    type="color"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={(e) => setBackground(e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div>
              <h3 className="mb-2.5 font-semibold">Texture</h3>
              <div className="grid grid-cols-8 gap-1.25">
                {TEXTURES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-label={t.id}
                    onClick={() => setTexture(t.id)}
                    className={`relative size-4.75 overflow-hidden rounded border bg-card text-foreground [--texture-ink:1] ${texture === t.id ? "ring-2 ring-foreground" : ""}`}
                  >
                    <span className="absolute inset-0 opacity-80" style={t.style(`${t.size}px ${t.size}px`)} />
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="No texture"
                  onClick={() => setTexture(null)}
                  className={`relative size-4.75 overflow-hidden rounded border bg-card ${texture === null ? "ring-2 ring-foreground" : ""}`}
                >
                  <span className="absolute inset-0 m-auto h-px w-6.5 -rotate-45 bg-loss" />
                </button>
              </div>
            </div>

            <SliderRow
              label="Opacity"
              value={opacity}
              display={`${opacity}%`}
              min={0}
              max={100}
              step={1}
              onChange={setOpacity}
              onReset={() => setOpacity(DEFAULT_OPACITY)}
            />
            <SliderRow
              label="Zoom"
              value={zoom}
              display={zoom.toFixed(1)}
              min={0.5}
              max={2}
              step={0.1}
              onChange={setZoom}
              onReset={() => setZoom(DEFAULT_ZOOM)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2.5 border-t px-9 py-4">
          <button
            type="button"
            onClick={copy}
            disabled={busy !== null}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3.25 text-xs font-medium hover:bg-muted disabled:opacity-60"
          >
            <CopyIcon className="size-3.25" />
            {busy === "copy" ? "Copying…" : "Copy to Clipboard"}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={busy !== null}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3.25 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-60"
          >
            <DownloadIcon className="size-3.25" />
            {busy === "download" ? "Rendering…" : "Download Image"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SliderRow(props: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between text-xs">
        <span className="text-foreground/80">{props.label}</span>
        <span className="flex items-center gap-1.5 tabular-nums text-foreground/80">
          {props.display}
          <button type="button" aria-label={`Reset ${props.label}`} onClick={props.onReset}>
            <RotateCcwIcon className="size-2.75" />
          </button>
        </span>
      </div>
      <Slider
        value={[props.value]}
        min={props.min}
        max={props.max}
        step={props.step}
        onValueChange={(v) => props.onChange(v[0] ?? props.value)}
        className="[&_[data-slot=slider-range]]:bg-brand [&_[data-slot=slider-thumb]]:border-brand"
      />
    </div>
  );
}
