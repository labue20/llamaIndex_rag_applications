/**
 * Upgrade Return Notice
 * After paying on Stripe's checkout page, people come back to
 * /app/...?upgrade=success. Stripe confirms the payment to the server a moment
 * later (webhook), so we check the account a few times until the paid plan shows up.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from '../../../shared/components/Icon';
import { useAuth } from '../context/AuthContext';

const CHECK_EVERY_MS = 2000;
const MAX_CHECKS = 15;

const UpgradeReturnNotice = () => {
  const { user, refreshUser } = useAuth();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const returnedFromCheckout = new URLSearchParams(search).get('upgrade') === 'success';
  const [visible, setVisible] = useState(returnedFromCheckout);
  const [gaveUp, setGaveUp] = useState(false);
  const checks = useRef(0);
  const state = user?.plan?.state;
  const isPro = state === 'pro';
  const isPaid = isPro || state === 'basic';

  // Drop ?upgrade=success from the address so a refresh doesn't repeat this
  useEffect(() => {
    if (returnedFromCheckout) {
      setVisible(true);
      navigate(pathname, { replace: true });
    }
  }, [returnedFromCheckout, navigate, pathname]);

  useEffect(() => {
    if (!visible || isPaid || gaveUp) return undefined;
    const timer = setTimeout(async () => {
      checks.current += 1;
      await refreshUser();
      if (checks.current >= MAX_CHECKS) setGaveUp(true);
    }, CHECK_EVERY_MS);
    return () => clearTimeout(timer);
  }, [visible, isPaid, gaveUp, refreshUser, user]);

  if (!visible) return null;

  let message = 'Payment received. Setting up your plan…';
  if (isPro) message = "You're on Pro. Thanks for upgrading! Every limit is gone.";
  else if (isPaid) message = "You're on Basic. Thanks for upgrading!";
  else if (gaveUp) message = 'Your payment went through, but your plan is taking longer than usual to switch on. Refresh in a minute, or contact us if it doesn’t appear.';

  return (
    <div className={`upgrade-notice ${isPaid ? 'upgrade-notice--done' : ''}`} role='status'>
      <Icon name={isPaid ? 'checkCircle' : 'sparkle'} size={18} />
      <span>{message}</span>
      <button type='button' className='upgrade-notice__close' onClick={() => setVisible(false)} aria-label='Dismiss'>
        ×
      </button>
    </div>
  );
};

export default UpgradeReturnNotice;
