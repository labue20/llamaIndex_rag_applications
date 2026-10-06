/**
 * Trial Badge
 * Header pill showing the user's plan / days left, with an Upgrade button
 */

import React from 'react';
import { useAuth } from '../context/AuthContext';

const TrialBadge = () => {
  const { user, openUpgrade } = useAuth();
  const plan = user?.plan;
  if (!plan) return null;

  if (plan.state === 'pro') {
    return <span className='trial-badge trial-badge--pro'>Pro</span>;
  }

  const isExpired = plan.state === 'expired';
  const daysLeft = plan.trial_days_left;
  const label = isExpired
    ? 'Free trial ended'
    : `Free trial · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
  const usage = plan.usage && plan.limits
    ? `${plan.usage.questions_today} of ${plan.limits.max_questions_per_day} questions used today`
    : undefined;

  return (
    <div className='trial-badge-group'>
      <span
        className={`trial-badge ${isExpired ? 'trial-badge--expired' : ''}`}
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
