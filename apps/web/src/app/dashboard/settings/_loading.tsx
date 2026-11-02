export default function Loading() {
  return (
    <div className="w-full h-full min-h-[400px] flex flex-col space-y-12 animate-pulse p-4 md:p-8">
      <div className="space-y-4">
        <div className="h-16 w-64 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="h-4 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
      </div>

      <div className="space-y-6">
        <div className="h-8 w-40 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="h-80 w-full bg-zinc-200 dark:bg-zinc-800 rounded-[2.5rem]" />
      </div>

      <div className="space-y-6">
        <div className="h-8 w-40 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="h-40 w-full bg-zinc-200 dark:bg-zinc-800 rounded-[2.5rem]" />
      </div>
    </div>
  );
}
