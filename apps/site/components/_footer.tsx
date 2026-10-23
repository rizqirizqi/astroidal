import { GITHUB_URL, ISSUES_URL, NAV_ITEMS } from "./content";
import { Mark } from "./mark";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/15 bg-[#0C111C] font-brand-primary">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <a
            href="#content"
            className="inline-flex items-center gap-2 text-brand-text no-underline"
            aria-label="Astroidal"
          >
            <Mark className="size-7 text-brand-primary" />
            <span className="text-lg tracking-[-0.04em]">Astroidal</span>
          </a>
          <p className="mt-4 max-w-sm text-sm leading-6 text-[#A8B3C7]">
            AI code review map, scorer, and helper. The chart and the table live
            in files. The chat reply stays short.
          </p>
        </div>
        <div>
          <h2 className="font-brand-secondary text-[11px] tracking-[0.16em] text-[#A8B3C7] uppercase">
            On this page
          </h2>
          <ul className="mt-4 grid gap-2">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="cursor-pointer text-sm text-brand-text no-underline transition-colors duration-200 hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-brand-secondary text-[11px] tracking-[0.16em] text-[#A8B3C7] uppercase">
            Project
          </h2>
          <ul className="mt-4 grid gap-2">
            <li>
              <a
                href={GITHUB_URL}
                className="cursor-pointer text-sm text-brand-text no-underline transition-colors duration-200 hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
              >
                Source on GitHub
              </a>
            </li>
            <li>
              <a
                href={ISSUES_URL}
                className="cursor-pointer text-sm text-brand-text no-underline transition-colors duration-200 hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
              >
                Issues and contact
              </a>
            </li>
            <li>
              <a
                href={`${GITHUB_URL}/blob/main/LICENSE`}
                className="cursor-pointer text-sm text-brand-text no-underline transition-colors duration-200 hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
              >
                MIT License
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/15">
        <p className="mx-auto max-w-6xl px-4 py-5 font-brand-secondary text-xs text-[#A8B3C7] sm:px-6">
          © {year} Astroidal. MIT License. Install with{" "}
          <span className="text-brand-text">npx --yes astroidal</span>.
        </p>
      </div>
    </footer>
  );
}
