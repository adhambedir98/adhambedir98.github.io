import { JoinForm } from "@/components/JoinForm";
import { Wordmark } from "@/components/Wordmark";

export const metadata = {
  title: "Volunteer — Davos 2027 Harvard Reception",
};

export default function JoinPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-xl px-5 pb-20 pt-8 sm:pt-12">
      <header className="mb-8">
        <Wordmark subtitle="Volunteers" />
        <h1 className="mt-6 text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-3xl">
          Help bring the Harvard Reception to Davos 2027
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          We&apos;re assembling a team for the Harvard Reception at the World
          Economic Forum. Tell us where you&apos;d like to help and we&apos;ll be
          in touch. Takes under a minute.
        </p>
      </header>

      <JoinForm />
    </main>
  );
}
