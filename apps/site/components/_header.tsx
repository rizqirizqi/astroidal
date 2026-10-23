import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { GITHUB_URL, NAV_ITEMS } from "./content";
import { Mark } from "./mark";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  function handleToggleMenu() {
    setIsMenuOpen((open) => !open);
  }

  function handleCloseMenu() {
    setIsMenuOpen(false);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMenuOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-white/15 bg-brand-bg/80 font-brand-primary backdrop-blur-md">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-brand-primary focus:px-4 focus:py-2 focus:text-brand-bg"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a
          href="#content"
          aria-label="Astroidal, back to top"
          className="flex min-h-11 items-center gap-2.5 text-brand-text no-underline"
        >
          <Mark className="size-8 text-brand-primary drop-shadow-[0_0_10px_rgba(0,242,254,0.45)]" />
          <span className="text-lg font-medium tracking-[-0.04em]">
            Astroidal
          </span>
        </a>

        <nav
          className="hidden items-center gap-6 lg:flex"
          aria-label="On this page"
        >
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="cursor-pointer text-sm text-[#A8B3C7] no-underline transition-colors duration-200 hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={GITHUB_URL}
            className="hidden min-h-11 cursor-pointer items-center rounded-full px-3 text-sm text-[#A8B3C7] no-underline transition-colors duration-200 hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary sm:inline-flex"
          >
            Source
          </a>
          <a
            href="#setup"
            className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-brand-primary px-4 text-sm font-medium text-brand-bg no-underline shadow-[0_0_24px_rgba(0,242,254,0.35)] transition-colors duration-200 hover:bg-[#7af8ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            Run a review
          </a>
          <button
            type="button"
            onClick={handleToggleMenu}
            aria-expanded={isMenuOpen}
            aria-controls="site-menu"
            className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-white/15 text-brand-text transition-colors duration-200 hover:border-brand-primary/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary lg:hidden"
          >
            {isMenuOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
            <span className="sr-only">
              {isMenuOpen ? "Close menu" : "Open menu"}
            </span>
          </button>
        </div>
      </div>

      {isMenuOpen ? (
        <nav
          id="site-menu"
          aria-label="On this page"
          className="border-t border-white/15 bg-[#0C111C] lg:hidden"
        >
          <ul className="mx-auto flex max-w-6xl flex-col px-4 py-2 sm:px-6">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={handleCloseMenu}
                  className="flex min-h-11 cursor-pointer items-center text-brand-text no-underline"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href={GITHUB_URL}
                className="flex min-h-11 cursor-pointer items-center text-[#A8B3C7] no-underline"
              >
                Source
              </a>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
