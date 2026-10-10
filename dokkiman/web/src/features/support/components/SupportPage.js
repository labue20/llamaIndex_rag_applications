/**
 * Support Page (/support)
 * Quick answers to common questions, and a form to tell us how we can help.
 * Messages are emailed to us with the sender as Reply-To (server: support.py).
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../../shared/components/Icon';
import { apiFetch, readApiError } from '../../../shared/services/apiClient';
import { useAuth } from '../../auth/context/AuthContext';
import HomeNav from '../../home/components/HomeNav';
import HomeFooter from '../../home/components/HomeFooter';
import '../../home/styles/home.scss';
import '../styles/support.scss';

export const TOPICS = [
  { id: 'tool', label: 'Question about a tool' },
  { id: 'account', label: 'Account & sign-in' },
  { id: 'billing', label: 'Billing & plans' },
  { id: 'problem', label: 'Report a problem' },
  { id: 'feature', label: 'Suggest a feature' },
  { id: 'other', label: 'Other' },
];

const QUICK_ANSWERS = [
  {
    q: 'How do I sign up without a Google account?',
    a: <>On the <Link to='/signup'>sign-up page</Link>, choose <strong>Sign up with Email</strong>. We&apos;ll email
      you a link to confirm your address, and your account is ready.</>,
  },
  {
    q: 'I forgot my password',
    a: <>On the <Link to='/login'>sign-in page</Link>, choose <strong>Sign in with Email</strong>, then
      <strong> Forgot password?</strong> We&apos;ll email you a link to choose a new one. It works for 60 minutes.</>,
  },
  {
    q: 'How do I upgrade, change or cancel my plan?',
    a: <>See the plans on the <Link to='/pricing'>pricing page</Link>. If you&apos;re already subscribed, open your
      account menu (top right in the app) and choose <strong>Manage billing</strong>.</>,
  },
  {
    q: 'Do you keep my files?',
    a: <>Files you edit, compress, split, merge or convert are processed and sent straight back; we don&apos;t keep
      them. Documents you save to the Document Manager stay until you delete them. More in our{' '}
      <Link to='/privacy'>Privacy Policy</Link>.</>,
  },
  {
    q: 'Can I sign Word documents?',
    a: <>Yes. Open a Word file (.docx) in <Link to='/sign-pdf'>E-Sign</Link>: it&apos;s turned into a PDF so the
      layout can&apos;t shift, then you sign it or send it for signature.</>,
  },
];

const SupportForm = () => {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', topic: 'tool', message: '', website: '' });
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sentTo, setSentTo] = useState('');

  // Signed in: their email is filled in
  useEffect(() => {
    if (user?.email) setForm((prev) => (prev.email ? prev : { ...prev, email: user.email }));
  }, [user]);

  const change = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const send = async (e) => {
    e.preventDefault();
    if (form.message.trim().length < 10) {
      setError('Tell us a little more, so we can help.');
      return;
    }
    setIsSending(true);
    setError('');
    try {
      const response = await apiFetch('/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error(await readApiError(response, 'Your message couldn’t be sent. Please try again.'));
      setSentTo(form.email.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSending(false);
    }
  };

  if (sentTo) {
    return (
      <div className='support-form support-form--sent' role='status'>
        <span className='support-form__done' aria-hidden='true'><Icon name='check' size={22} /></span>
        <h2>Thanks, we&apos;ve got your message</h2>
        <p>We&apos;ll reply to <strong>{sentTo}</strong>, usually within one business day.</p>
        <button type='button' className='support-form__again' onClick={() => {
          setSentTo('');
          setForm((prev) => ({ ...prev, message: '' }));
        }}>
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form className='support-form' onSubmit={send} noValidate aria-labelledby='support-form-title'>
      <h2 id='support-form-title'>Send us a message</h2>
      <p className='support-form__intro'>Tell us how we can help you get more out of Dokkiman.</p>
      <div className='support-form__row'>
        <label className='support-form__field'>
          <span>Name <em>(optional)</em></span>
          <input type='text' value={form.name} onChange={change('name')} maxLength={100} autoComplete='name' />
        </label>
        <label className='support-form__field'>
          <span>Email</span>
          <input type='email' value={form.email} onChange={change('email')} maxLength={254} autoComplete='email'
            placeholder='you@example.com' required />
        </label>
      </div>
      <label className='support-form__field'>
        <span>Topic</span>
        <select value={form.topic} onChange={change('topic')}>
          {TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      <label className='support-form__field'>
        <span>How can we help?</span>
        <textarea value={form.message} onChange={change('message')} rows={6} maxLength={5000} required
          placeholder='What were you trying to do, and what happened?' />
      </label>
      {/* Hidden from people; bots fill it in */}
      <label className='support-form__trap' aria-hidden='true'>
        Website <input type='text' tabIndex={-1} autoComplete='off' value={form.website} onChange={change('website')} />
      </label>
      {error && (
        <p className='support-form__error' role='alert'><Icon name='alert' size={16} /> {error}</p>
      )}
      <button type='submit' className='home-btn home-btn--primary support-form__send'
        disabled={isSending || !form.email.trim() || !form.message.trim()}>
        {isSending ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
};

const SupportPage = ({ onLogin, onSignup, onOpenApp, onOpenManager, isLoggedIn = false }) => (
  <div className='home support-page'>
    <HomeNav onLogin={onLogin} onSignup={onSignup} isLoggedIn={isLoggedIn} onOpenApp={onOpenApp} />
    <main>
      <section className='support-hero'>
        <h1>How can we help?</h1>
        <p>Find a quick answer below, or send us a message and we&apos;ll get back to you.</p>
      </section>
      <section className='support-body'>
        <div className='support-answers'>
          <h2>Quick answers</h2>
          {QUICK_ANSWERS.map((item) => (
            <details key={item.q} className='support-answers__item'>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
        <SupportForm />
      </section>
    </main>
    <HomeFooter onLogin={onLogin} onSignup={onSignup} onOpenTool={onOpenManager} isLoggedIn={isLoggedIn} />
  </div>
);

export default SupportPage;
