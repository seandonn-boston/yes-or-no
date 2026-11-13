import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { LegalPage } from "@/components/Legal";
import { CONTACT_EMAIL, OPERATOR } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms · Belief Map" };

export default function TermsPage() {
  return (
    <>
      <Header />
      <LegalPage title="Terms of use">
        <p>
          These terms cover your use of Belief Map, run by {OPERATOR}. By creating an account you agree to them and to the{" "}
          <Link href="/privacy">privacy policy</Link>.
        </p>

        <h2>Accounts</h2>
        <ul>
          <li>You must be 18 or older.</li>
          <li>One account per person and per phone number. Accounts are personal and can&apos;t be shared, sold or automated.</li>
          <li>Keep your password to yourself. You are responsible for what happens under your account.</li>
        </ul>

        <h2>Voting</h2>
        <ul>
          <li>Each account has one vote per question, which you can change or withdraw once per day.</li>
          <li>
            Don&apos;t vote with bots, scripts or extra accounts, and don&apos;t organise others to flood a question. We
            may discount votes that look coordinated, and close accounts that cast them.
          </li>
          <li>
            Results show what people who use Belief Map say they believe. They are not a scientific poll of any population
            and not a statement of what is true.
          </li>
        </ul>

        <h2>Questions</h2>
        <ul>
          <li>Questions must be answerable true or false, and are posted without your name.</li>
          <li>
            Don&apos;t ask about private individuals, post personal details, or ask questions meant to harass, threaten or
            demean anyone. Don&apos;t post spam or advertising.
          </li>
          <li>
            By asking a question you let us publish it, show it to others, and include it in the results we publish and
            sell. Moderators may hold, edit the subject of, merge or remove any question.
          </li>
        </ul>

        <h2>Membership</h2>
        <ul>
          <li>Membership costs $5 a month, billed monthly by Stripe until you cancel.</li>
          <li>You can cancel at any time from Settings; membership then lasts until the end of the period you paid for.</li>
          <li>We may change the price with at least 30 days&apos; notice before your next billing date.</li>
        </ul>

        <h2>Data and the API</h2>
        <p>
          The results on Belief Map, including through our API, are ours. You may share links and quote individual results
          with credit. Copying results in bulk, by scraping or otherwise, needs an API agreement.
        </p>

        <h2>Ending your account</h2>
        <p>
          You can delete your account at any time from <Link href="/settings">Settings</Link>. We may suspend or close
          accounts that break these terms.
        </p>

        <h2>No warranty</h2>
        <p>
          Belief Map is provided as it is. To the extent the law allows, we are not liable for decisions anyone makes based
          on its results.
        </p>

        <h2>Changes and contact</h2>
        <p>
          We will say on this page, and by notice on the site for important changes, when these terms change. Contact
          {" "}{CONTACT_EMAIL}.
        </p>
      </LegalPage>
    </>
  );
}
