import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy | Intima',
  description:
    'How Intima collects, uses, and protects your information: verification documents, payments, messages, cookies, and your rights.',
}

/**
 * Public Privacy Policy. Written to match what the product actually
 * collects and which providers actually process it (Paystack,
 * NOWPayments, Brevo, Supabase, Vercel). Keep it in step with the
 * product: if a new data flow ships, this page changes too.
 */
function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-semibold tracking-tight text-primary">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-neutral-600">
        {children}
      </div>
    </section>
  )
}

function Points({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-6 md:pb-10">
      <Link
        href="/"
        className="font-display text-xl font-semibold tracking-tight text-charcoal"
      >
        Intima<span className="text-[#C9A84C]">.</span>
      </Link>

      <p className="mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
        Legal
      </p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-charcoal">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-neutral-500">Last updated: 21 October 2026</p>
      <p className="mt-4 text-[15px] leading-relaxed text-neutral-600">
        This policy explains what information Intima collects, how we use
        it, and the choices you have. Intima is operated by INTIMATEHUB
        ENTERPRISE SERVICES (Business Name Registration 7869225), Osogbo,
        Osun State, Nigeria.
      </p>

      <Section title="What we collect">
        <Points
          items={[
            'Account information: your name, email address, phone number, account type, and the date you joined. Your password is stored in protected, encrypted form by our sign-in system. We never see it in plain text.',
            'Profile content: photos, videos, bio, city, services, rates, and anything else you choose to put on your profile.',
            'Verification documents: the identity document and any supporting documents you upload so we can verify you.',
            'Messages and media: the messages, photos, and videos shared inside a paid connection, and your gift, subscription, and paid media history.',
            'Payment records: what you bought, the amount, and the payment reference. Card payments are processed by Paystack: your card details go to Paystack, never to us, and we never store card numbers. Crypto payments are processed by NOWPayments, and we receive the payment reference and its status.',
            'Coins and cashouts: your coin balance and coin history, cashout requests, and the bank details a companion gives us for a payout.',
            'Device and notification data: if you turn on notifications, we store a push token for your device so we can deliver them.',
            'Usage data: pages you view inside the app, basic device and browser information, and error logs that help us find and fix problems.',
            'Reports and support: anything you send us in a report, a dispute, or a message to our team.',
          ]}
        />
      </Section>

      <Section title="How we use it">
        <Points
          items={[
            'To run the service: accounts, profiles, connections, messages, calls, and live streams.',
            'To verify identity and keep the platform adults only.',
            'To process payments, coin purchases, gifts, subscriptions, boosts, and cashouts.',
            'To send service notifications and emails, for example a new connection, a dispute update, a cashout decision, or a companion you follow going live.',
            'To prevent fraud, enforce our Terms of Service, and respond to reports.',
            'To understand how the app is used, so we can improve it.',
            'To meet our legal and tax obligations.',
          ]}
        />
      </Section>

      <Section title="Verification documents">
        <p>
          Verification documents are stored in private storage. They are
          never public, never shown on your profile, and only the small
          team that reviews verification can open them.
        </p>
        <p>
          We use them for one purpose: confirming that the person behind an
          account is a real adult whose details match the account. We do
          not sell verification documents, and we do not share them with
          advertisers or other users.
        </p>
      </Section>

      <Section title="What we never sell">
        <p>
          We do not sell your personal information. We do not sell your
          documents, your messages, your contact details, or your payment
          history, to anyone, for any reason.
        </p>
      </Section>

      <Section title="Who we share information with">
        <Points
          items={[
            'Payment processors: Paystack handles card and bank transfer payments, and NOWPayments handles crypto payments. Each receives what it needs to process your payment.',
            'Email: Brevo sends our transactional emails, such as account confirmations and password reset links.',
            'Hosting and storage: the app runs on Vercel, and our database and file storage run on Supabase. These providers process information on our instructions so the service can work.',
            'Other users: your public profile is visible to other users, including your display name, photos, city, services, and rates. Your email address, phone number, verification documents, and exact location are never public. We show a general area, never an exact address.',
            'Safety and the law: we may share information where the law requires it, or where it is needed to investigate fraud, trafficking, or a threat to someone\u2019s safety.',
          ]}
        />
      </Section>

      <Section title="Cookies and device storage">
        <p>
          When you confirm at the age gate that you are an adult, we store
          a cookie called intima_age_ok that remembers your confirmation
          for one year, so you are not asked on every visit. Sign-in
          cookies keep you logged in securely.
        </p>
        <p>
          The app also stores small preferences on your device, such as
          whether you snoozed the install or notification prompts, your
          favourite gifts, and your preferred live stream quality.
        </p>
        <p>
          You can clear cookies and site data in your browser at any time.
          If you clear the age cookie, we will ask you to confirm your age
          again.
        </p>
      </Section>

      <Section title="Push notifications">
        <p>
          We only send push notifications after you turn them on. They
          cover new messages, connection updates, gifts, and companions
          you follow going live. You can turn notifications off at any time
          in your browser or device settings, or from the Notifications
          page inside Intima.
        </p>
      </Section>

      <Section title="How long we keep information">
        <p>
          We keep your information while your account is active. We keep
          verification documents while your account is active and for a
          reasonable period after it closes, so we can stop banned users
          from returning under a new account and meet our safety and legal
          duties.
        </p>
        <p>
          Payment, coin, and cashout records are kept for as long as tax
          and accounting law requires. When information is no longer
          needed, we delete it or remove the parts that identify you.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Under the Nigeria Data Protection Act 2023, you can ask to see
          the personal information we hold about you, ask us to correct
          anything that is wrong, or ask us to delete your account and
          information.
        </p>
        <p>
          To make a request, email us at{' '}
          <a
            href="mailto:intima0069@gmail.com"
            className="font-medium text-primary hover:underline"
          >
            intima0069@gmail.com
          </a>
          . We will respond within a reasonable time. Some records, such
          as payment records the law requires us to keep, may need to be
          kept even after a deletion request.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Information travels between your device and Intima over encrypted
          connections. Verification documents and private media are kept in
          private storage with restricted access, and access inside our
          team is limited to the people who need it to do their work.
        </p>
        <p>
          No online service can promise perfect security. If we learn of a
          breach that affects your information, we will inform you and the
          regulator as the law requires.
        </p>
      </Section>

      <Section title="Adults only">
        <p>
          Intima is for adults only. We do not knowingly collect
          information from anyone under 18. If you believe a minor has an
          account, report it in the app or email us, and we will remove
          it.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          We may update this policy from time to time. When we do, we will
          post the new version on this page and update the date at the
          top.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          INTIMATEHUB ENTERPRISE SERVICES
          <br />
          Business Name Registration 7869225
          <br />
          Osogbo, Osun State, Nigeria
          <br />
          Email:{' '}
          <a
            href="mailto:intima0069@gmail.com"
            className="font-medium text-primary hover:underline"
          >
            intima0069@gmail.com
          </a>
        </p>
        <p className="pt-4 text-sm text-neutral-500">
          Read also our{' '}
          <Link href="/terms" className="font-medium text-primary hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </Section>
    </div>
  )
}
