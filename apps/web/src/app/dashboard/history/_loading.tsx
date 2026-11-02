export default function Loading() {
  return (
    <div className="w-full h-full min-h-[400px] flex flex-col space-y-8 animate-pulse p-4 md:p-8">
      <div className="space-y-4">
        <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="h-12 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
      </div>

      <div className="h-12 w-full max-w-md bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />

      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 w-full bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
