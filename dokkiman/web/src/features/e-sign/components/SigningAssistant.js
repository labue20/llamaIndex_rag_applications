/**
 * Signing Assistant ("Understand before you sign")
 * On the signing page: an AI summary of the document's key terms, and a place
 * to ask questions about it, answered only from the document, with pages.
 */

import React, { useEffect, useState } from 'react';
import { apiFetch, Icon, readApiError } from '../../../shared';
import MessageMarkdown from '../../ai-pdf/components/MessageMarkdown';

const SUGGESTIONS = [
  'What happens if I want to end this early?',
  'What fees or penalties could I have to pay?',
  'What am I responsible for?',
];

const SigningAssistant = ({ token, questionsLeft: initialLeft }) => {
  const [summary, setSummary] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState([]); // [{ question, answer }]
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState('');
  const [questionsLeft, setQuestionsLeft] = useState(initialLeft);
  const base = `/signing/${encodeURIComponent(token)}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await apiFetch(`${base}/summary`);
        if (!response.ok) throw new Error(await readApiError(response, 'The summary isn’t available right now.'));
        const data = await response.json();
        if (!cancelled) setSummary(data.summary);
      } catch (err) {
        if (!cancelled) setSummaryError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base]);

  const ask = async (text) => {
    const q = (text ?? question).trim();
    if (!q || isAsking) return;
    setIsAsking(true);
    setAskError('');
    try {
      const response = await apiFetch(`${base}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      if (!response.ok) throw new Error(await readApiError(response, 'The AI couldn’t answer right now.'));
      const data = await response.json();
      setAnswers((prev) => [...prev, { question: q, answer: data.answer }]);
      setQuestionsLeft(data.questions_left);
      setQuestion('');
    } catch (err) {
      setAskError(err.message);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <section className='esign-assistant' aria-labelledby='esign-assistant-title'>
      <button
        type='button'
        className='esign-assistant__head'
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className='esign-assistant__icon' aria-hidden='true'><Icon name='sparkle' size={18} /></span>
        <span>
          <span id='esign-assistant-title' className='esign-assistant__title'>Understand this document</span>
          <span className='esign-assistant__sub'>Key terms in plain English, and answers to your questions</span>
        </span>
        <span className='esign-assistant__toggle' aria-hidden='true'>{isOpen ? '−' : '+'}</span>
      </button>

      {isOpen && (
        <div className='esign-assistant__body'>
          <div className='esign-assistant__summary' aria-live='polite'>
            {summary ? (
              <MessageMarkdown text={summary} />
            ) : summaryError ? (
              <p className='esign-assistant__error' role='alert'>{summaryError}</p>
            ) : (
              <p className='esign-assistant__loading'><span className='esign-assistant__spinner' aria-hidden='true' /> Reading the document…</p>
            )}
          </div>

          {answers.length > 0 && (
            <ol className='esign-assistant__answers' aria-label='Your questions'>
              {answers.map((item, index) => (
                <li key={index}>
                  <p className='esign-assistant__question'>{item.question}</p>
                  <div className='esign-assistant__answer'><MessageMarkdown text={item.answer} /></div>
                </li>
              ))}
            </ol>
          )}

          {questionsLeft > 0 ? (
            <>
              {answers.length === 0 && (
                <div className='esign-assistant__suggestions'>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type='button' className='esign-chip esign-chip--plain' onClick={() => ask(s)}
                      disabled={isAsking}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <form className='esign-assistant__ask' onSubmit={(e) => { e.preventDefault(); ask(); }}>
                <input
                  className='esign-input'
                  placeholder='Ask about this document, e.g. “Can I have a pet?”'
                  aria-label='Ask a question about this document'
                  value={question}
                  maxLength={500}
                  onChange={(e) => setQuestion(e.target.value)}
                />
                <button type='submit' className='esign-assistant__send' disabled={isAsking || !question.trim()}>
                  {isAsking ? 'Thinking…' : 'Ask'}
                </button>
              </form>
              <p className='esign-assistant__meta'>
                {questionsLeft} {questionsLeft === 1 ? 'question' : 'questions'} left
              </p>
            </>
          ) : (
            <p className='esign-assistant__meta'>You’ve used all your questions. For anything else, ask the sender.</p>
          )}
          {askError && <p className='esign-assistant__error' role='alert'>{askError}</p>}
          <p className='esign-assistant__disclaimer'>
            AI answers come from this document and can make mistakes; check the pages they mention. They aren’t
            legal advice.
          </p>
        </div>
      )}
    </section>
  );
};

export default SigningAssistant;
