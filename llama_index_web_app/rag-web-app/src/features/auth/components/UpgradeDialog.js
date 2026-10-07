/**
 * Upgrade Dialog
 * Explains the trial / Pro plan and how to upgrade (manual until payments exist)
 */

import React, { useEffect } from 'react';
import Icon from '../../../shared/components/Icon';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { usePlanInfo } from '../hooks/usePlanInfo';
import { formatPrice, proUpgradeMailto } from '../../pricing/pricing';

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
  const isPro = plan.state === 'pro';
  const supportEmail = plan.support_email;

  let title = 'Upgrade to Pro';
  let intro = `You're on the free trial with ${plan.trial_days_left} ${plan.trial_days_left === 1 ? 'day' : 'days'} left. Pro removes the limits.`;
  if (isFree) {
    title = "You're on the Free plan";
    intro = 'Your free trial has ended, and your account is on the Free plan. Upgrade to Pro to remove the limits.';
  } else if (isPro) {
    title = "You're on Pro";
    intro = plan.pro_until
      ? `Thanks for upgrading! Your Pro plan is paid until ${new Date(plan.pro_until).toLocaleDateString(undefined, { dateStyle: 'long' })}. After that your account moves to the Free plan unless you renew.`
      : 'Your account has no limits. Thanks for upgrading!';
  }

  const mailto = proUpgradeMailto({
    supportEmail,
    billing: 'monthly',
    monthly: planInfo.pro_price_monthly,
    yearly: planInfo.pro_price_yearly,
    accountEmail: user.email,
  });

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
                {isFree ? 'Free plan' : 'Trial'} limits: {count(plan.limits.max_documents, 'document')} and{' '}
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
              <Link to='/pricing' onClick={closeUpgrade}>Compare plans</Link>
            </p>

            {mailto ? (
              <a className='upgrade-dialog__cta' href={mailto} autoFocus>
                Contact us to upgrade
              </a>
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
