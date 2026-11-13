import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { LegalPage } from "@/components/Legal";
import { CONTACT_EMAIL, OPERATOR } from "@/lib/legal";
import { MIN_GROUP_SIZE } from "@/lib/limits";

export const metadata: Metadata = { title: "Privacy policy · Belief Map" };

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <LegalPage title="Privacy policy">
        <p>
          Belief Map records how people answer true-or-false questions and publishes what the crowd believes. This page
          explains what we keep about you, why, and what you can do about it. It is run by {OPERATOR}.
        </p>

        <h2>What we keep</h2>
        <ul>
          <li><strong>Your username and password.</strong> The password is stored only as a salted hash.</li>
          <li>
            <strong>Your phone number, as a one-way hash.</strong> We use it to allow one account per number. The number
            itself is held for at most 15 minutes while we confirm it, then deleted.
          </li>
          <li>
            <strong>Your votes and every change to them, with the time.</strong> We also note whether you saw the results
            before voting and how you reached the question (for example the home feed or a shared link).
          </li>
          <li><strong>Questions you ask and reports you file.</strong> Questions are always shown without your name.</li>
          <li>
            <strong>Membership status,</strong> if you pay. Card details are handled by Stripe and never reach us; we keep
            only the Stripe customer reference.
          </li>
          <li><strong>When you were last active,</strong> to the nearest hour.</li>
        </ul>

        <h2>Public and private votes</h2>
        <p>
          Once following is available, people who follow you will see which questions you voted on publicly, but not
          which way you voted. A private vote is never shown with your name to anyone. It is still linked to your account inside our database, because
          that is what lets you change or withdraw it later, and it counts toward results like any other vote.
        </p>

        <h2>What we publish and sell</h2>
        <p>
          We publish and sell results in aggregate: percentages, counts, how often people change their minds, and how
          results move over time. We never publish or sell anything that names you, includes your phone number, or lets
          someone look up how you voted. Breakdowns of fewer than {MIN_GROUP_SIZE} people are withheld so that small
          groups can&apos;t be picked out.
        </p>

        <h2>Who else handles your information</h2>
        <ul>
          <li><strong>Twilio</strong> sends the code that confirms your phone number.</li>
          <li><strong>Stripe</strong> processes membership payments.</li>
          <li><strong>Vercel and Neon</strong> host the site and its database.</li>
          <li>
            <strong>Anthropic</strong> may check the text of new questions for repeats and harmful content. It receives the
            question, never who asked it.
          </li>
        </ul>

        <h2>Cookies</h2>
        <p>
          We use one cookie to keep you signed in and one to remember which layout you prefer. There are no advertising or
          tracking cookies.
        </p>

        <h2>Your choices</h2>
        <ul>
          <li>Change or withdraw any vote, once per question per day.</li>
          <li>Make a public vote private, or a private vote public.</li>
          <li>
            Download everything we hold about your account from <Link href="/settings">Settings</Link>.
          </li>
          <li>
            Delete your account from <Link href="/settings">Settings</Link>. Your current votes are withdrawn from every
            result immediately. The dated record of past votes is kept for the historical results, attached to a new
            anonymous record with no username, phone number, password or payment details, so it can no longer be
            connected to you.
          </li>
        </ul>

        <h2>Age</h2>
        <p>Belief Map is for adults. You must be 18 or older to create an account.</p>

        <h2>Contact</h2>
        <p>Questions about privacy go to {CONTACT_EMAIL}.</p>
      </LegalPage>
    </>
  );
}
