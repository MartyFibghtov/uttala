import type { ReactNode } from "react";
import { SITE } from "@/lib/site";

const UPDATED = "10 November 2026";

function Doc({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 md:px-8 md:py-16 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1.5 [&_p]:mt-3 [&_p]:text-muted-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-muted-foreground">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm">Last updated {UPDATED}</p>
      {children}
    </article>
  );
}

const Contact = () => <a href={`mailto:${SITE.contact}`} className="underline underline-offset-4">{SITE.contact}</a>;

export function Terms() {
  return (
    <Doc title="Terms of Service">
      <p>
        These terms are an agreement between you and {SITE.company} (“we”) for your use of {SITE.name}. By creating an
        account you accept them.
      </p>
      <h2>The service</h2>
      <p>
        {SITE.name} analyses recordings of your speech and gives automated feedback on pronunciation. The feedback is
        produced by software, can be wrong, and is a practice aid. It is not a language certification, a medical or
        speech-therapy service, or a guarantee of any result.
      </p>
      <h2>Your account</h2>
      <p>
        You must be at least 16 years old. Keep your password private; you are responsible for activity on your
        account. One account is for one person.
      </p>
      <h2>Plans and payment</h2>
      <ul>
        <li>The free plan costs nothing and has daily limits shown on the pricing page.</li>
        <li>
          Paid plans are subscriptions billed in advance, monthly or yearly, through Stripe. They renew automatically
          until you cancel.
        </li>
        <li>
          A free trial, where offered, converts to a paid subscription at the end of the trial unless you cancel
          before then.
        </li>
        <li>
          You can cancel at any time from your account page. Cancellation takes effect at the end of the period you
          have paid for, and you keep access until then.
        </li>
        <li>
          Where the law gives you a right to withdraw or to a refund, you keep that right. Otherwise payments are not
          refunded for partly used periods.
        </li>
        <li>We may change prices for future periods and will tell you by email at least 30 days beforehand.</li>
      </ul>
      <h2>Acceptable use</h2>
      <p>
        Daily limits exist to keep the service reliable. Do not try to get around them, resell access, use automated
        tools to send requests, or upload recordings of other people without their permission.
      </p>
      <h2>Your content</h2>
      <p>
        The texts you enter and the recordings you make remain yours. You allow us to process them to provide the
        service, as described in the Privacy Policy.
      </p>
      <h2>Availability and liability</h2>
      <p>
        We work to keep {SITE.name} available but do not promise uninterrupted service. To the extent the law allows,
        our total liability to you for any claim is limited to the amount you paid us in the twelve months before the
        claim. Nothing in these terms limits liability that cannot be limited by law.
      </p>
      <h2>Ending the agreement</h2>
      <p>
        You can delete your account at any time from the account page. We may suspend or close accounts that break
        these terms or put the service at risk.
      </p>
      <h2>Changes and contact</h2>
      <p>
        If we change these terms in a way that matters, we will tell you by email before the change takes effect.
        Questions: <Contact />.
      </p>
    </Doc>
  );
}

export function Privacy() {
  return (
    <Doc title="Privacy Policy">
      <p>
        {SITE.company} operates {SITE.name} and is responsible for the personal data described here. Contact:{" "}
        <Contact />.
      </p>
      <h2>What we collect and why</h2>
      <ul>
        <li>
          <strong>Account details</strong>: your name, email address and a hashed password, to sign you in and to
          contact you about your account.
        </li>
        <li>
          <strong>Voice recordings</strong>: when you press Record, the audio is sent to our speech-analysis
          providers, scored, and then discarded. We do not keep your recordings and do not use them to identify you.
        </li>
        <li>
          <strong>Practice data</strong>: the texts you practise and save, your scores, your daily activity (points,
          streak, goal and course progress), and the words and sounds you are drilling. If you join the weekly league, other
          learners see the display name you chose and your points for the week. If you join a class, its teacher and
          members see your account name and weekly points, and the teacher also sees your number of recordings, average
          score and last active day. Both are optional and can be left at any time. We keep these so that your progress follows you between devices.
        </li>
        <li>
          <strong>Usage counts</strong>: how many recordings you analyse each day, to apply plan limits.
        </li>
        <li>
          <strong>Billing data</strong>: if you subscribe, Stripe processes your payment details. We receive your plan,
          its status and renewal date, never your full card number.
        </li>
      </ul>
      <p>
        We process this data to perform our contract with you, and, for security and abuse prevention, on the basis of
        our legitimate interests.
      </p>
      <h2>Who processes data for us</h2>
      <ul>
        <li>ElevenLabs: speech recognition, alignment and reference voices.</li>
        <li>Microsoft Azure: sound-by-sound scoring, where that feature is active.</li>
        <li>Stripe: payments and invoices.</li>
        <li>Our hosting, database and email providers.</li>
      </ul>
      <p>
        These providers may process data outside your country, including in the United States, under contractual
        safeguards. We do not sell your data or use it for advertising.
      </p>
      <h2>Cookies</h2>
      <p>
        We set only the cookies needed to keep you signed in. Your browser also stores your practice data locally so
        the app works quickly. We use no advertising or cross-site tracking cookies.
      </p>
      <h2>How long we keep it</h2>
      <p>
        Account and practice data are kept until you delete your account. Billing records are kept for as long as tax
        law requires. Recordings are not kept.
      </p>
      <h2>Your rights</h2>
      <p>
        You can download your data and delete your account from the account page. Depending on where you live, you
        also have the right to access, correct, restrict or object to our use of your data, and to complain to your
        data-protection authority. Write to <Contact /> and we will answer within 30 days.
      </p>
      <h2>Children</h2>
      <p>{SITE.name} is not intended for children under 16.</p>
    </Doc>
  );
}
