import Image, { type StaticImageData } from "next/image";
import Link from "next/link";

import { DimensionIcon } from "@/components/dimension-icons";
import { DIMENSION_GROUPS, DIMENSIONS } from "@/lib/assessment/dimensions";

import betterOrder from "./better-order.png";
import dimensions from "./dimensions.png";
import results from "./results.png";
import shorterWays from "./shorter-ways.png";

// The screenshots are of a demo account (npm run db:seed-demo), taken at 390 by 844 at 2x in the light theme.

const STEPS = [
  {
    title: "Get a topic",
    body: "Choose Interview, Opinion, Everyday life, Storytelling or Work & presentations. A new topic is always one you haven't seen. If you don't like it, ask for another.",
  },
  {
    title: "Record your answer",
    body: "Prepare for as long as you like, then press record. The timer shows when your time is up, but it never stops the recording.",
  },
  {
    title: "Get your feedback",
    body: "Chittle transcribes and scores your answer in a minute or two. Practise the topic again and each score shows its change.",
  },
];

/** The signed-out home page: what Chittle does, how it works, and screens from a sample answer. */
export function Landing() {
  return (
    <div className="landing">
      <section className="hero">
        <h1>
          Get better at speaking, <mark>one answer</mark> at a time.
        </h1>
        <p className="muted">
          Answer a random topic on camera or with audio only. Chittle scores your answer out of 1000 and tells you what
          to change next time.
        </p>
        <SignInButton />
      </section>

      <ol className="steps" aria-label="How it works">
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

      <section className="feature" aria-labelledby="feature-results">
        <div className="feature-text">
          <h2 id="feature-results">See where your score came from</h2>
          <p>
            Your score is the sum of six dimension scores. Open a dimension to see its sub-scores, the feedback on each
            one, and statistics such as your words per minute over time and the filler words you used most.
          </p>
          <p>When you practise a topic again, each score shows its change since your previous attempt.</p>
        </div>
        <div className="phone-shots">
          <PhoneShot
            src={results}
            alt="A results page with the topic, a link to practise it again, an audio player, the coach insights summary and a score of 868 out of 1000."
            caption="Your score and the one change that would help most"
          />
          <PhoneShot
            src={dimensions}
            alt="Six dimension scores, each up on the previous attempt. Shape, Brevity and Conviction are under What you said. Clarity, Fluency and Rhythm are under How you said it."
            caption="What you said and how you said it, compared with your previous attempt"
          />
        </div>
      </section>

      <section className="feature reverse" aria-labelledby="feature-coach">
        <div className="feature-text">
          <h2 id="feature-coach">Coach insights for every answer</h2>
          <p>
            Coach insights reorder your points, suggest a first sentence and give shorter versions of your longest
            sentences.
          </p>
          <p>
            The ideal version is your answer rewritten in the category&apos;s framework. For an interview question, that
            framework is Situation, Task, Action, Result. It keeps your facts and adds none.
          </p>
        </div>
        <div className="phone-shots">
          <PhoneShot
            src={betterOrder}
            alt="Coach insights with the points of the answer in the order spoken, then a better order."
            caption="Your order, then a better order"
          />
          <PhoneShot
            src={shorterWays}
            alt="A suggested opening line, then two long sentences from the answer struck through, each with a shorter version and the words it saves."
            caption="A suggested first sentence, and shorter versions of long sentences"
          />
        </div>
      </section>
      <p className="muted landing-note">These screenshots show a sample answer.</p>

      <section className="landing-scored" aria-labelledby="scored-heading">
        <div className="section-intro">
          <h2 id="scored-heading">What&apos;s scored</h2>
          <p className="muted">
            Your score out of 1000 is the sum of six dimensions. Claude judges three of them from what you said. Chittle
            measures the other three from your recording.
          </p>
        </div>
        {DIMENSION_GROUPS.map(({ title, keys }) => (
          <section key={title} className="dimension-group" aria-label={title}>
            <h3 className="dimension-group-title">{title}</h3>
            <ul className="landing-dimensions">
              {keys.map((key) => (
                <li key={key} className={`dimension-key ${key}`}>
                  <DimensionIcon dimension={key} />
                  <h4>
                    {DIMENSIONS[key].name} <span className="muted">{DIMENSIONS[key].max}</span>
                  </h4>
                  <p>{DIMENSIONS[key].description}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </section>

      <div className="landing-more">
        <section className="card stack" aria-labelledby="progress-heading">
          <h2 id="progress-heading">Your progress over time</h2>
          <p>
            Your dashboard charts your scores over time. Claude compares your recent practices and names what is
            improving. Vote on the areas to improve you want to work on, and later assessments check them.
          </p>
        </section>
        <section className="card stack" aria-labelledby="keys-heading">
          <h2 id="keys-heading">Your keys and recordings</h2>
          <p>
            Assessment uses your own Deepgram and Anthropic API keys. You add them on your account page, and Chittle
            stores them encrypted. Only you can see your recordings. Deleting a recording deletes its file, transcript
            and results.
          </p>
        </section>
      </div>

      <section className="hero landing-cta" aria-labelledby="cta-heading">
        <h2 id="cta-heading">Ready to practise?</h2>
        <SignInButton />
      </section>
    </div>
  );
}

function SignInButton() {
  return (
    <Link href="/login" className="button primary">
      Get started with email
    </Link>
  );
}

function PhoneShot({ src, alt, caption }: { src: StaticImageData; alt: string; caption: string }) {
  return (
    <figure className="phone-shot">
      <Image src={src} alt={alt} sizes="(max-width: 720px) 70vw, 250px" placeholder="blur" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
