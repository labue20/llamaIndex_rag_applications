import { fireEvent, render, screen, within } from '@testing-library/react';
import HomePage from './HomePage';
import { mockFetch } from '../../../test-utils/mockFetch';

const renderHome = () => {
  const onLogin = jest.fn();
  const onSignup = jest.fn();
  const onTryTool = jest.fn();
  render(<HomePage onLogin={onLogin} onSignup={onSignup} onTryTool={onTryTool} />);
  return { onLogin, onSignup, onTryTool };
};

const toolCards = () => within(screen.getByRole('region', { name: 'Our tools' })).getAllByRole('button');

test('lists every tool', () => {
  mockFetch({});
  renderHome();
  const cards = toolCards();
  expect(cards).toHaveLength(6);
  ['Chat with PDF', 'PDF to Word', 'Word to PDF', 'Split PDF', 'Sign PDF', 'Document Manager'].forEach((title, i) => {
    expect(cards[i]).toHaveTextContent(title);
  });
});

test('shows the trial terms from the server', async () => {
  mockFetch({ '/plans': { body: { trial_days: 14, trial_max_documents: 5, trial_max_questions_per_day: 20 } } });
  renderHome();

  expect(await screen.findByText(/14-day free trial · No credit card needed/)).toBeInTheDocument();
  expect(screen.getByText(/up to 5 documents and 20 questions a day/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Try it free for 14 days' })).toBeInTheDocument();
});

test('log in and trial buttons call the right handlers', () => {
  mockFetch({});
  const { onLogin, onSignup } = renderHome();
  const nav = screen.getByRole('banner');

  fireEvent.click(within(nav).getByRole('button', { name: 'Log in' }));
  expect(onLogin).toHaveBeenCalledTimes(1);

  fireEvent.click(within(nav).getByRole('button', { name: 'Start free trial' }));
  expect(onSignup).toHaveBeenCalledTimes(1);
});

test('tools can be tried without signing up; the Document Manager needs an account', () => {
  mockFetch({});
  const { onSignup, onTryTool } = renderHome();

  fireEvent.click(screen.getByRole('button', { name: 'Try it now, no sign-up' }));
  expect(onTryTool).toHaveBeenLastCalledWith('chat');

  const cards = toolCards();
  fireEvent.click(cards[1]); // PDF to Word
  expect(onTryTool).toHaveBeenLastCalledWith('pdf-word');
  fireEvent.click(cards[3]); // Split PDF
  expect(onTryTool).toHaveBeenLastCalledWith('split');

  fireEvent.click(cards[4]); // Sign PDF
  expect(onTryTool).toHaveBeenLastCalledWith('sign');

  fireEvent.click(cards[5]); // Document Manager
  expect(onSignup).toHaveBeenCalledTimes(1);
});
