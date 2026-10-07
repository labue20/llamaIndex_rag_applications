/**
 * Guest Account Prompt
 * Shown to guests on account-only pages (the Document Manager)
 */

import React from 'react';
import Icon from '../../../shared/components/Icon';
import { useAuth } from '../context/AuthContext';
import { usePlanInfo } from '../hooks/usePlanInfo';

const GuestAccountPrompt = () => {
  const { showAuth } = useAuth();
  const { trial_days: trialDays } = usePlanInfo();

  return (
    <div className='guest-prompt'>
      <span className='guest-prompt__icon' aria-hidden='true'>
        <Icon name='folder' size={24} />
      </span>
      <h3 className='guest-prompt__title'>Keep your documents in one place</h3>
      <p className='guest-prompt__text'>
        The Document Manager saves your files so you can chat with them and convert them again
        later. Create a free account to use it, with a {trialDays}-day free trial and no credit card.
      </p>
      <div className='guest-prompt__actions'>
        <button type='button' className='guest-prompt__primary' onClick={() => showAuth('signup')}>
          Create free account
        </button>
        <button type='button' className='guest-prompt__secondary' onClick={() => showAuth('login')}>
          Log in
        </button>
      </div>
    </div>
  );
};

export default GuestAccountPrompt;
