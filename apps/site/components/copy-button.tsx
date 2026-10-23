import { Check, Copy } from "lucide-react";
import { useState } from "react";

interface CopyButtonProps {
  value: string;
  label: string;
  copiedLabel?: string;
  tone?: "glow" | "quiet";
}

export function CopyButton({
  value,
  label,
  copiedLabel = "Copied",
  tone = "glow",
}: CopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 2000);
    } catch {
      setIsCopied(false);
    }
  }

  const toneClass =
    tone === "glow"
      ? "bg-brand-primary text-brand-bg shadow-[0_0_28px_rgba(0,242,254,0.35)] hover:bg-[#7af8ff]"
      : "border border-white/15 bg-white/5 text-brand-text hover:border-brand-primary/70";

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-live="polite"
      className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary ${toneClass}`}
    >
      {isCopied ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
      {isCopied ? copiedLabel : label}
    </button>
  );
}
