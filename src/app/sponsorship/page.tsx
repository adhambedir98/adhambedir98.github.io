import { SponsorshipTracker } from "@/components/SponsorshipTracker";
import { Wordmark } from "@/components/Wordmark";

export const metadata = {
  title: "Sponsorship Outreach — Davos 2027 Harvard Reception",
};

export default function SponsorshipPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-5 pb-20 pt-8 sm:pt-12">
      <header className="mb-8">
        <Wordmark subtitle="Sponsorship Outreach" />
        <h1 className="mt-6 text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-3xl">
          Log your sponsorship outreach
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Every person you contact about sponsoring the Harvard Reception goes
          here — so the team can coordinate centrally and no prospect gets
          double-contacted. Your entries save to the shared tracker and stay
          visible to you below.
        </p>
      </header>

      <SponsorshipTracker />
    </main>
  );
}
