/**
 * Upgrade Dialog
 * Explains the user's plan (trial, Free, Basic or Pro) and how to upgrade:
 * Pro first, with Basic as the low-cost option (by email without online payments)
 */

import React, { useEffect, useState } from 'react';
import Icon from '../../../shared/components/Icon';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { usePlanInfo } from '../hooks/usePlanInfo';
import { formatPrice, upgradeMailto } from '../../pricing/pricing';
import { startCheckout } from '../../pricing/billing';

// '1 question', '10 questions'
const count = (number, word) => `${number} ${word}${number === 1 ? '' : 's'}`;

const PRO_BENEFITS = [
  'Unlimited documents',
  'Unlimited questions every day',
  'Unlimited conversions, splits and signatures',
  'Keep access to everything you upload',
];

const UpgradeDialog = () => {
  const { user, isUpgradeOpen, closeUpgrade, showAuth } = useAuth();
  const planInfo = usePlanInfo();
  // Which plan's checkout is opening ('basic' | 'pro')
  const [redirecting, setRedirecting] = useState(null);
  const [checkoutError, setCheckoutError] = useState('');

  const upgradeOnline = async (planId) => {
    setCheckoutError('');
    setRedirecting(planId);
    try {
      await startCheckout('monthly', planId);
    } catch (err) {
      setCheckoutError(err.message);
      setRedirecting(null);
    }
  };

  // Close on Escape
  useEffect(() => {
    if (!isUpgradeOpen) return undefined;
    const onKeyDown = (e) => e.key === 'Escape' && closeUpgrade();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isUpgradeOpen, closeUpgrade]);

  if (!isUpgradeOpen) return null;

  // Guests who hit a limit are invited to create a free account
  if (!user) {
    return (
      <div className='upgrade-overlay' onClick={closeUpgrade} data-testid='upgrade-overlay'>
        <div
          className='upgrade-dialog'
          role='dialog'
          aria-modal='true'
          aria-labelledby='upgrade-title'
          onClick={(e) => e.stopPropagation()}
        >
          <button type='button' className='upgrade-dialog__close' onClick={closeUpgrade} aria-label='Close'>
            ×
          </button>
          <span className='upgrade-dialog__icon'>
            <Icon name='sparkle' size={22} />
          </span>
          <h2 id='upgrade-title' className='upgrade-dialog__title'>Create a free account to keep going</h2>
          <p className='upgrade-dialog__intro'>
            You've used what guests can try. A free account gives you a {planInfo.trial_days}-day
            trial, and the document you're working on comes with you.
          </p>
          <ul className='upgrade-dialog__benefits'>
            {[
              `Up to ${planInfo.trial_max_documents} documents`,
              `${planInfo.trial_max_questions_per_day} questions a day`,
              'Your files saved in the Document Manager',
              'No credit card needed',
            ].map((benefit) => (
              <li key={benefit}>
                <Icon name='check' size={16} />
                {benefit}
              </li>
            ))}
          </ul>
          <button type='button' className='upgrade-dialog__cta' onClick={() => showAuth('signup')}>
            Create free account
          </button>
          <button type='button' className='upgrade-dialog__secondary' onClick={() => showAuth('login')}>
            I already have an account
          </button>
        </div>
      </div>
    );
  }

  const plan = user.plan || {};
  const isFree = plan.state === 'free';
  const isBasic = plan.state === 'basic';
  const isPro = plan.state === 'pro';
  const supportEmail = plan.support_email;
  const paidUntil = plan.pro_until
    ? new Date(plan.pro_until).toLocaleDateString(undefined, { dateStyle: 'long' })
    : null;

  let title = 'Upgrade to Pro';
  let intro = `You're on the free trial with ${plan.trial_days_left} ${plan.trial_days_left === 1 ? 'day' : 'days'} left. Pro removes the limits.`;
  if (isFree) {
    title = "You're on the Free plan";
    intro = 'Your free trial has ended, and your account is on the Free plan. Upgrade to Pro to remove the limits.';
  } else if (isBasic) {
    title = "You're on Basic";
    intro = 'Upgrade to Pro to remove the limits on documents and questions.';
  } else if (isPro) {
    title = "You're on Pro";
    intro = paidUntil
      ? `Thanks for upgrading! Your Pro plan is paid until ${paidUntil}. After that your account moves to the Free plan unless you renew.`
      : 'Your account has no limits. Thanks for upgrading!';
  }
  const limitsLabel = isFree ? 'Free plan' : isBasic ? 'Basic' : 'Trial';
  // Basic subscribers switch plan in Stripe's billing page (checkout sends them there)
  const switchesInPortal = isBasic && Boolean(plan.billing);

  const mailtoFor = (planName, monthly, yearly) => upgradeMailto({
    supportEmail, planName, billing: 'monthly', monthly, yearly, accountEmail: user.email,
  });
  const mailto = mailtoFor('Pro', planInfo.pro_price_monthly, planInfo.pro_price_yearly);
  const basicMailto = mailtoFor('Basic', planInfo.basic_price_monthly, planInfo.basic_price_yearly);

  return (
    <div className='upgrade-overlay' onClick={closeUpgrade} data-testid='upgrade-overlay'>
      <div
        className='upgrade-dialog'
        role='dialog'
        aria-modal='true'
        aria-labelledby='upgrade-title'
        onClick={(e) => e.stopPropagation()}
      >
        <button type='button' className='upgrade-dialog__close' onClick={closeUpgrade} aria-label='Close'>
          ×
        </button>
        <span className='upgrade-dialog__icon'>
          <Icon name='sparkle' size={22} />
        </span>
        <h2 id='upgrade-title' className='upgrade-dialog__title'>{title}</h2>
        <p className='upgrade-dialog__intro'>{intro}</p>

        {!isPro && (
          <>
            <ul className='upgrade-dialog__benefits'>
              {PRO_BENEFITS.map((benefit) => (
                <li key={benefit}>
                  <Icon name='check' size={16} />
                  {benefit}
                </li>
              ))}
            </ul>

            {plan.limits && (
              <p className='upgrade-dialog__limits'>
                {limitsLabel} limits: {count(plan.limits.max_documents, 'document')} and{' '}
                {count(plan.limits.max_questions_per_day, 'question')} a day
                {plan.usage ? ` (${plan.usage.questions_today} used today)` : ''}
                {plan.limits.max_conversions_per_day
                  ? `, ${count(plan.limits.max_conversions_per_day, 'file conversion')} a day`
                  : ''}.
              </p>
            )}

            <p className='upgrade-dialog__price'>
              Pro is {formatPrice(planInfo.pro_price_monthly)} a month, or {formatPrice(planInfo.pro_price_yearly)} a
              year.{' '}
              {!isBasic && (
                <>
                  Or start smaller with Basic at {formatPrice(planInfo.basic_price_monthly)} a month:{' '}
                  {count(planInfo.basic_max_documents, 'document')} and{' '}
                  {count(planInfo.basic_max_questions_per_day, 'question')} a day.{' '}
                </>
              )}
              <Link to='/pricing' onClick={closeUpgrade}>Compare plans</Link>
            </p>

            {planInfo.online_payments ? (
              <>
                <button
                  type='button'
                  className='upgrade-dialog__cta'
                  onClick={() => upgradeOnline('pro')}
                  disabled={Boolean(redirecting)}
                  autoFocus
                >
                  {redirecting === 'pro'
                    ? (switchesInPortal ? 'Opening billing…' : 'Opening secure checkout…')
                    : switchesInPortal
                      ? 'Switch to Pro'
                      : `Upgrade to Pro · ${formatPrice(planInfo.pro_price_monthly)}/month`}
                </button>
                {!isBasic && (
                  <button
                    type='button'
                    className='upgrade-dialog__secondary'
                    onClick={() => upgradeOnline('basic')}
                    disabled={Boolean(redirecting)}
                  >
                    {redirecting === 'basic'
                      ? 'Opening secure checkout…'
                      : `Get Basic · ${formatPrice(planInfo.basic_price_monthly)}/month`}
                  </button>
                )}
                {checkoutError && <p className='upgrade-dialog__error' role='alert'>{checkoutError}</p>}
              </>
            ) : mailto ? (
              <>
                <a className='upgrade-dialog__cta' href={mailto} autoFocus>
                  Contact us to upgrade
                </a>
                {!isBasic && basicMailto && (
                  <a className='upgrade-dialog__secondary' href={basicMailto}>
                    Ask about Basic · {formatPrice(planInfo.basic_price_monthly)}/month
                  </a>
                )}
              </>
            ) : (
              <p className='upgrade-dialog__contact'>
                To upgrade, contact the site administrator and mention your account email,{' '}
                <strong>{user.email}</strong>.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default UpgradeDialog;
