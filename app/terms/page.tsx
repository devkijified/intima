import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service | Intima',
  description:
    'The terms that govern your use of Intima: who can join, the connection fee, coins, conduct rules, and your rights.',
}

/**
 * Public Terms of Service. Plain language on purpose: these are the
 * real rules of the platform, written so a first-time user can
 * understand them without a lawyer. Keep the copy in step with how
 * the product actually works (fee rules, coins, cashouts, hiding).
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

export default function TermsPage() {
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
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-neutral-500">Last updated: 21 October 2026</p>
      <p className="mt-4 text-[15px] leading-relaxed text-neutral-600">
        These terms are the agreement between you and INTIMATEHUB ENTERPRISE
        SERVICES (Business Name Registration 7869225), Osogbo, Osun State,
        Nigeria, the operator of Intima. By creating an account or using
        Intima, you agree to these terms. If you do not agree, do not use
        Intima.
      </p>

      <Section title="Who can use Intima">
        <p>
          You must be at least 18 years old, and at least the age of majority
          where you live, to use Intima. There are no exceptions. You confirm
          your age at the age gate before you enter, and again when you join.
        </p>
        <p>
          If we learn that an account belongs to someone under 18, we remove
          the account. If you believe a minor is on the platform, report it
          immediately.
        </p>
        <p>
          You may hold one account, and the details you give us must be true
          and current. You are responsible for everything that happens on
          your account, so keep your password private.
        </p>
      </Section>

      <Section title="What Intima is">
        <p>
          Intima is a marketplace and a connector. We provide the platform
          where verified companions and clients can find each other, talk,
          and make their own arrangements.
        </p>
        <p>
          Intima is not an agency and not an employer. Companions are
          independent. We do not set their rates, choose their clients, or
          direct their work.
        </p>
        <p>
          Intima is not an escrow service. We never hold money that belongs
          to a companion or a client for a meeting. The payments you make to
          Intima itself are the connection fee described below, and any coins
          you choose to buy.
        </p>
        <p>
          A verified badge means the user passed our identity document
          check. It does not mean we guarantee anyone&apos;s character,
          safety, or behaviour.
        </p>
      </Section>

      <Section title="Accounts and verification">
        <p>
          Clients and companions may be asked to verify their identity with
          a government issued document. Some features, such as premium live
          streams and contests, are open only to verified users.
        </p>
        <p>
          Your verification documents are stored privately and used only for
          verification. Our Privacy Policy explains this in full.
        </p>
        <p>
          Do not create an account for someone else, and do not impersonate
          another person. If you are a companion, your profile photos must
          be photos of you.
        </p>
      </Section>

      <Section title="The connection fee and disputes">
        <p>
          To open a conversation with a companion, a client pays a flat
          connection fee. The fee is currently ₦5,000. It is set by the
          platform and can change, and the amount shown at checkout is the
          amount that applies to that payment.
        </p>
        <p>
          The fee is paid to Intima and it is Intima&apos;s revenue. It buys
          the introduction, plus the use of our messaging, calling, and
          safety tools for that connection. It is not a deposit, and it does
          not pay for any part of the companion&apos;s own rate.
        </p>
        <p>
          Paying the fee opens the connection so both sides can talk and
          decide. It does not guarantee a meeting.
        </p>
        <p>
          If something goes wrong, either side can open a dispute within 24
          hours of paying the fee. The dispute covers the connection fee
          only. Where a dispute is resolved in the client&apos;s favour,
          85% of the fee is refunded through the original payment method
          and 15% is kept for payment processing. The
          companion&apos;s rate is never part of a dispute on Intima,
          because that money never passes through us.
        </p>
      </Section>

      <Section title="Request board">
        <p>
          You can post a request describing what you want, and verified
          companions in your city can respond. Posting a request means
          paying the connection fee up front. The request stays open for
          48 hours, and if you pick a companion, a normal connection
          opens at the rate you both agreed.
        </p>
        <p>
          If nobody fills your request within 48 hours, or you cancel it
          while it is still open, 85% of the fee is refunded through the
          original payment method. The remaining 15% is kept for payment
          processing.
        </p>
      </Section>

      <Section title="Companion rates">
        <p>
          Companions set their own rates. The rate for a meeting is agreed
          between the client and the companion inside the connection. A
          companion can mark their rates as negotiable, and a client can
          propose a rate. A proposal is not final until both sides accept
          it.
        </p>
        <p>
          The rate is paid directly between the client and the companion,
          outside Intima. We never collect it, hold it, or take a share of
          it.
        </p>
        <p>
          Because the rate never passes through us, Intima cannot refund
          it, enforce it, or settle arguments about it. Agree the details
          clearly before you meet.
        </p>
      </Section>

      <Section title="Coins and cashouts">
        <p>
          Coins are Intima&apos;s virtual currency. One coin equals ₦10 at
          the time you buy. You can buy coins by card or bank transfer
          through Paystack, or with crypto through NOWPayments.
        </p>
        <p>
          Coins pay for gifts on live streams, Fans Only subscriptions,
          paid media, and profile boosts. When a companion earns coins from
          gifts, paid media, or subscriptions, Intima keeps 50% as the
          platform share and the companion receives the rest.
        </p>
        <p>
          Referral rewards are paid in coins: 100 coins when a client you
          referred joins, and 500 coins when a companion you referred
          joins. Reward coins follow the same rules as bought coins.
        </p>
        <p>
          Coins have no value outside Intima. They are not money, they
          cannot be transferred to another account or another person, and
          they cannot be exchanged for cash except through companion
          cashout below.
        </p>
        <p>
          Companions can cash out their coin earnings to naira. The minimum
          cashout is 500 coins. Every cashout is reviewed and approved by
          our team, then paid manually to the bank account the companion
          gives us. We may refuse a cashout where the coins came from fraud
          or a breach of these terms.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>The following are not allowed on Intima, anywhere, at any time:</p>
        <Points
          items={[
            'Anyone under 18 on the platform, and any sexual content involving a minor in any form.',
            'Trafficking, coercion, or arranging meetings for anyone who is not acting freely and for themselves.',
            'Sharing phone numbers, social media handles, or other contact details in public places on Intima, such as bios, photos, stories, broadcasts, and live chat, in order to move a deal off the platform. Inside a paid connection, the two of you can share what you need in order to meet.',
            'Fraud of any kind: fake profiles, stolen payment methods, chargeback abuse, fake gifts, coin schemes, or farming referral rewards.',
            'Harassment, threats, blackmail, or sharing recordings, screenshots, or media from calls, streams, or chats outside Intima without the consent of everyone involved.',
            'Spam, scams, or advertising unrelated services.',
            'Trying to break, scrape, overload, or reverse engineer the platform.',
            'Anything that is illegal under the laws of Nigeria.',
          ]}
        />
      </Section>

      <Section title="Content rules">
        <p>
          You keep ownership of the photos, videos, and text you post. By
          posting them, you give Intima a licence to store and display that
          content so the service can work, for as long as the content stays
          on the platform.
        </p>
        <p>
          Only post content of yourself, or content you have the right to
          post, with the consent of everyone in it. Never post content
          involving anyone under 18, or content recorded or shared without
          consent.
        </p>
        <p>
          We review reported content, and we can remove any content that
          breaks these terms.
        </p>
      </Section>

      <Section title="Live streaming rules">
        <p>
          Everyone who appears on a live stream must be 18 or older and
          taking part voluntarily. Hosts are responsible for their own
          streams.
        </p>
        <p>
          The conduct and content rules above apply while live. Do not
          share contact details in live chat, stream titles, or on camera.
          Viewers can send gifts during a stream using coins, and the coin
          rules above apply to every gift.
        </p>
        <p>
          We can end a stream, restrict live features, or close an account
          that breaks these rules.
        </p>
      </Section>

      <Section title="Termination and account hiding">
        <p>
          You can stop using Intima at any time, and you can ask us to close
          your account by contacting us.
        </p>
        <p>
          We can warn, hide, suspend, or close any account that breaks these
          terms or puts other users at risk. An account that receives three
          or more open reports within 30 days is hidden automatically from
          search, browse, and the map while we review it. Hiding is a
          safety step, not a final decision. If your account is hidden and
          you believe it was a mistake, contact us.
        </p>
        <p>
          If we close your account because you broke these terms, any
          unused coin balance in the account is forfeited.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          Intima provides the platform, not the meetings. What users agree
          between themselves, and what happens when they meet, is between
          those users. We do our part with identity checks, reporting
          tools, and the fee dispute process, but we cannot guarantee the
          conduct of any user. Meet in safe places, tell someone you trust
          where you are going, and use the report tools when something is
          wrong.
        </p>
        <p>
          The service is provided as it is. To the fullest extent Nigerian
          law allows, Intima is not liable for losses arising from the
          conduct of users, from companion rates, from missed or cancelled
          meetings, or from events outside our control. Nothing in these
          terms removes liability that Nigerian law says cannot be
          removed. Where Intima is liable, our liability is limited to the
          amount you paid Intima for the service connected to the claim.
        </p>
      </Section>

      <Section title="Governing law">
        <p>
          These terms are governed by the laws of the Federal Republic of
          Nigeria. We would rather settle any disagreement directly, so
          contact us first. Disputes that we cannot settle together will be
          decided by the courts of Nigeria.
        </p>
      </Section>

      <Section title="Changes to these terms">
        <p>
          We may update these terms from time to time. When we make a
          material change, we will post the new version on this page and
          update the date at the top. Continuing to use Intima after a
          change means you accept the new terms.
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
          <Link href="/privacy" className="font-medium text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>
    </div>
  )
}
