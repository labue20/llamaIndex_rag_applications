/**
 * Pricing Page (/pricing)
 * Free and Pro plans, with a Monthly / Yearly switch. Every number comes from
 * the server (GET /plans), so the page always matches the real limits.
 */

import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Icon from '../../../shared/components/Icon';
import { useAuth } from '../../auth/context/AuthContext';
import { usePlanInfo } from '../../auth/hooks/usePlanInfo';
import HomeNav from '../../home/components/HomeNav';
import HomeFooter from '../../home/components/HomeFooter';
import { formatPrice, proUpgradeMailto, yearlySavings } from '../pricing';
import { openBillingPortal, startCheckout } from '../billing';
import '../../home/styles/home.scss';
import '../styles/pricing.scss';

const Feature = ({ children }) => (
  <li>
    <Icon name='check' size={16} />
    <span>{children}</span>
  </li>
);

const FAQ = ({ plan, supportEmail, online }) => [
  {
    q: `What happens after the ${plan.trial_days}-day trial?`,
    a: `Your account moves to the Free plan automatically. Nothing is deleted. If you have more than ${plan.free_max_documents} documents, you keep them all, but you'll need to delete some (or upgrade) before uploading new ones.`,
  },
  {
    q: 'Do I need a credit card to start?',
    a: 'No. Sign in with Google and you’re in.',
  },
  online
    ? {
      q: 'How do I upgrade to Pro?',
      a: 'Click “Upgrade to Pro” and pay securely with Stripe by card or wallet. Pro starts as soon as the payment goes through.',
    }
    : {
      q: 'How do I upgrade to Pro?',
      a: supportEmail
        ? `Click “Upgrade to Pro” to email us at ${supportEmail}. We’ll reply with how to pay, and your account switches to Pro once payment is received.`
        : 'Online upgrades are coming soon. Until then, contact us and we’ll switch your account to Pro.',
    },
  online
    ? {
      q: 'Can I cancel Pro?',
      a: 'Yes, at any time, from “Manage billing” in your account menu. Pro renews automatically until you cancel; after cancelling, you keep Pro until the end of the period you’ve paid for, then your account moves to the Free plan. Nothing is deleted.',
    }
    : {
      q: 'Does Pro renew automatically?',
      a: 'No. You pay for a month or a year at a time. When that period ends, your account moves to the Free plan unless you renew, and nothing is deleted.',
    },
  {
    q: 'Is Pro really unlimited?',
    a: `There are no limits on documents or file conversions. AI questions are subject to fair use: up to ${plan.pro_fair_use_questions_per_day} a day, far more than normal use needs.`,
  },
  {
    q: 'What counts as a file conversion?',
    a: 'Each PDF to Word, Word to PDF, Split PDF or Sign PDF you download. Asking questions about your documents is counted separately.',
  },
  {
    q: 'Is my data used to train AI?',
    a: (
      <>
        No. Your documents are processed by OpenAI to answer your questions and aren’t used to train AI
        models. See our <Link to='/privacy'>Privacy Policy</Link>.
      </>
    ),
  },
];

const PricingPage = ({ onLogin, onSignup, onTryTool, onOpenApp }) => {
  const { user } = useAuth();
  const plan = usePlanInfo();
  const { search } = useLocation();
  const [billing, setBilling] = useState('monthly');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [billingError, setBillingError] = useState('');
  const checkoutCancelled = new URLSearchParams(search).get('upgrade') === 'cancelled';

  useEffect(() => {
    document.title = 'Pricing · Dokkiman';
  }, []);

  const monthly = plan.pro_price_monthly;
  const yearly = plan.pro_price_yearly;
  const { perMonth, saved } = yearlySavings(monthly, yearly);
  const isPro = user?.plan?.state === 'pro';
  const online = Boolean(plan.online_payments);
  const hasBilling = Boolean(user?.plan?.billing);

  // Leave for Stripe's checkout or billing page
  const goToStripe = async (action) => {
    setBillingError('');
    setIsRedirecting(true);
    try {
      await action();
    } catch (err) {
      setBillingError(err.message);
      setIsRedirecting(false);
    }
  };
  const mailto = proUpgradeMailto({
    supportEmail: plan.support_email, billing, monthly, yearly, accountEmail: user?.email,
  });
  const openTool = (toolId) => (toolId === 'manager' ? onSignup() : onTryTool(toolId));

  return (
    <div className='home'>
      <HomeNav
        onLogin={onLogin}
        onSignup={onSignup}
        onOpenTool={openTool}
        isLoggedIn={!!user}
        onOpenApp={onOpenApp}
      />

      <main className='pricing'>
        <header className='pricing__header'>
          <h1>PDF Tools That Fit Your Budget</h1>
          <p>
            Start with a {plan.trial_days}-day free trial with full access. After that, keep using the Free plan
            for as long as you like, or upgrade to Pro for no limits.
          </p>

          {checkoutCancelled && (
            <p className='pricing__notice' role='status'>
              Checkout was cancelled, and you haven&apos;t been charged.
            </p>
          )}

          <div className='pricing__billing' role='group' aria-label='Billing period'>
            <button type='button' aria-pressed={billing === 'monthly'} onClick={() => setBilling('monthly')}>
              Monthly
            </button>
            <button type='button' aria-pressed={billing === 'yearly'} onClick={() => setBilling('yearly')}>
              Yearly
              {saved > 0 && <span className='pricing__save'>2 months free</span>}
            </button>
          </div>
        </header>

        <div className='pricing__plans'>
          <section className='pricing-card' aria-labelledby='plan-free'>
            <h2 id='plan-free' className='pricing-card__name'>Free</h2>
            <p className='pricing-card__tagline'>For occasional use</p>
            <p className='pricing-card__price'>
              <span className='pricing-card__amount'>$0</span>
              <span className='pricing-card__period'>forever</span>
            </p>
            <p className='pricing-card__note'>
              Starts with a {plan.trial_days}-day trial: {plan.trial_max_documents} documents and{' '}
              {plan.trial_max_questions_per_day} questions a day.
            </p>
            {user ? (
              <button type='button' className='home-btn home-btn--ghost pricing-card__cta' onClick={onOpenApp}>
                Open the app
              </button>
            ) : (
              <button type='button' className='home-btn home-btn--ghost pricing-card__cta' onClick={onSignup}>
                Start free trial
              </button>
            )}
            <ul className='pricing-card__features'>
              <Feature>Up to {plan.free_max_documents} documents in your Document Manager</Feature>
              <Feature>{plan.free_max_questions_per_day} AI questions a day</Feature>
              <Feature>{plan.free_conversions_per_day} file conversions a day</Feature>
              <Feature>PDF to Word, Word to PDF, Split PDF and Sign PDF</Feature>
              <Feature>Signature audit trail</Feature>
            </ul>
          </section>

          <section className='pricing-card pricing-card--pro' aria-labelledby='plan-pro'>
            <span className='pricing-card__badge'>Best value</span>
            <h2 id='plan-pro' className='pricing-card__name'>Pro</h2>
            <p className='pricing-card__tagline'>For regular work with your documents</p>
            {billing === 'monthly' ? (
              <p className='pricing-card__price'>
                <span className='pricing-card__amount'>{formatPrice(monthly)}</span>
                <span className='pricing-card__period'>/ month</span>
              </p>
            ) : (
              <p className='pricing-card__price'>
                <span className='pricing-card__amount'>{formatPrice(yearly)}</span>
                <span className='pricing-card__period'>/ year</span>
              </p>
            )}
            <p className='pricing-card__note'>
              {billing === 'monthly'
                ? `Or ${formatPrice(yearly)} a year, and get 2 months free.`
                : `Just ${formatPrice(perMonth)} a month. You save ${formatPrice(saved)}.`}
            </p>
            {isPro && online && hasBilling ? (
              <button
                type='button'
                className='home-btn home-btn--ghost pricing-card__cta'
                onClick={() => goToStripe(openBillingPortal)}
                disabled={isRedirecting}
              >
                {isRedirecting ? 'Opening…' : 'Manage billing'}
              </button>
            ) : isPro ? (
              <p className='pricing-card__current'>
                <Icon name='checkCircle' size={16} /> You&apos;re on Pro
              </p>
            ) : online ? (
              <button
                type='button'
                className='home-btn home-btn--primary pricing-card__cta'
                // Without an account: sign up first, then come back here
                onClick={() => (user ? goToStripe(() => startCheckout(billing)) : onSignup())}
                disabled={isRedirecting}
              >
                {isRedirecting ? 'Opening secure checkout…' : 'Upgrade to Pro'}
              </button>
            ) : mailto ? (
              <a className='home-btn home-btn--primary pricing-card__cta' href={mailto}>
                Upgrade to Pro
              </a>
            ) : (
              <button type='button' className='home-btn home-btn--primary pricing-card__cta' disabled>
                Upgrades open soon
              </button>
            )}
            {online && !isPro && (
              <p className='pricing-card__secure'>
                <Icon name='lock' size={13} /> Secure payment with Stripe. Cancel anytime.
              </p>
            )}
            {billingError && <p className='pricing-card__error' role='alert'>{billingError}</p>}
            <ul className='pricing-card__features'>
              <Feature>Unlimited documents</Feature>
              <Feature>Unlimited AI questions</Feature>
              <Feature>Unlimited file conversions</Feature>
              <Feature>Every tool, including Sign PDF with audit trail</Feature>
              <Feature>Keep access to everything you upload</Feature>
            </ul>
          </section>
        </div>

        <section className='pricing__guest'>
          <div>
            <h2>Just need one file?</h2>
            <p>
              Try any tool without an account: convert, split or sign a few files an hour, and ask{' '}
              {plan.guest_max_questions} questions about {plan.guest_max_documents === 1 ? 'a document' : `${plan.guest_max_documents} documents`}.
              Files are deleted after {plan.guest_file_hours} hours.
            </p>
          </div>
          <button type='button' className='home-btn home-btn--ghost' onClick={() => onTryTool('pdf-word')}>
            Try a tool
          </button>
        </section>

        <section className='pricing__faq' aria-labelledby='pricing-faq'>
          <h2 id='pricing-faq'>Questions</h2>
          <dl>
            {FAQ({ plan, supportEmail: plan.support_email, online }).map((item) => (
              <div key={item.q}>
                <dt>{item.q}</dt>
                <dd>{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <HomeFooter onLogin={onLogin} onSignup={onSignup} onOpenTool={openTool} />
    </div>
  );
};

export default PricingPage;
