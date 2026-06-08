export function Wordmark({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-block h-5 w-1 rounded-full bg-crimson"
        />
        <span className="text-sm font-semibold tracking-tight text-ink">
          Davos 2027
        </span>
      </div>
      <span className="text-sm text-muted">{subtitle ?? "Harvard Reception"}</span>
    </div>
  );
}
