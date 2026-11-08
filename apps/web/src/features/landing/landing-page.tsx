import { Link, useRouteContext } from "@tanstack/react-router";
import {
  Calendar,
  Check,
  Eye,
  Gauge,
  Menu,
  Pause,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  AlertPhone,
  BigMark,
  BinsGlimpse,
  BrandMark,
  Circuit,
  HeroChart,
  ProfitDays,
  SafetyCards,
} from "./landing-art";
import { Shader } from "./landing-shader";

// Fades every [data-reveal] element in the first time it scrolls into view.
function useReveal() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    for (const el of root.current?.querySelectorAll("[data-reveal]") ?? []) io.observe(el);
    return () => io.disconnect();
  }, []);
  return root;
}

export function LandingPage() {
  const root = useReveal();
  return (
    <div ref={root} className="vx-page">
      <Nav />
      <Hero />
      <Sources />
      <Benefits />
      <About />
      <section className="section image-section">
        <div className="w-layout-blockcontainer base-container w-container">
          <Circuit />
        </div>
      </section>
      <Edge />
      <Security />
      <HowItWorks />
      <Access />
      <Footer />
    </div>
  );
}

function Arrows({ back = false, className }: { back?: boolean; className?: string }) {
  const d = back ? "M6.5 1.5 1.5 7l5 5.5" : "M1.5 1.5 6.5 7l-5 5.5";
  return (
    <div className={cn("arrow-button", back && "arrow-back", className)}>
      <svg className="button-arrow dark-icon-button" viewBox="0 0 8 14" aria-hidden="true">
        <path d={d} />
      </svg>
      <svg className="button-arrow white-icon-hover" viewBox="0 0 8 14" aria-hidden="true">
        <path d={d} />
      </svg>
    </div>
  );
}

type CtaTarget = { href: `#${string}` } | { to: "/portfolio" } | { to: "/login"; join: true };

function Cta({
  children,
  white = false,
  wide = false,
  className,
  ...target
}: CtaTarget & {
  children: ReactNode;
  white?: boolean;
  wide?: boolean;
  className?: string;
}) {
  const look = cn(white ? "primary-button-white" : "primary-button", wide && "full-width-button", "w-inline-block");
  const body = (
    <>
      <div className="text-primary-button">{children}</div>
      <Arrows />
    </>
  );
  return (
    <div className={cn(white ? "borders-w-primary-button" : "borders-primary-button", className)}>
      {"href" in target ? (
        <a className={look} href={target.href}>
          {body}
        </a>
      ) : target.to === "/login" ? (
        <Link className={look} to="/login" search={{ mode: "join" }}>
          {body}
        </Link>
      ) : (
        <Link className={look} to="/portfolio">
          {body}
        </Link>
      )}
    </div>
  );
}

function useSignedIn() {
  return useRouteContext({ from: "__root__", select: (c) => c.viewer != null });
}

/** The header's main button: signed-in visitors go straight to the app. */
function HeaderCta({ className }: { className?: string }) {
  return useSignedIn() ? (
    <Cta to="/portfolio" white className={className}>
      Open app
    </Cta>
  ) : (
    <Cta href="#access" white className={className}>
      Request an invite
    </Cta>
  );
}

function Subtitle({ children, reveal = true }: { children: ReactNode; reveal?: boolean }) {
  return (
    <div className="subtitle-text" data-reveal={reveal ? "" : undefined}>
      <span className="cube-text" />
      {children}
    </div>
  );
}

function Checks({ items }: { items: string[] }) {
  return (
    <div className="benefits-check-wrapper">
      {items.map((item) => (
        <div key={item} className="benefit-wrap" data-reveal="">
          <Check className="vx-check" aria-hidden="true" />
          <div className="benefit-text">{item}</div>
        </div>
      ))}
    </div>
  );
}

const NAV_LINKS = [
  ["#features", "Features"],
  ["#about", "About"],
  ["#how", "How it works"],
  ["#access", "Access"],
] as const;

function Nav() {
  const signedIn = useSignedIn();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The slide-over menu only exists below 992px; close it when the layout grows past that.
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 991px)");
    const onChange = () => setOpen(false);
    mobile.addEventListener("change", onChange);
    return () => mobile.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <>
      <header
        className={cn("navbar w-nav", scrolled && "is-scrolled")}
        data-animation="over-left"
        data-collapse="medium"
      >
        <div className="nav-container w-container">
          <div className="nav-menu-wrapper">
            <div className="logo-header-wrap">
              <a className="brand w-nav-brand" href="#top" aria-label="Vexis home">
                <BrandMark />
              </a>
            </div>
            <nav className={cn("nav-menu w-nav-menu", open && "is-open")}>
              <div className="tablet-menu">
                <a className="brand-tablet w-nav-brand" href="#top">
                  <BrandMark />
                </a>
                <button
                  type="button"
                  className={cn("close-menu-button w-nav-button", open && "w--open")}
                  aria-label="Close menu"
                  onClick={close}
                >
                  <X className="vx-menu-icon" />
                </button>
              </div>
              <div className="menu-wrap">
                <div className="vx-nav-links">
                  {NAV_LINKS.map(([href, label]) => (
                    <a key={href} href={href} onClick={close}>
                      {label}
                    </a>
                  ))}
                </div>
                <div className="button-header tablet-button">
                  {!signedIn && (
                    <Link className="vx-signin vx-signin-menu" to="/login" onClick={close}>
                      Sign in
                    </Link>
                  )}
                  <HeaderCta />
                </div>
              </div>
            </nav>
            <div className="button-header">
              {!signedIn && (
                <Link className="vx-signin" to="/login">
                  Sign in
                </Link>
              )}
              <HeaderCta className="header-desctop" />
            </div>
            <button
              type="button"
              className={cn("menu-button w-nav-button", open && "w--open")}
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu className="vx-menu-icon" />
            </button>
          </div>
        </div>
      </header>
      <button
        type="button"
        className={cn("vx-nav-backdrop", open && "is-open")}
        aria-label="Close menu"
        tabIndex={-1}
        onClick={close}
      />
    </>
  );
}

function Hero() {
  return (
    <section className="section home-3-banner vx-shaded" id="top">
      <Shader mode="aurora" className="vx-shader-hero" />
      <div className="w-layout-blockcontainer base-container w-container">
        <div className="images-banner-home-3 vx-hero">
          <HeroChart />
          <BigMark />
          <div className="currency banner-3" data-reveal="">
            USD
          </div>
          <div className="currency banner-3-left" data-reveal="">
            SOL
          </div>
        </div>
        <div className="content-banner-home-3-wrapper vx-hero-copy">
          <div className="title-banner-3-wrapper">
            <h1 data-reveal="">Smarter DLMM management</h1>
            <p data-reveal="">
              Vexis brings every Meteora DLMM position into one clear view, so new and seasoned liquidity providers
              always know what is earning, what is not, and where to go next.
            </p>
          </div>
          <div className="section-button-wrapper" data-reveal="">
            <Cta href="#access">Request an invite</Cta>
          </div>
        </div>
      </div>
    </section>
  );
}

const SOURCES = [
  ["/links/meteora.png", "Meteora"],
  ["/Solana_logo.png", "Solana"],
  ["/brands/jupiter.png", "Jupiter"],
] as const;

function Sources() {
  return (
    <section className="section without-space">
      <div className="w-layout-blockcontainer base-container w-container">
        <div className="vx-sources-label" data-reveal="">
          Powered by the best of Solana
        </div>
        <div className="logos-banner vx-sources" data-reveal="">
          {SOURCES.map(([src, name]) => (
            <span key={name} className="vx-source">
              <img src={src} alt="" />
              {name}
            </span>
          ))}
        </div>
        <div className="line" />
      </div>
    </section>
  );
}

function Benefits() {
  return (
    <>
      <section className="section light-background" id="features">
        <div className="w-layout-blockcontainer base-container w-container">
          <div className="title-benefits-wrapper">
            <Subtitle>Vexis benefits</Subtitle>
            <h2 data-reveal="">A clearer way to provide liquidity, from your first position to your thousandth.</h2>
          </div>
        </div>
      </section>
      <section className="section light-background-without-top">
        <div className="w-layout-blockcontainer base-container small-container w-container">
          <div className="benefits-wrapper">
            <div className="content-benefits-wrapper">
              <h3 data-reveal="">Effortlessly see what every position really earned.</h3>
              <p data-reveal="">
                Drop in any wallet and watch your full DLMM story come to life. Every deposit, every fee and every
                withdrawal adds up in SOL and USD, so you always know exactly where your returns come from.
              </p>
              <Checks items={["Full Position History", "Daily Profit Calendar"]} />
            </div>
            <div className="content-home-1-wrapper home-3-value vx-dotted" data-reveal="">
              <h4>Your profit, day by day</h4>
              <ProfitDays />
              <p className="small-paragraph">
                Every day closes in green or red, in SOL and USD, so your best days stand out at a glance.
              </p>
            </div>
          </div>
          <div className="benefit-line" data-reveal="" />
          <div className="benefits-wrapper central-block">
            <div className="content-home-1-wrapper home-3-central-block vx-bins-card vx-dotted" data-reveal="">
              <BinsGlimpse />
            </div>
            <div className="content-benefits-wrapper small-content">
              <h3 data-reveal="">Stay ahead with live pool data and liquidity insights.</h3>
              <p data-reveal="">
                See where the liquidity sits, how hard a pool is earning and which wallets are moving it, all before you
                commit a single SOL.
              </p>
              <Checks items={["Live Liquidity Map", "Smart Wallet Tracking"]} />
            </div>
          </div>
          <div className="benefit-line" data-reveal="" />
          <div className="benefits-wrapper">
            <div className="content-benefits-wrapper">
              <h3 className="max-w-400px" data-reveal="">
                Automate your watchlist and never miss a big move.
              </h3>
              <p data-reveal="">
                Set your rules once and let Vexis watch your pools around the clock. When volume surges or a position
                drifts out of range, you hear about it first, and Vexis can keep your range in shape for you.
              </p>
              <Checks items={["Instant Telegram Alerts", "Hands-Free Range Care"]} />
            </div>
            <div className="content-home-1-wrapper last-item-home-3 vx-tg-card vx-dotted" data-reveal="">
              <h4 className="relative">Alerts that find you</h4>
              <AlertPhone />
              <p className="small-paragraph">Be the first to know when a pool heats up, wherever you are.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

const INSIGHTS = [
  [Wallet, "Net P&L", "Know exactly what you earned after fees."],
  [TrendingUp, "Profit factor", "See how far your wins outweigh your losses."],
  [Calendar, "Winning days", "Find out how often your days close green."],
  [Gauge, "Pool yield", "Spot the pools that pay the most for their size."],
  [Target, "LPs in range", "See who is still earning in a pool right now."],
  [Users, "Smart money", "Know whether whales and KOLs are still holding."],
] as const;

function About() {
  return (
    <section className="section without-bottom-spacing" id="about">
      <div className="w-layout-blockcontainer base-container w-container">
        <div className="about-wrapper">
          <div>
            <Subtitle>About Vexis</Subtitle>
          </div>
          <div className="right-content-about-wrap">
            <h2 data-reveal="">We believe every liquidity provider deserves numbers they can trust.</h2>
            <p data-reveal="">
              Every figure in Vexis is earned, never estimated. If we can't stand behind a number, you won't see it, so
              every move you make is backed by real data.
            </p>
            <div className="section-button-wrapper" data-reveal="">
              <Cta href="#how">See how it works</Cta>
            </div>
          </div>
        </div>
        <div className="numbers-home-wrapper margin-top---100 vx-insights" data-reveal="">
          {INSIGHTS.map(([Icon, title, text]) => (
            <div key={title} className="number-home">
              <div className="big-number">
                <Icon className="vx-ic" aria-hidden="true" />
                {title}
              </div>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Edge() {
  return (
    <section className="section without-space">
      <div className="w-layout-blockcontainer base-container w-container">
        <div className="big-title-wrapp">
          <h2 data-reveal="">More than a tracker. Vexis is where liquidity providers find their edge.</h2>
          <p className="paragraph-about-width" data-reveal="">
            Your positions, the pools you love and the alerts that matter, all in one focused space that makes DLMM
            liquidity simpler to manage and easier to grow.
          </p>
          <div className="section-button-wrapper" data-reveal="">
            <Cta href="#access">Request an invite</Cta>
          </div>
        </div>
      </div>
    </section>
  );
}

const SAFEGUARDS = [
  [Eye, "No Wallet Connection"],
  [ShieldCheck, "Preview Before Going Live"],
  [Pause, "Pause Anytime"],
] as const;

function Security() {
  return (
    <section className="section">
      <div className="w-layout-blockcontainer base-container w-container">
        <div className="block">
          <div className="left-cards-wrapper">
            <h2 data-reveal="">Secure by design, read-only by default.</h2>
            <p data-reveal="">
              Follow any wallet with just its address.{" "}
              <span className="light-normal-paragraph">No connection, no signatures, no risk to your funds.</span> And
              when you are ready to automate, Vexis works only with a wallet you dedicate to it.
            </p>
            <div className="values-cards-wrapper">
              {SAFEGUARDS.map(([Icon, label]) => (
                <div key={label} className="value-text small-value-text" data-reveal="">
                  <Icon className="vx-ic" aria-hidden="true" />
                  {label}
                </div>
              ))}
            </div>
            <div className="section-button-wrapper" data-reveal="">
              <Cta href="#how">See how it works</Cta>
            </div>
          </div>
          <SafetyCards />
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  ["Step 1 · Track", "Paste a wallet address and watch your entire DLMM history come together."],
  [
    "Step 2 · Understand",
    "Open any pool to see its liquidity, its earnings and its biggest players before you jump in.",
  ],
  ["Step 3 · Automate", "Set a rule once and let Vexis watch your pools, even while you sleep."],
] as const;

function HowItWorks() {
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const go = (n: number) => setIndex((n + STEPS.length) % STEPS.length);

  return (
    <section className="section without-space" id="how">
      <div className="w-layout-blockcontainer base-container w-container">
        <div className="testimonials-wrap">
          <div className="title-testimonials-wrap">
            <Subtitle>How it works</Subtitle>
          </div>
        </div>
        <section
          className="slider-testimonials w-slider"
          data-reveal=""
          aria-roledescription="carousel"
          aria-label="How it works"
          onPointerDown={(e) => {
            startX.current = e.clientX;
          }}
          onPointerUp={(e) => {
            if (startX.current === null) return;
            const dx = e.clientX - startX.current;
            if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
            startX.current = null;
          }}
        >
          <div className="w-slider-mask">
            {STEPS.map(([step, text], i) => (
              <div
                key={step}
                className="w-slide"
                aria-hidden={i !== index}
                style={{ transform: `translateX(${-index * 100}%)` }}
              >
                <div className="content-review-wrapper center-review">
                  <span className="vx-step">{step}</span>
                  <div className="text-review">{text}</div>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="left-arrow-review center-arrow w-slider-arrow-left"
            aria-label="Previous step"
            onClick={() => go(index - 1)}
          >
            <div className="div-block-30">
              <Arrows back className="arrow-testimonials" />
            </div>
          </button>
          <button
            type="button"
            className="right-arrow-review center-arrow w-slider-arrow-right"
            aria-label="Next step"
            onClick={() => go(index + 1)}
          >
            <div className="div-block-30">
              <Arrows className="arrow-testimonials" />
            </div>
          </button>
        </section>
      </div>
    </section>
  );
}

const PLANS = [
  {
    label: "Insights",
    name: "Track",
    text: "Understand every position and every pool before your next move.",
    items: ["Portfolio & Profit Tracking", "Daily Profit Calendar", "Pool Analytics", "Smart Wallet Tracking"],
  },
  {
    label: "Automation",
    name: "Automate",
    text: "Let Vexis watch your pools and act on your rules around the clock.",
    items: ["Instant Telegram Alerts", "Volume Spike Detection", "Hands-Free Range Care", "Safe Preview Mode"],
  },
];

function Access() {
  return (
    <section className="section vx-shaded vx-access" id="access">
      <Shader mode="globe" className="vx-shader-access" />
      <div className="w-layout-blockcontainer base-container w-container">
        <div className="w-layout-grid pricing-home-wrapper">
          <div className="title-pricing-wrapper title-pricing-without-background vx-access-title" data-reveal="">
            <div className="top-pricing-title">
              <Subtitle reveal={false}>Early access</Subtitle>
              <h2>Everything you need to grow your liquidity with confidence.</h2>
            </div>
            <p className="relative light-paragraph">
              Vexis is opening its doors gradually. Request your invite and be among the first to unlock the full
              experience.
            </p>
          </div>
          {PLANS.map((plan) => (
            <div key={plan.name} className="pricing-plan-wrapper" data-reveal="">
              <Subtitle reveal={false}>{plan.label}</Subtitle>
              <div className="price-wrapper">
                <div className="big-price vx-plan">{plan.name}</div>
              </div>
              <p>{plan.text}</p>
              <div className="price-line" />
              <div className="w-layout-grid price-values-wrapper">
                {plan.items.map((item) => (
                  <div key={item} className="price-value-wrap">
                    <Check className="vx-check" aria-hidden="true" />
                    <div className="value-price">{item}</div>
                  </div>
                ))}
              </div>
              <div className="button-price-wrapper">
                <Cta to="/login" join wide>
                  I have an invite
                </Cta>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const FOOTER_LINKS = [
  {
    title: "Product",
    links: [
      ["/portfolio", "Portfolio"],
      ["/analytics", "Analytics"],
      ["/agents", "Agents"],
    ],
  },
  {
    title: "Explore",
    links: [
      ["#features", "Features"],
      ["#about", "About"],
      ["#how", "How it works"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["/terms", "Terms"],
      ["/privacy", "Privacy"],
      ["/login", "Sign in"],
    ],
  },
] as const;

const isHash = (href: string): href is `#${string}` => href.startsWith("#");

function Footer() {
  return (
    <div className="footer vx-shaded">
      <Shader mode="streaks" className="vx-shader-footer" />
      <div className="base-container w-container">
        <div className="footer-wrapper">
          <div className="footer-brand-wrapper">
            <a className="footer-brand w-nav-brand" href="#top">
              <BrandMark />
            </a>
            <p className="footer-brand-description">
              <span className="block-text">Manage your liquidity.</span>Clearer and smarter.
            </p>
            <div className="links-pages-footer-wrapper">
              {FOOTER_LINKS.map((group) => (
                <div key={group.title} className="footer-links-wrapper">
                  <h6 className="h6-footer-title">{group.title}</h6>
                  {group.links.map(([href, label]) =>
                    isHash(href) ? (
                      <a key={href} className="footer-link" href={href}>
                        {label}
                      </a>
                    ) : (
                      <Link key={href} className="footer-link" to={href}>
                        {label}
                      </Link>
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="text-footer-wrapper">
            <div className="subtitle-text">Ready when you are</div>
            <h2>Bring your first wallet and see your liquidity the way it really is.</h2>
            <div className="button-footer-wrapper">
              <Cta href="#access">Request an invite</Cta>
            </div>
          </div>
        </div>
        <div className="footer-bottom-wrapper">
          <div className="left-copyright-wrapper">
            <div className="footer-copyright">© 2026 Vexis. All rights reserved.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
