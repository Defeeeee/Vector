import Link from "next/link";
import {
  Bell,
  BookOpen,
  CalendarDays,
  Camera,
  ChevronRight,
  Clock,
  CloudOff,
  Compass,
  KeyRound,
  MessageCircle,
  PartyPopper,
  PieChart,
  Plane,
  Search,
  Share2,
  type LucideIcon,
  Wallet,
} from "lucide-react";
import type { Novedad, NombreIcono } from "@/lib/changelog";

/**
 * Una novedad, dibujada. La usan la tarjeta del dashboard y la pantalla de novedades,
 * así que las dos se ven igual sin que nadie tenga que acordarse.
 *
 * **Acá vive el mapa de íconos**, y es el único lugar donde `changelog.ts` toca React.
 * El tipo `Record<NombreIcono, LucideIcon>` no es decorativo: si alguien agrega un
 * nombre nuevo al changelog y se olvida del ícono, **no compila**. Es una garantía más
 * fuerte que un test, y gratis.
 */
const ICONOS: Record<NombreIcono, LucideIcon> = {
  brujula: Compass,
  avion: Plane,
  nube: CloudOff,
  llave: KeyRound,
  billetera: Wallet,
  calendario: CalendarDays,
  compartir: Share2,
  reloj: Clock,
  lupa: Search,
  grafico: PieChart,
  camara: Camera,
  conversacion: MessageCircle,
  libro: BookOpen,
  campana: Bell,
  festejo: PartyPopper,
};

export default function NovedadCard({ novedad }: { novedad: Novedad }) {
  const Icono = ICONOS[novedad.icono];

  return (
    <div className="rounded-2xl bg-white dark:bg-white/[0.04] border border-zinc-200/70 dark:border-white/10 p-4 space-y-2">
      <div className="flex items-center gap-2 text-zinc-900 dark:text-white text-xs font-bold">
        <Icono className="w-4 h-4 text-aviation-blue shrink-0" />
        <span>{novedad.titulo}</span>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{novedad.texto}</p>

      {/* `href` y `cta` van siempre juntos — hay un test que lo obliga, porque un link
          sin texto no se puede tocar y un texto sin link no lleva a ningún lado. */}
      {novedad.href && novedad.cta && (
        <Link
          href={novedad.href}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-aviation-blue hover:underline pt-1"
        >
          {novedad.cta} <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}
