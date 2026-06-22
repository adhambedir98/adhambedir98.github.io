export function Wordmark({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="h-4 w-[3px] shrink-0 rounded-full bg-crimson"
      />
      <span className="text-sm font-semibold tracking-tight text-ink">
        Davos 2027
      </span>
      {subtitle && (
        <>
          <span aria-hidden className="h-3.5 w-px shrink-0 bg-border" />
          <span className="text-sm text-muted">{subtitle}</span>
        </>
      )}
    </div>
  );
}
