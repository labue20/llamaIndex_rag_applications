/**
 * Pricing Page (/pricing)
 * Free, Basic and Pro plans (with a Monthly / Yearly switch when the server
 * offers yearly billing). Every number comes
 * from the server (GET /plans), so the page always matches the real limits.
 */

import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Icon from '../../../shared/components/Icon';
import { useAuth } from '../../auth/context/AuthContext';
import { usePlanInfo } from '../../auth/hooks/usePlanInfo';
import HomeNav from '../../home/components/HomeNav';
import HomeFooter from '../../home/components/HomeFooter';
import { formatPrice, monthsFree, upgradeMailto, yearlySavings } from '../pricing';
import { openBillingPortal, startCheckout } from '../billing';
import '../../home/styles/home.scss';
import '../styles/pricing.scss';

const Feature = ({ children }) => (
  <li>
    <Icon name='check' size={16} />
    <span>{children}</span>
  </li>
);

const PAID_PLANS = ['basic', 'pro'];

const FAQ = ({ plan, supportEmail, online }) => [
  {
    q: `What happens after the ${plan.trial_days}-day trial?`,
    a: `Your account moves to the Free plan automatically. Nothing is deleted. If you have more than ${plan.free_max_documents} documents, you keep them all, but you'll need to delete some (or upgrade) before uploading new ones.`,
  },
  {
    q: 'Do I need a credit card to start?',
    a: 'No. Sign in with Google and you’re in.',
  },
  {
    q: 'What’s the difference between Basic and Pro?',
    a: `Basic is our low-cost plan: up to ${plan.basic_max_documents} documents, ${plan.basic_max_questions_per_day} AI questions a day and unlimited file conversions, for ${formatPrice(plan.basic_price_monthly)} a month. Pro removes the limits on documents and questions too.${online ? ' You can switch between them at any time from “Manage billing”.' : ''}`,
  },
  online
    ? {
      q: 'How do I upgrade?',
      a: 'Click “Upgrade to Basic” or “Upgrade to Pro” and pay securely with Stripe by card or wallet. Your plan starts as soon as the payment goes through.',
    }
    : {
      q: 'How do I upgrade?',
      a: supportEmail
        ? `Click “Upgrade to Basic” or “Upgrade to Pro” to email us at ${supportEmail}. We’ll reply with how to pay, and your account switches over once payment is received.`
        : 'Online upgrades are coming soon. Until then, contact us and we’ll switch your account to Basic or Pro.',
    },
  online
    ? {
      q: 'Can I cancel my plan?',
      a: 'Yes, at any time, from “Manage billing” in your account menu. Basic and Pro renew automatically until you cancel; after cancelling, you keep your plan until the end of the period you’ve paid for, then your account moves to the Free plan. Nothing is deleted.',
    }
    : {
      q: 'Do Basic and Pro renew automatically?',
      a: `No. You pay for ${plan.yearly_billing ? 'a month or a year' : 'a month'} at a time. When that period ends, your account moves to the Free plan unless you renew, and nothing is deleted.`,
    },
  {
    q: 'How does sending a document for signature work?',
    a: `In E-Sign, choose “Request signatures”, add each signer’s name and email, and place their signature fields. They get an email with a private link and sign online, no account needed. When everyone has signed, you all get the signed PDF and its certificate of completion (the audit trail). Basic includes ${plan.basic_signature_requests_per_month} requests a month (the free trial, ${plan.trial_signature_requests_per_month}); Pro is unlimited.`,
  },
  {
    q: 'Is Pro really unlimited?',
    a: `There are no limits on documents or file conversions. AI questions are subject to fair use: up to ${plan.pro_fair_use_questions_per_day} a day, far more than normal use needs.`,
  },
  {
    q: 'What counts as a file conversion?',
    a: 'Each PDF to Word, Word to PDF, Split PDF or E-Sign document you download. Asking questions about your documents is counted separately.',
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

// A paid plan's card: price for the chosen billing period, and the right button
// for the visitor (sign up, checkout, switch plan, manage billing or email us)
const PaidPlanCard = ({
  id, name, tagline, badge, monthly, yearly, billing, features, offersYearly = false,
  user, online, supportEmail, onSignup, redirecting, error, onStripe,
}) => {
  const { perMonth, saved } = yearlySavings(monthly, yearly);
  const months = monthsFree(monthly, yearly);
  const state = user?.plan?.state;
  const onThisPlan = state === id;
  const onPaidPlan = PAID_PLANS.includes(state);
  const hasBilling = Boolean(user?.plan?.billing);
  const mailto = upgradeMailto({
    supportEmail, planName: name, billing, monthly, yearly, accountEmail: user?.email,
  });
  const ctaClass = `home-btn ${id === 'pro' ? 'home-btn--primary' : 'home-btn--ghost'} pricing-card__cta`;

  let cta;
  if (onThisPlan && online && hasBilling) {
    cta = (
      <button type='button' className='home-btn home-btn--ghost pricing-card__cta' onClick={() => onStripe(id, openBillingPortal)} disabled={Boolean(redirecting)}>
        {redirecting === id ? 'Opening…' : 'Manage billing'}
      </button>
    );
  } else if (onThisPlan) {
    cta = (
      <p className='pricing-card__current'>
        <Icon name='checkCircle' size={16} /> You&apos;re on {name}
      </p>
    );
  } else if (onPaidPlan && online && hasBilling) {
    // Subscribers change plan in Stripe's billing page, which prorates the difference
    cta = (
      <button type='button' className={ctaClass} onClick={() => onStripe(id, openBillingPortal)} disabled={Boolean(redirecting)}>
        {redirecting === id ? 'Opening…' : `Switch to ${name}`}
      </button>
    );
  } else if (online) {
    cta = (
      <button
        type='button'
        className={ctaClass}
        // Without an account: sign up first, then come back here
        onClick={() => (user ? onStripe(id, () => startCheckout(billing, id)) : onSignup())}
        disabled={Boolean(redirecting)}
      >
        {redirecting === id ? 'Opening secure checkout…' : `Upgrade to ${name}`}
      </button>
    );
  } else if (mailto) {
    cta = <a className={ctaClass} href={mailto}>Upgrade to {name}</a>;
  } else {
    cta = <button type='button' className={ctaClass} disabled>Upgrades open soon</button>;
  }

  return (
    <section className={`pricing-card pricing-card--${id}`} aria-labelledby={`plan-${id}`}>
      {badge && <span className='pricing-card__badge'>{badge}</span>}
      <h2 id={`plan-${id}`} className='pricing-card__name'>{name}</h2>
      <p className='pricing-card__tagline'>{tagline}</p>
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
        {!offersYearly
          ? 'Billed monthly. Cancel anytime.'
          : billing === 'monthly'
            ? `Or ${formatPrice(yearly)} a year${months > 0 ? `, and get ${months} ${months === 1 ? 'month' : 'months'} free` : ''}.`
            : `Just ${formatPrice(perMonth)} a month. You save ${formatPrice(saved)}.`}
      </p>
      {cta}
      {online && !onPaidPlan && (
        <p className='pricing-card__secure'>
          <Icon name='lock' size={13} /> Secure payment with Stripe. Cancel anytime.
        </p>
      )}
      {error && <p className='pricing-card__error' role='alert'>{error}</p>}
      <ul className='pricing-card__features'>
        {features.map((feature) => <Feature key={feature}>{feature}</Feature>)}
      </ul>
    </section>
  );
};

const PricingPage = ({ onLogin, onSignup, onTryTool, onOpenApp }) => {
  const { user } = useAuth();
  const plan = usePlanInfo();
  const { search } = useLocation();
  const [chosenBilling, setBilling] = useState('monthly');
  const offersYearly = Boolean(plan.yearly_billing);
  // Monthly only, unless the server offers yearly billing
  const billing = offersYearly ? chosenBilling : 'monthly';
  // Which card is on its way to Stripe, and which card's request failed
  const [redirecting, setRedirecting] = useState(null);
  const [billingError, setBillingError] = useState({ plan: null, message: '' });
  const checkoutCancelled = new URLSearchParams(search).get('upgrade') === 'cancelled';

  useEffect(() => {
    document.title = 'Pricing · Dokkiman';
  }, []);

  const online = Boolean(plan.online_payments);
  // The Yearly switch promises what every paid plan gives (each card shows its own saving)
  const yearlyMonthsFree = Math.min(
    monthsFree(plan.basic_price_monthly, plan.basic_price_yearly),
    monthsFree(plan.pro_price_monthly, plan.pro_price_yearly),
  );

  // Leave for Stripe's checkout or billing page
  const goToStripe = async (planId, action) => {
    setBillingError({ plan: null, message: '' });
    setRedirecting(planId);
    try {
      await action();
    } catch (err) {
      setBillingError({ plan: planId, message: err.message });
      setRedirecting(null);
    }
  };
  const openTool = (toolId) => (toolId === 'manager' ? onSignup() : onTryTool(toolId));
  const cardProps = (id) => ({
    id,
    billing,
    user,
    online,
    supportEmail: plan.support_email,
    offersYearly,
    onSignup,
    redirecting,
    error: billingError.plan === id ? billingError.message : '',
    onStripe: goToStripe,
  });

  return (
    <div className='home'>
      <HomeNav
        onLogin={onLogin}
        onSignup={onSignup}
        isLoggedIn={!!user}
        onOpenApp={onOpenApp}
      />

      <main className='pricing'>
        <header className='pricing__header'>
          <h1>PDF Tools That Fit Your Budget</h1>
          <p>
            Start with a {plan.trial_days}-day free trial with full access. After that, keep using the Free plan
            for as long as you like, or upgrade to Basic for more, or Pro for no limits.
          </p>

          {checkoutCancelled && (
            <p className='pricing__notice' role='status'>
              Checkout was cancelled, and you haven&apos;t been charged.
            </p>
          )}

          {offersYearly && (
          <div className='pricing__billing' role='group' aria-label='Billing period'>
            <button type='button' aria-pressed={billing === 'monthly'} onClick={() => setBilling('monthly')}>
              Monthly
            </button>
            <button type='button' aria-pressed={billing === 'yearly'} onClick={() => setBilling('yearly')}>
              Yearly
              {yearlyMonthsFree > 0 && (
                <span className='pricing__save'>
                  {yearlyMonthsFree} {yearlyMonthsFree === 1 ? 'month' : 'months'} free
                </span>
              )}
            </button>
          </div>
          )}
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
              <Feature>PDF to Word, Word to PDF, Split PDF and E-Sign</Feature>
              <Feature>Signature audit trail</Feature>
            </ul>
          </section>

          <PaidPlanCard
            {...cardProps('basic')}
            name='Basic'
            tagline='For light, regular use'
            monthly={plan.basic_price_monthly}
            yearly={plan.basic_price_yearly}
            features={[
              `Up to ${plan.basic_max_documents} documents`,
              `${plan.basic_max_questions_per_day} AI questions a day`,
              'Unlimited file conversions',
              `Send ${plan.basic_signature_requests_per_month} documents a month for others to e-sign`,
              'Every tool, including E-Sign with audit trail',
            ]}
          />

          <PaidPlanCard
            {...cardProps('pro')}
            name='Pro'
            tagline='For everyday work with your documents'
            badge='Best value'
            monthly={plan.pro_price_monthly}
            yearly={plan.pro_price_yearly}
            features={[
              'Unlimited documents',
              'Unlimited AI questions',
              'Unlimited file conversions',
              'Unlimited documents sent for e-signature',
              'Every tool, including E-Sign with audit trail',
              'Keep access to everything you upload',
            ]}
          />
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
