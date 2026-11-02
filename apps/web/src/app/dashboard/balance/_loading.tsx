export default function Loading() {
  return (
    <div className="w-full h-full min-h-[400px] flex flex-col space-y-8 animate-pulse p-4 md:p-8">
      <div className="space-y-4">
        <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="h-12 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
      </div>

      <div className="h-12 w-full max-w-sm bg-zinc-200 dark:bg-zinc-800 rounded-full" />

      <div className="h-96 w-full max-w-lg bg-zinc-200 dark:bg-zinc-800 rounded-[2.5rem]" />
    </div>
  );
}
