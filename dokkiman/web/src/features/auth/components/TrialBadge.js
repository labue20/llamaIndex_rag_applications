/**
 * Trial Badge
 * Header pill showing the user's plan / days left, with an Upgrade button
 */

import React from 'react';
import { useAuth } from '../context/AuthContext';

const PAID_PLAN_NAMES = { basic: 'Basic', pro: 'Pro' };

const TrialBadge = () => {
  const { user, openUpgrade } = useAuth();
  const plan = user?.plan;
  if (!plan) return null;

  const paidName = PAID_PLAN_NAMES[plan.state];
  if (paidName) {
    // A subscription's own period end; otherwise when a plan given by hand ends
    const end = plan.billing?.period_end || plan.pro_until;
    const date = end ? new Date(end).toLocaleDateString(undefined, { dateStyle: 'long' }) : null;
    const renews = plan.billing?.has_subscription && !plan.billing.cancel_at_period_end;
    let until;
    if (date) until = renews ? `${paidName} · renews on ${date}` : `${paidName} until ${date}`;
    const badge = <span className={`trial-badge trial-badge--${plan.state}`} title={until}>{paidName}</span>;
    if (plan.state === 'pro') return badge;
    // Basic has limits, so Pro is still on offer
    return (
      <div className='trial-badge-group'>
        {badge}
        <button type='button' className='trial-badge__upgrade' onClick={openUpgrade}>
          Upgrade
        </button>
      </div>
    );
  }

  const isFree = plan.state === 'free';
  const daysLeft = plan.trial_days_left;
  const label = isFree
    ? 'Free plan'
    : `Free trial · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
  const usage = plan.usage && plan.limits
    ? `${plan.usage.questions_today} of ${plan.limits.max_questions_per_day} questions used today`
    : undefined;

  return (
    <div className='trial-badge-group'>
      <span
        className={`trial-badge ${isFree ? 'trial-badge--free' : ''}`}
        title={usage}
      >
        {label}
      </span>
      <button type='button' className='trial-badge__upgrade' onClick={openUpgrade}>
        Upgrade
      </button>
    </div>
  );
};

export default TrialBadge;
