import Link from "next/link";
import { MessageCircleWarning, ArrowRight } from "lucide-react";

/**
 * Warns that expiry alerts have nowhere to go.
 *
 * The document alert sweep skips any pilot without a phone number, and at the
 * time of writing 9 of 10 profiles had none — so the feature quietly reached
 * almost nobody. The gap is invisible from the app: the pilot sees their
 * expiry dates listed and reasonably assumes Vector will warn them.
 *
 * Rendered where the pilot is already thinking about expiries, not buried in
 * the profile form, because that is the moment the missing number actually
 * costs something.
 */
export default function WhatsAppMissingNotice({
  /** Anchor to scroll/point at within settings. Omit outside that page. */
  href = "/dashboard/settings",
}: {
  href?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3.5">
      <MessageCircleWarning className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-500" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">
          No vamos a poder avisarte
        </p>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-300 leading-relaxed mt-0.5">
          Los avisos de vencimiento se mandan por WhatsApp y todavía no cargaste
          tu número. Las fechas de acá abajo se siguen calculando, pero{" "}
          <strong>nadie te va a escribir cuando se acerquen</strong>.
        </p>
      </div>

      <Link
        href={href}
        className="shrink-0 self-start sm:self-auto inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-white hover:opacity-70 transition-opacity"
      >
        Cargar número
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
