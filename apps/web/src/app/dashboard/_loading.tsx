export default function Loading() {
  return (
    <div className="w-full h-full min-h-[400px] flex flex-col space-y-8 animate-pulse p-4 md:p-8">
      <div className="space-y-4">
        <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="h-12 w-64 bg-zinc-200 dark:bg-zinc-800 rounded" />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="h-40 bg-zinc-200 dark:bg-zinc-800 rounded-3xl" />
        <div className="h-40 bg-zinc-200 dark:bg-zinc-800 rounded-3xl" />
        <div className="h-40 bg-zinc-200 dark:bg-zinc-800 rounded-3xl" />
      </div>

      <div className="h-64 bg-zinc-200 dark:bg-zinc-800 rounded-3xl" />
    </div>
  );
}
