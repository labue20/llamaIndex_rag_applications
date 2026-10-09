/**
 * Legal Pages
 * Privacy Policy (/privacy) and Terms of Service (/terms). Numbers such as the
 * trial length come from the server (GET /plans), so the text stays accurate.
 */

import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../../shared/components/Icon';
import LogoMark from '../../../shared/components/LogoMark';
import { usePlanInfo } from '../../auth/hooks/usePlanInfo';
import '../styles/legal.scss';

export const LAST_UPDATED = 'October 7, 2026';
const SERVICE = 'Dokkiman';

const Contact = ({ supportEmail }) =>
  supportEmail ? (
    <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
  ) : (
    <>the support address shown in the app</>
  );

const PrivacyPolicy = ({ plan }) => (
  <>
    <section>
      <h2>The short version</h2>
      <ul>
        <li>Your documents are tied to your account. Other users can&apos;t see them.</li>
        <li>
          To answer your questions, the text of your documents is sent to OpenAI. OpenAI doesn&apos;t use it to
          train AI models.
        </li>
        <li>Files you convert, split or sign are processed and returned to you. We don&apos;t keep them.</li>
        <li>You sign in with Google, so we never see or store a password.</li>
        <li>We don&apos;t sell your data, show ads, or use advertising or analytics trackers.</li>
        <li>Deleting a document removes the file, its text and its search index entries.</li>
      </ul>
    </section>

    <section>
      <h2>1. What we collect</h2>
      <h3>Your account</h3>
      <p>
        When you sign in with Google, Google tells us your email address and a Google account ID. We don&apos;t
        receive your Google password. We also keep the date you created your account, your plan and your free
        trial dates.
      </p>
      <h3>Documents you upload</h3>
      <p>
        When you upload a document to the Document Manager or AI PDF, we store the file, the text we extract
        from it, and a search index built from that text so we can find the passages that answer your
        questions.
      </p>
      <h3>Your questions</h3>
      <p>
        Questions you ask about a document are sent to OpenAI together with the relevant passages, and the
        answer is shown to you. We don&apos;t save your questions or the answers on our servers; the
        conversation stays in your browser tab and is gone when you close or reload it.
      </p>
      <h3>Usage counts</h3>
      <p>
        We count how many questions you ask, documents you upload and files you convert each day, so we can
        apply the limits of your plan and of trying the tools without an account.
      </p>
      <h3>Security records</h3>
      <p>
        To stop people guessing their way into accounts or abusing the free trial, we record the network (IP)
        address and time of failed sign-ins and of new accounts. Our servers also keep standard access logs
        (network address, time, page or action requested, and browser type). Neither includes the contents of
        your documents.
      </p>
      <h3>Signed documents</h3>
      <p>
        When you sign a document yourself with E-Sign, we keep an audit record: who signed (your email, or
        &quot;Guest&quot;), when, from which network address, the file name, what was placed on which page, and
        fingerprints (SHA-256) of the document before and after signing. We don&apos;t keep the document itself.
        The record lets you show later how and when a document was signed.
      </p>
      <h3>Documents sent for signature</h3>
      <p>
        When you send a document for signature, we store the document and the names and email addresses you
        enter for the signers, and email each signer a private link. When a signer opens or signs it, we record
        the time, their network address and their browser type, and keep their signature and initials images.
        This becomes the document&apos;s certificate of completion (its audit trail), which everyone receives with the signed copy. We use
        signers&apos; details only to run the signing and keep its record, never for marketing. Emails are
        delivered by our email provider. Unless the sender turns it off, signers can read an AI summary of the
        document and ask questions about it: the document&apos;s text and their questions are sent to OpenAI to
        answer them, and aren&apos;t used to train AI models.
      </p>
      <h3>Cookies</h3>
      <p>
        We use one cookie, which keeps you signed in (or, if you haven&apos;t created an account, holds an
        anonymous guest ID). It&apos;s required for the site to work. We don&apos;t use advertising or
        analytics cookies.
      </p>
    </section>

    <section>
      <h2>2. Files you convert, split or sign</h2>
      <p>
        PDF to Word, Word to PDF, Split PDF and signing a document yourself with E-Sign process your file in
        memory or in a temporary folder, send the result back to your browser, and discard both straight away.
        These files aren&apos;t added to your Document Manager unless you upload them there yourself. Documents
        you send for signature are the exception: we keep them so signers can open them (see above).
      </p>
    </section>

    <section>
      <h2>3. How we use your information</h2>
      <ul>
        <li>To provide the service: store your documents, answer your questions and run the tools.</li>
        <li>To apply plan and free-trial limits.</li>
        <li>To keep the service and your account secure, and to prevent abuse.</li>
        <li>To respond when you contact us.</li>
      </ul>
      <p>We don&apos;t sell your information, and we don&apos;t use it for advertising.</p>
    </section>

    <section>
      <h2>4. Who else processes your information</h2>
      <ul>
        <li>
          <strong>OpenAI</strong> receives the text of the documents you upload (to build the search index)
          and your questions with the relevant passages (to write answers). Under OpenAI&apos;s API terms this
          data isn&apos;t used to train their models, and OpenAI may keep it for up to 30 days to monitor for
          abuse before deleting it.
        </li>
        <li>
          <strong>Google</strong> handles sign-in. The sign-in button and the fonts on this site are loaded
          from Google&apos;s servers, which see your network address when they&apos;re loaded.
        </li>
        <li>
          <strong>Our hosting provider</strong> runs the servers where your account and documents are stored.
        </li>
        {plan.online_payments && (
          <li>
            <strong>Stripe</strong> processes Basic and Pro payments. You enter your card or wallet details on
            Stripe&apos;s page, never on ours. We keep only your Stripe customer ID and your subscription&apos;s
            status, billing period and end date, never card numbers.
          </li>
        )}
      </ul>
      <p>
        We may also disclose information if the law requires it, or to protect the safety of our users or the
        service.
      </p>
    </section>

    <section>
      <h2>5. How long we keep it</h2>
      <ul>
        <li><strong>Documents:</strong> until you delete them.</li>
        <li>
          <strong>Files uploaded without an account:</strong> deleted after {plan.guest_file_hours ?? 24} hours,
          unless you create an account, in which case they move into it.
        </li>
        <li><strong>Your account:</strong> until you ask us to delete it.</li>
        <li><strong>Failed sign-in and new-account records:</strong> up to 24 hours.</li>
        <li>
          <strong>Usage counts:</strong> kept with your account. For visitors without an account, counts are
          deleted after 30 days.
        </li>
        <li><strong>Server access logs:</strong> rotated automatically, with older logs deleted.</li>
        <li>
          <strong>Backups:</strong> we keep encrypted backups so your data isn&apos;t lost if something goes
          wrong. When you delete something, it&apos;s removed from the service straight away and from all backups
          within 40 days.
        </li>
        <li>
          <strong>E-Sign audit records:</strong> kept as evidence of the signing. You can ask us to delete
          them.
        </li>
        <li>
          <strong>Documents sent for signature:</strong> kept, with their signers&apos; details and audit trail,
          until you delete the request in E-Sign (you can once it&apos;s completed, declined or cancelled).
          Signing links stop working when a request is finished or cancelled, or 30 days after it was sent.
        </li>
      </ul>
    </section>

    <section>
      <h2>6. How we protect it</h2>
      <p>
        Connections to the site are encrypted (HTTPS). Every request for a document is checked against the
        signed-in account, so documents can only be reached by their owner. Access to the servers is limited
        to the people who run the service. No system is perfectly secure, but we work to protect your
        information and will tell you if a breach affects it.
      </p>
    </section>

    <section>
      <h2>7. Your choices</h2>
      <ul>
        <li>You can delete any document at any time from the Document Manager.</li>
        <li>
          You can delete your account and everything in it yourself: account menu → <strong>Delete account</strong>.
          It&apos;s removed straight away, and from backups within 40 days.
        </li>
        <li>
          To get a copy of your information, contact us at <Contact supportEmail={plan.support_email} />.
        </li>
      </ul>
    </section>

    <section>
      <h2>8. Children</h2>
      <p>The service isn&apos;t intended for anyone under 16, and we don&apos;t knowingly collect their information.</p>
    </section>

    <section>
      <h2>9. Changes to this policy</h2>
      <p>
        If we change this policy, we&apos;ll update the date at the top, and for significant changes we&apos;ll
        let you know in the app before they take effect.
      </p>
    </section>

    <section>
      <h2>10. Contact</h2>
      <p>
        Questions about your privacy? Contact us at <Contact supportEmail={plan.support_email} />.
      </p>
    </section>
  </>
);

const TermsOfService = ({ plan }) => (
  <>
    <section>
      <h2>1. Agreeing to these terms</h2>
      <p>
        By using {SERVICE} (&quot;the service&quot;), you agree to these terms and to our{' '}
        <Link to='/privacy'>Privacy Policy</Link>. If you don&apos;t agree, please don&apos;t use the service.
      </p>
    </section>

    <section>
      <h2>2. The service</h2>
      <p>
        The service lets you chat with your PDFs using AI, keep documents in a Document Manager, convert between
        PDF and Word, split PDFs, and sign PDFs. Some tools can be tried without an account, with limits.
      </p>
    </section>

    <section>
      <h2>3. Your account</h2>
      <p>
        You sign in with your Google account. Keep it secure: you&apos;re responsible for what happens in your
        account. An account is for one person.
      </p>
    </section>

    <section>
      <h2>4. Free trial and plans</h2>
      <p>
        New accounts get a {plan.trial_days}-day free trial with up to {plan.trial_max_documents} documents and{' '}
        {plan.trial_max_questions_per_day} questions a day. When the trial ends, your account moves to the Free
        plan: up to {plan.free_max_documents} documents, {plan.free_max_questions_per_day} questions and{' '}
        {plan.free_conversions_per_day} file conversions a day. Basic raises these limits to{' '}
        {plan.basic_max_documents} documents and {plan.basic_max_questions_per_day} questions a day, with unlimited
        file conversions, and Pro removes them; see <Link to='/pricing'>Pricing</Link>.
      </p>
      {plan.online_payments ? (
        <p>
          Basic and Pro are subscriptions that renew automatically every {plan.yearly_billing ? 'month or year' : 'month'}, at the price shown when
          you subscribe, until you cancel. You can switch between them or cancel at any time from &quot;Manage
          billing&quot; in your account menu; after cancelling, you keep your plan until the end of the period
          you&apos;ve already paid for, then your account moves to the Free plan and nothing is deleted. Payments
          are processed by Stripe. Pro&apos;s unlimited use is
          subject to fair use: up to {plan.pro_fair_use_questions_per_day} AI questions a day.
        </p>
      ) : (
        <p>
          Basic and Pro are paid for {plan.yearly_billing ? 'a month or a year' : 'a month'} at a time and don&apos;t
          renew automatically. When the period you
          paid for ends, your account moves to the Free plan unless you renew; nothing is deleted. Pro&apos;s
          unlimited use is subject to fair use: up to {plan.pro_fair_use_questions_per_day} AI questions a day.
        </p>
      )}
      <p>
        We may change plans, limits and prices; changes apply from your next paid period, and we&apos;ll tell
        you before they do.
      </p>
    </section>

    <section>
      <h2>5. Your content</h2>
      <p>
        Your documents remain yours. You give us permission to store and process them, including sending their
        text to our AI provider, only as needed to provide the service to you. You must have the right to upload
        and process every document you use with the service.
      </p>
    </section>

    <section className='legal-page__callout'>
      <h2>6. AI answers are not professional advice</h2>
      <p>
        Answers are generated automatically from your documents and can be wrong, incomplete or out of date.
        They are not tax, legal, accounting or financial advice. Check important information against the
        original document, and consult a qualified professional (or the relevant tax authority) before making
        decisions based on it.
      </p>
    </section>

    <section>
      <h2>7. Electronic signatures</h2>
      <p>
        E-Sign lets you add your own signature, initials and the date to a document, and send documents to
        others to sign. Only sign documents you are authorized to sign, and only with your own signature; only
        send documents to people who expect them, and don&apos;t use E-Sign for spam. Signers are identified by
        access to the email address you enter; we don&apos;t otherwise verify anyone&apos;s identity. Whether an
        electronic signature is acceptable for a particular document depends on the law and on the other
        parties (some documents, such as wills or notarized papers, may need a signature on paper); it&apos;s
        your responsibility to check.
      </p>
    </section>

    <section>
      <h2>8. Acceptable use</h2>
      <p>Don&apos;t use the service to:</p>
      <ul>
        <li>break the law, or upload content you don&apos;t have the right to use;</li>
        <li>access other people&apos;s documents or accounts without permission;</li>
        <li>upload malware, or try to break, overload or get around the security or limits of the service;</li>
        <li>scrape or resell the service, or create accounts to get around free-trial limits.</li>
      </ul>
      <p>We may suspend or close accounts that break these terms.</p>
    </section>

    <section>
      <h2>9. Availability and changes</h2>
      <p>
        We work to keep the service running, but it may sometimes be unavailable, and we may change or remove
        features. Keep your own copies of important documents.
      </p>
    </section>

    <section>
      <h2>10. Disclaimer</h2>
      <p>
        The service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind,
        to the extent the law allows.
      </p>
    </section>

    <section>
      <h2>11. Limitation of liability</h2>
      <p>
        To the extent the law allows, we aren&apos;t liable for indirect or consequential losses, or for losses
        caused by relying on AI answers. Our total liability to you is limited to the amount you paid us in the
        12 months before the claim.
      </p>
    </section>

    <section>
      <h2>12. Ending</h2>
      <p>
        You can stop using the service at any time and delete your account from the account menu. We may end or suspend
        your access if you break these terms.
      </p>
    </section>

    <section>
      <h2>13. Changes to these terms</h2>
      <p>
        We may update these terms. We&apos;ll change the date at the top and, for significant changes, tell you
        in the app before they take effect. Continuing to use the service means you accept the new terms.
      </p>
    </section>

    <section>
      <h2>14. Contact</h2>
      <p>
        Questions about these terms? Contact us at <Contact supportEmail={plan.support_email} />.
      </p>
    </section>
  </>
);

const DOCS = {
  privacy: { title: 'Privacy Policy', Body: PrivacyPolicy, other: { to: '/terms', label: 'Terms of Service' } },
  terms: { title: 'Terms of Service', Body: TermsOfService, other: { to: '/privacy', label: 'Privacy Policy' } },
};

const LegalPage = ({ doc }) => {
  const plan = usePlanInfo();
  const { title, Body, other } = DOCS[doc];

  useEffect(() => {
    document.title = `${title} · ${SERVICE}`;
    window.scrollTo?.(0, 0);
  }, [title]);

  return (
    <div className='legal-page'>
      <header className='legal-page__nav'>
        <Link to='/' className='legal-page__brand' aria-label={`${SERVICE} home`}>
          <span className='legal-page__logo'>
            <LogoMark size={16} />
          </span>
          {SERVICE}
        </Link>
      </header>
      <main className='legal-page__body'>
        <Link to='/' className='legal-page__back'>
          <Icon name='arrowLeft' size={16} />
          Back to home
        </Link>
        <h1>{title}</h1>
        <p className='legal-page__updated'>Last updated: {LAST_UPDATED}</p>
        <Body plan={plan} />
        <p className='legal-page__other'>
          See also our <Link to={other.to}>{other.label}</Link>.
        </p>
      </main>
    </div>
  );
};

export default LegalPage;
