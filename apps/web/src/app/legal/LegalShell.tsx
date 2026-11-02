import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * Shared chrome for the legal pages.
 *
 * Deliberately plain: no animation, no gradients, no cards. These pages get read
 * when someone is looking for a specific answer, and decoration only gets in the
 * way of finding it.
 */
export default function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  /** Human-readable date. Hardcoded, not `new Date()` — it must reflect when the
   *  text last changed, not when the page was opened. */
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full min-h-screen bg-white dark:bg-black">
      {/* The measure is nested, not combined with `container-wide`: both set
          max-width, and putting them on one element lets the wider one win —
          which gave ~1400px lines of body copy. */}
      <div className="container-wide py-12 md:py-20">
        <div className="max-w-[68ch]">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors mb-10"
        >
          <ChevronLeft className="w-4 h-4" />
          Volver
        </Link>

        <p className="eyebrow">Actualizado el {updated}</p>
        <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight text-zinc-900 dark:text-white mt-3 mb-10 leading-tight">
          {title}
        </h1>

        {/* `space-y-8` only separates the sections; `[&_section_*+*]` is what
            keeps paragraphs inside a section from running together. */}
        <div className="space-y-10 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300 [&_section>*+*]:mt-4 [&_h2]:text-xl [&_h2]:font-display [&_h2]:font-bold [&_h2]:text-zinc-900 [&_h2]:dark:text-white [&_h2]:tracking-tight [&_ul]:space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:text-zinc-900 [&_strong]:dark:text-white [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-zinc-900 dark:hover:[&_a]:text-white">
          {children}
        </div>
        </div>
      </div>
    </div>
  );
}
