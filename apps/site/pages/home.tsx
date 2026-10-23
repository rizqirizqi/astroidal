import { CopyButton } from "../components/copy-button";
import {
  QUESTIONS,
  SCOPES,
  SETUP_PROMPT,
  WORKFLOW,
} from "../components/content";
import { ImpactSurface } from "../components/impact-surface";
import { Mark } from "../components/mark";
import { Starfield } from "../components/starfield";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";

export default function Page() {
  return (
    <main id="content" className="font-brand-primary">
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
      />
      <style>{`
        #ws-header, #ws-body, #ws-footer, button, summary {
          font-family: "IBM Plex Sans", ui-sans-serif, sans-serif;
        }
        .font-brand-secondary {
          font-family: "JetBrains Mono", ui-monospace, monospace;
        }
        @keyframes rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: none; }
        }
        .rise { animation: rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          .rise { animation: none; }
        }
        ::selection { background: rgba(0, 242, 254, 0.28); color: #e8eef8; }
      `}</style>
      <Hero />
      <ReviewPath />
      <Pair />
      <Sky />
      <Score />
      <Setup />
      <Questions />
      <Close />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <Starfield />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-72 bg-gradient-to-b from-brand-bg via-brand-bg/85 to-transparent"
      />
      <div className="pointer-events-none relative z-10 mx-auto max-w-6xl px-4 pt-16 pb-16 sm:px-6 sm:pt-20 lg:pt-24 lg:pb-20">
        <p className="rise font-brand-secondary text-[11px] tracking-[0.2em] text-brand-primary uppercase">
          Open source · AI code review map
        </p>
        <h1 className="rise mt-4 max-w-4xl text-[2.7rem] leading-[0.96] font-medium tracking-[-0.045em] text-brand-text [animation-delay:80ms] sm:text-6xl lg:text-7xl">
          Give your agent a map.
          <span className="mt-1 block text-brand-primary drop-shadow-[0_0_18px_rgba(0,242,254,0.35)]">
            Find what actually breaks.
          </span>
        </h1>
        <div className="mt-8 grid items-end gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="rise lg:col-span-5 [animation-delay:140ms]">
            <p className="max-w-md text-base leading-7 text-[#A8B3C7] [text-shadow:0_1px_14px_rgb(11,15,25)] sm:text-lg">
              Astroidal draws the blast radius, hands your agent a bug map, and
              keeps a finding only when it quotes a real line. The verdict is
              Passed, or Fix first.
            </p>
            <div className="pointer-events-auto mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <CopyButton value={SETUP_PROMPT} label="Copy setup prompt" />
              <a
                href="#review"
                className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-white/15 px-5 text-sm text-brand-text no-underline transition-colors duration-200 hover:border-brand-primary/70 ${FOCUS}`}
              >
                How a review goes
              </a>
            </div>
            
          </div>
          <figure className="pointer-events-auto rise lg:col-span-7 [animation-delay:200ms]">
            <div className="overflow-hidden rounded-2xl border border-white/15 bg-[#0C111C] shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between gap-3 border-b border-white/15 px-4 py-3">
                <p className="font-brand-secondary text-[11px] tracking-[0.16em] text-brand-primary uppercase">
                  constellation.html
                </p>
                <p className="rounded-full border border-[#FFB020]/70 px-2.5 py-1 font-brand-secondary text-[10px] tracking-[0.12em] text-[#FFB020] uppercase">
                  Full review
                </p>
              </div>
              <video
                controls
                playsInline
                preload="none"
                poster="/assets/preview-poster.jpg?v=2"
                className="aspect-[1600/868] w-full bg-brand-bg"
                aria-label="Recording of an Astroidal constellation, scored 9, Fix first"
              >
                <source src="/assets/preview.mp4" type="video/mp4" />
              </video>
            </div>
            <figcaption className="mt-3 font-brand-secondary text-xs leading-5 text-[#A8B3C7]">
              A recorded review. Fifty-four seconds, no narration.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

function ReviewPath() {
  return (
    <section id="review" className="scroll-mt-24 border-t border-white/15">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <p className="font-brand-secondary text-[11px] tracking-[0.18em] text-brand-primary uppercase">
          How a review goes
        </p>
        <h2 className="mt-3 max-w-3xl text-3xl tracking-[-0.04em] text-brand-text sm:text-5xl">
          Map the change. Hunt the bugs. Score what is left.
        </h2>
        <ol className="mt-14 grid gap-4 lg:grid-cols-3 lg:gap-10">
          {WORKFLOW.map((step, index) => {
            const isAgent = step.tone === "agent";
            return (
              <li
                key={step.index}
                className={`relative rounded-2xl border bg-[#0C111C] p-6 ${isAgent ? "border-[#D2B4FF]/60" : "border-brand-primary/45"}`}
              >
                {index < WORKFLOW.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 -right-9 z-10 hidden size-8 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-brand-bg font-brand-secondary text-sm text-brand-primary lg:grid"
                  >
                    →
                  </span>
                ) : null}
                <p
                  className={`font-brand-secondary text-[11px] tracking-[0.16em] uppercase ${isAgent ? "text-[#D2B4FF]" : "text-brand-primary"}`}
                >
                  {step.index} · {step.who}
                </p>
                <h3 className="mt-4 text-2xl tracking-[-0.04em] text-brand-text">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[#A8B3C7]">
                  {step.text}
                </p>
              </li>
            );
          })}
        </ol>
        <ul
          className="mt-8 flex flex-wrap gap-2"
          aria-label="What one map can cover"
        >
          {SCOPES.map((scope) => (
            <li
              key={scope}
              className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-[#A8B3C7]"
            >
              {scope}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Sky() {
  return (
    <section id="sky" className="scroll-mt-24 border-t border-white/15">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="font-brand-secondary text-[11px] tracking-[0.18em] text-brand-primary uppercase">
              Recorded maps
            </p>
            <h2 className="mt-3 max-w-xl text-3xl tracking-[-0.04em] text-brand-text sm:text-5xl">
              Two skies from the same instrument.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-[#A8B3C7]">
            These are real reviews from the recorder. The numbers are the ones
            on the chart, not a logo wall.
          </p>
        </div>

        <div className="mt-12 grid gap-8">
          <MapShot
            src="/assets/map-fix-first.jpg"
            alt="Astroidal map of 14 pull requests and 198 files, scored 9, Fix first, with a dense star field and a cusp alert."
            score="9"
            verdict="Fix first"
            tone="flare"
            meta="14 pull requests · 198 files · +4493 −1737"
            axes="Complexity +203 · Security 22 · Blast 65 · Performance 12"
          />
          <MapShot
            src="/assets/map-passed.jpg"
            alt="Astroidal map of a 24-file worktree, scored 82, Passed, with directory clouds and no cusp alerts."
            score="82"
            verdict="Passed"
            tone="glow"
            meta="Worktree · 24 files · +240 −48"
            axes="Complexity +12 · Security 10 · Blast 40 · Performance 15"
          />
        </div>

        <Legend />

        <figure className="mt-10 border-l-2 border-brand-primary bg-white/5 px-5 py-5">
          <figcaption className="font-brand-secondary text-[11px] tracking-[0.14em] text-[#FFB020] uppercase">
            Cusp alert · A-001 · high
          </figcaption>
          <blockquote className="mt-3 max-w-3xl text-lg leading-7 text-brand-text">
            The numeric scan still raises C-NUMERIC-INVALID for an extra column
            that maps to no field. A user uploading an inventory export with a
            date or a broken node in one of those columns cannot apply cleaning
            until they resolve a finding no analysis reads.
          </blockquote>
          <p className="mt-4 font-brand-secondary text-xs text-brand-primary">
            packages/clean/src/rules/numeric-rules.ts:643
          </p>
        </figure>
      </div>
    </section>
  );
}

function MapShot({
  src,
  alt,
  score,
  verdict,
  tone,
  meta,
  axes,
}: {
  src: string;
  alt: string;
  score: string;
  verdict: string;
  tone: "flare" | "glow";
  meta: string;
  axes: string;
}) {
  const toneClass = tone === "flare" ? "text-[#FFB020]" : "text-brand-primary";
  const borderClass =
    tone === "flare" ? "border-[#FFB020]/70" : "border-brand-primary/70";

  return (
    <figure className="grid items-stretch gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <figcaption
        className={`order-2 flex flex-col justify-between rounded-2xl border bg-[#0C111C] p-5 lg:order-1 ${borderClass}`}
      >
        <div>
          <p className="font-brand-secondary text-[11px] tracking-[0.16em] text-[#A8B3C7] uppercase">
            Astroidal score
          </p>
          <p
            className={`mt-2 font-brand-secondary text-6xl tracking-[-0.05em] tabular-nums ${toneClass}`}
          >
            {score}
          </p>
          <p
            className={`mt-1 text-sm tracking-[0.14em] uppercase ${toneClass}`}
          >
            {verdict}
          </p>
        </div>
        <div className="mt-6">
          <p className="text-sm leading-6 text-brand-text">{meta}</p>
          <p className="mt-2 font-brand-secondary text-xs leading-5 text-[#A8B3C7]">
            {axes}
          </p>
        </div>
      </figcaption>
      <div className="order-1 overflow-hidden rounded-2xl border border-white/15 lg:order-2">
        <img
          src={src}
          alt={alt}
          width={1024}
          height={573}
          className="h-auto w-full"
        />
      </div>
    </figure>
  );
}

function Legend() {
  const items = [
    { name: "Logic", className: "size-2.5 rounded-full bg-brand-primary" },
    { name: "Contract", className: "size-2.5 rotate-45 bg-[#D2B4FF]" },
    { name: "Text", className: "size-2.5 rounded-[2px] bg-[#C5D0E2]" },
    {
      name: "Orbit",
      className: "size-2.5 rounded-full border border-[#7E8BA3]",
    },
  ];

  return (
    <div className="mt-8 flex flex-col gap-4 border-t border-white/15 pt-6 lg:flex-row lg:items-center lg:justify-between">
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {items.map((item) => (
          <li
            key={item.name}
            className="flex items-center gap-2 text-sm text-[#A8B3C7]"
          >
            <span aria-hidden="true" className={item.className} />
            {item.name}
          </li>
        ))}
      </ul>
      <p className="max-w-xl text-sm leading-6 text-[#A8B3C7]">
        A cloud is a directory. Violet is a named group. A line is an import or
        a call.
      </p>
    </div>
  );
}

const AXES = [
  {
    name: "Complexity",
    tone: "text-[#D2B4FF]",
    text: "New decisions in the diff: branches, loops, and awaits. This map is +12.",
  },
  {
    name: "Blast radius",
    tone: "text-brand-primary",
    text: "Files outside the change that import or call what moved. 40 on this map.",
  },
  {
    name: "Security",
    tone: "text-[#FFB020]",
    text: "Added lines that look like injection, a hardcoded secret, or a change on an auth or payment path. 10.",
  },
  {
    name: "Performance",
    tone: "text-[#9AF7FF]",
    text: "Synchronous I/O, or a loop around a wait or a query. 15 on this map.",
  },
] as const;

function Score() {
  return (
    <section id="score" className="scroll-mt-24 border-t border-white/15">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
        <div>
          <p className="font-brand-secondary text-[11px] tracking-[0.18em] text-brand-primary uppercase">
            Impact surface
          </p>
          <h2 className="mt-3 text-3xl tracking-[-0.04em] text-brand-text sm:text-5xl">
            The shape of the change.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#A8B3C7]">
            The astroid measures how far the diff reaches. It is not the bug. A
            finding still has to name a symbol and quote a line.
          </p>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            {AXES.map((axis) => (
              <div
                key={axis.name}
                className="rounded-2xl border border-white/15 p-4"
              >
                <dt
                  className={`font-brand-secondary text-xs tracking-[0.12em] uppercase ${axis.tone}`}
                >
                  {axis.name}
                </dt>
                <dd className="mt-2 text-sm leading-6 text-[#A8B3C7]">
                  {axis.text}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-2xl border border-brand-primary/70 bg-[#0C111C] p-6 sm:p-8">
          <p className="font-brand-secondary text-[11px] tracking-[0.16em] text-[#A8B3C7] uppercase">
            Passed worktree
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-4">
            <p className="font-brand-secondary text-6xl tracking-[-0.05em] text-brand-primary tabular-nums">
              82
            </p>
            <p className="tracking-[0.14em] text-brand-primary uppercase">
              Passed
            </p>
          </div>
          <p className="mt-2 text-sm text-[#A8B3C7]">
            No cusp alerts on this map.
          </p>
          <div className="mt-6">
            <ImpactSurface />
          </div>
        </div>
      </div>
    </section>
  );
}

function Pair() {
  return (
    <section className="border-t border-white/15">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <p className="font-brand-secondary text-[11px] tracking-[0.18em] text-brand-primary uppercase">
          You and your agent
        </p>
        <h2 className="mt-3 max-w-3xl text-3xl tracking-[-0.04em] text-brand-text sm:text-5xl">
          A faster review, with the line still in it.
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[#A8B3C7]">
          You stop walking the diff line by line. Your agent searches the map
          and brings back the finding that quotes a real line. The chart keeps
          the rest of the change in view.
        </p>
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-white/15 bg-[#0C111C] p-6">
            <p className="font-brand-secondary text-[11px] tracking-[0.16em] text-brand-text uppercase">
              You
            </p>
            <h3 className="mt-4 text-2xl tracking-[-0.04em] text-brand-text">
              Review the line that breaks.
            </h3>
            <p className="mt-3 text-sm leading-6 text-[#A8B3C7]">
              Open the map, read the score, and look at the quoted line. The
              other lines stay on the chart, where you can see them without
              reading each one.
            </p>
          </article>
          <article className="rounded-2xl border border-[#D2B4FF]/60 bg-[#0C111C] p-6">
            <p className="font-brand-secondary text-[11px] tracking-[0.16em] text-[#D2B4FF] uppercase">
              Your agent
            </p>
            <h3 className="mt-4 text-2xl tracking-[-0.04em] text-brand-text">
              Search the map.
            </h3>
            <p className="mt-3 text-sm leading-6 text-[#A8B3C7]">
              The agent follows the symbols the diff touched and writes a
              finding only when it can name one and quote a line in the change.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

function Setup() {
  return (
    <section id="setup" className="scroll-mt-24 border-t border-white/15">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
        <div>
          <p className="font-brand-secondary text-[11px] tracking-[0.18em] text-brand-primary uppercase">
            Setup
          </p>
          <h2 className="mt-3 text-3xl tracking-[-0.04em] text-brand-text sm:text-5xl">
            Paste this to your agent.
          </h2>
          <p className="mt-5 text-base leading-7 text-[#A8B3C7]">
            Graph the change, let the agent search it, then rank. The reply you
            want back is the score, Passed or Fix first, and the two paths.
          </p>
          <div className="mt-7">
            <CopyButton value={SETUP_PROMPT} label="Copy setup prompt" />
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/15 bg-[#070b12]">
          <div className="flex items-center justify-between border-b border-white/15 px-4 py-3">
            <p className="font-brand-secondary text-[11px] tracking-[0.16em] text-[#A8B3C7] uppercase">
              Agent prompt
            </p>
            <p className="font-brand-secondary text-[11px] text-brand-primary">
              $ npx --yes astroidal
            </p>
          </div>
          <pre className="overflow-x-auto p-5 font-brand-secondary text-[13px] leading-6 whitespace-pre-wrap text-brand-text">
            {SETUP_PROMPT}
          </pre>
        </div>
      </div>
    </section>
  );
}

function Questions() {
  return (
    <section id="questions" className="scroll-mt-24 border-t border-white/15">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.7fr_1.3fr] lg:py-28">
        <div>
          <p className="font-brand-secondary text-[11px] tracking-[0.18em] text-brand-primary uppercase">
            Questions
          </p>
          <h2 className="mt-3 text-3xl tracking-[-0.04em] text-brand-text sm:text-5xl">
            Before you run it.
          </h2>
        </div>
        <div className="border-t border-white/15">
          {QUESTIONS.map((item) => (
            <details
              key={item.question}
              className="group border-b border-white/15"
            >
              <summary
                className={`flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-base text-brand-text marker:content-none ${FOCUS}`}
              >
                {item.question}
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-white/15 font-brand-secondary text-brand-primary transition-transform duration-200 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-5 text-sm leading-6 text-[#A8B3C7]">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Close() {
  return (
    <section className="relative overflow-hidden border-t border-white/15">
      <Mark className="pointer-events-none absolute top-1/2 left-1/2 size-[28rem] -translate-x-1/2 -translate-y-1/2 text-brand-primary/15" />
      <div className="relative mx-auto max-w-6xl px-4 py-24 text-center sm:px-6 lg:py-32">
        <p className="font-brand-secondary text-[11px] tracking-[0.18em] text-brand-primary uppercase">
          Astroidal score
        </p>
        <h2 className="mx-auto mt-4 max-w-3xl text-4xl tracking-[-0.045em] text-brand-text sm:text-6xl">
          Hand your agent the map.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#A8B3C7]">
          The next reply should open with the score, say Passed or Fix first,
          and point at the chart and the review.
        </p>
        <div className="mt-8 flex justify-center">
          <CopyButton value={SETUP_PROMPT} label="Copy setup prompt" />
        </div>
      </div>
    </section>
  );
}
