/**
 * Upgrade Dialog
 * Explains the trial / Pro plan and how to upgrade (manual until payments exist)
 */

import React, { useEffect } from 'react';
import Icon from '../../../shared/components/Icon';
import { useAuth } from '../context/AuthContext';

const PRO_BENEFITS = [
  'Unlimited documents',
  'Unlimited questions every day',
  'Chat with PDF, converters and Split PDF',
  'Keep access to everything you upload',
];

const UpgradeDialog = () => {
  const { user, isUpgradeOpen, closeUpgrade } = useAuth();

  // Close on Escape
  useEffect(() => {
    if (!isUpgradeOpen) return undefined;
    const onKeyDown = (e) => e.key === 'Escape' && closeUpgrade();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isUpgradeOpen, closeUpgrade]);

  if (!isUpgradeOpen || !user) return null;

  const plan = user.plan || {};
  const isExpired = plan.state === 'expired';
  const isPro = plan.state === 'pro';
  const supportEmail = plan.support_email;

  let title = 'Upgrade to Pro';
  let intro = `You're on the free trial with ${plan.trial_days_left} ${plan.trial_days_left === 1 ? 'day' : 'days'} left. Pro removes the trial limits.`;
  if (isExpired) {
    title = 'Your free trial has ended';
    intro = 'Your documents are safe: you can still view and delete them. Upgrade to Pro to keep uploading, chatting and converting.';
  } else if (isPro) {
    title = "You're on Pro";
    intro = 'Your account has no limits. Thanks for upgrading!';
  }

  const mailto = supportEmail
    ? `mailto:${supportEmail}?subject=${encodeURIComponent('Upgrade to Pro')}&body=${encodeURIComponent(`Please upgrade my account: ${user.email}`)}`
    : null;

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
        <span className={`upgrade-dialog__icon ${isExpired ? 'upgrade-dialog__icon--expired' : ''}`}>
          <Icon name={isExpired ? 'lock' : 'sparkle'} size={22} />
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

            {plan.limits && !isExpired && (
              <p className='upgrade-dialog__limits'>
                Trial limits: {plan.limits.max_documents} documents and{' '}
                {plan.limits.max_questions_per_day} questions a day
                {plan.usage ? ` (${plan.usage.questions_today} used today)` : ''}.
              </p>
            )}

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
