import { Link } from "@tanstack/react-router";
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode, useEffect, useState } from "react";
import { Logo } from "@/components/icons";

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  const sections: { id: string; title: string }[] = [];
  const body = Children.map(children, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child) || child.type !== "h2") return child;
    if (typeof child.props.children !== "string") return child;
    const section = { id: slug(child.props.children), title: child.props.children };
    sections.push(section);
    return cloneElement(child as ReactElement<{ id?: string }>, { id: section.id });
  });
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const { scrollHeight, clientHeight } = document.documentElement;
      // At a scaled display zoom scrollY stops a fraction of a pixel short of the end.
      const left = scrollHeight - clientHeight - window.scrollY;
      setProgress(left <= 1 ? 1 : window.scrollY / (scrollHeight - clientHeight));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className="min-h-svh bg-background px-6 py-10 text-foreground">
      <div
        aria-hidden
        className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-brand"
        style={{ transform: `scaleX(${progress})` }}
      />
      <header className="mx-auto max-w-xl lg:max-w-[848px]">
        <Link
          to="/"
          className="flex w-fit items-center gap-2.5 font-brand text-lg font-bold tracking-[0.12em] uppercase"
        >
          <Logo height={22} />
          Vexis
        </Link>
      </header>
      <div className="mx-auto mt-12 flex max-w-xl items-start gap-16 lg:max-w-[848px]">
        <article className="flex max-w-xl min-w-0 flex-col gap-4 text-sm/relaxed text-muted-foreground [&_h2]:mt-4 [&_h2]:scroll-mt-10 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">
          <h1 className="text-[44px] leading-none font-bold text-foreground">{title}</h1>
          <p className="text-xs">Last updated {updated}</p>
          {body}
        </article>
        <aside className="sticky top-10 hidden w-52 shrink-0 flex-col gap-6 text-xs lg:flex">
          <nav className="flex flex-col gap-2">
            <p className="font-medium text-foreground">On this page</p>
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {section.title}
              </a>
            ))}
          </nav>
          <nav className="flex flex-col gap-2 border-t pt-6">
            <p className="font-medium text-foreground">Legal</p>
            {(
              [
                ["/terms", "Terms of Service"],
                ["/privacy", "Privacy Policy"],
              ] as const
            ).map(([to, label]) => (
              <Link
                key={to}
                to={to}
                className="text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground"
              >
                {label}
              </Link>
            ))}
          </nav>
        </aside>
      </div>
    </div>
  );
}
