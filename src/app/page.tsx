import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

const STEPS = [
  { title: "Get a topic", body: "Pick a category and we'll give you something to talk about. Not feeling it? Roll again." },
  { title: "Record yourself", body: "Take your prep time, then speak to your camera for as long as you chose." },
  { title: "Watch and rate", body: "Play it back, score your clarity, confidence and more, and see how you improve." },
];

export default async function Home() {
  if (await getCurrentUser()) redirect("/practice");

  return (
    <>
      <section className="hero">
        <h1>
          Get better at speaking, <mark>one topic</mark> at a time.
        </h1>
        <p className="muted">
          Pick a category, get a random topic, and record yourself talking about it on video. Watch it back, rate
          yourself, and see how you improve.
        </p>
        <Link href="/login" className="button primary">
          Sign in with email
        </Link>
        <svg className="hero-art" viewBox="0 0 360 170" aria-hidden="true">
          <path d="M20 20a16 16 0 0 1 16-16h128a16 16 0 0 1 16 16v68a16 16 0 0 1-16 16H80l-36 28v-28H36a16 16 0 0 1-16-16Z" fill="#9e82fa" />
          <rect x="44" y="34" width="104" height="10" rx="5" fill="#2b0b7d" />
          <rect x="44" y="56" width="72" height="10" rx="5" fill="#2b0b7d" opacity="0.45" />
          <path d="M340 62a16 16 0 0 0-16-16H196a16 16 0 0 0-16 16v60a16 16 0 0 0 16 16h84l36 28v-28h8a16 16 0 0 0 16-16Z" fill="#f7a918" />
          <rect x="204" y="74" width="96" height="10" rx="5" fill="#2b0b7d" />
          <rect x="204" y="96" width="64" height="10" rx="5" fill="#2b0b7d" opacity="0.45" />
        </svg>
      </section>

      <ol className="steps">
        {STEPS.map(({ title, body }, index) => (
          <li key={title}>
            <span className="step-number" aria-hidden="true">
              {index + 1}
            </span>
            <h2>{title}</h2>
            <p>{body}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
