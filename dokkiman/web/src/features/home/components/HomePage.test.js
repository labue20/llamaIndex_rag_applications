import { fireEvent, screen, within } from '@testing-library/react';
import HomePage from './HomePage';
import { mockFetch } from '../../../test-utils/mockFetch';
import { renderAt } from '../../../test-utils/router';

const renderHome = () => {
  const onLogin = jest.fn();
  const onSignup = jest.fn();
  const onTryTool = jest.fn();
  renderAt(<HomePage onLogin={onLogin} onSignup={onSignup} onTryTool={onTryTool} />);
  return { onLogin, onSignup, onTryTool };
};

const toolCards = () => within(screen.getByRole('region', { name: 'Our tools' })).getAllByRole('button');

test('lists every tool', () => {
  mockFetch({});
  renderHome();
  const cards = toolCards();
  expect(cards).toHaveLength(8);
  ['Chat with PDF', 'PDF to Word', 'Word to PDF', 'Split PDF', 'Compress PDF', 'Edit PDF', 'E-Sign', 'Document Manager'].forEach((title, i) => {
    expect(cards[i]).toHaveTextContent(title);
  });
});

test('the top bar links to each tool’s public page', () => {
  mockFetch({});
  renderHome();
  const links = within(screen.getByRole('navigation', { name: 'Tools' })).getAllByRole('link');
  expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
    ['Chat with PDF', '/chat-with-pdf'],
    ['PDF to Word', '/pdf-to-word'],
    ['Word to PDF', '/word-to-pdf'],
    ['Split PDF', '/split-pdf'],
    ['Compress PDF', '/compress-pdf'],
    ['Edit PDF', '/edit-pdf'],
    ['E-Sign', '/sign-pdf'],
  ]);
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

  fireEvent.click(cards[4]); // Compress PDF
  expect(onTryTool).toHaveBeenLastCalledWith('compress');
  fireEvent.click(cards[5]); // Edit PDF
  expect(onTryTool).toHaveBeenLastCalledWith('edit');
  fireEvent.click(cards[6]); // E-Sign
  expect(onTryTool).toHaveBeenLastCalledWith('sign');

  fireEvent.click(cards[7]); // Document Manager
  expect(onSignup).toHaveBeenCalledTimes(1);
});
