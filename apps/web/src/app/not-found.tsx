import Link from "next/link";
import { Compass } from "lucide-react";

/**
 * 404. La más barata de las cuatro fronteras y hasta hoy tampoco existía.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white flex flex-col items-center justify-center text-center px-6 space-y-6">
      <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-white/10 flex items-center justify-center">
        <Compass className="w-6 h-6 text-zinc-400 dark:text-zinc-500" />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-2xl font-display font-bold tracking-tight">Esta página no existe</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          El link puede estar viejo o mal escrito.
        </p>
      </div>
      <Link href="/dashboard" className="px-6 py-3 rounded-full bg-aviation-blue text-white text-sm font-bold">
        Ir al inicio
      </Link>
    </div>
  );
}
