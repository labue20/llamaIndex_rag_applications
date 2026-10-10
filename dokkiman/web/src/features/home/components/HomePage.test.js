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
  ['Chat with PDF', 'E-Sign', 'PDF to Word', 'Word to PDF', 'Split PDF', 'Compress PDF', 'Edit PDF', 'Document Manager'].forEach((title, i) => {
    expect(cards[i]).toHaveTextContent(title);
  });
});

test('the top bar has a Features menu with every tool, then Pricing', () => {
  mockFetch({});
  renderHome();
  const nav = screen.getByRole('navigation', { name: 'Main' });
  const features = within(nav).getByRole('button', { name: /Features/ });
  expect(features).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(features);
  expect(features).toHaveAttribute('aria-expanded', 'true');

  // Every tool's page, and nothing else from the tools in the bar itself
  const tools = within(nav).getByRole('list', { name: 'Tools' });
  expect(within(tools).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
    '/edit-pdf', '/sign-pdf', '/request-signatures', '/compress-pdf', '/merge-pdf', '/split-pdf', '/pdf-to-word', '/word-to-pdf', '/chat-with-pdf',
  ]);
  expect(within(nav).getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing');

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(features).toHaveAttribute('aria-expanded', 'false');
});

test('the Solutions menu lists solutions by business size and industry', () => {
  mockFetch({});
  renderHome();
  const nav = screen.getByRole('navigation', { name: 'Main' });
  fireEvent.click(within(nav).getByRole('button', { name: /Solutions/ }));
  const bySize = within(nav).getByRole('list', { name: 'By business size' });
  const byIndustry = within(nav).getByRole('list', { name: 'By industry' });
  expect(within(bySize).getAllByRole('link').map((l) => l.textContent)).toEqual(['Individuals & freelancers', 'Small businesses']);
  expect(within(byIndustry).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual([
    '/solutions/real-estate', '/solutions/legal', '/solutions/tax-accounting', '/solutions/human-resources',
    '/solutions/insurance',
  ]);
  expect(within(nav).getByRole('link', { name: /All solutions/ })).toHaveAttribute('href', '/solutions');
  expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Support' })).toHaveAttribute('href', '/support');
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
  fireEvent.click(cards[1]); // E-Sign
  expect(onTryTool).toHaveBeenLastCalledWith('sign');
  fireEvent.click(cards[2]); // PDF to Word
  expect(onTryTool).toHaveBeenLastCalledWith('pdf-word');
  fireEvent.click(cards[4]); // Split PDF
  expect(onTryTool).toHaveBeenLastCalledWith('split');
  fireEvent.click(cards[5]); // Compress PDF
  expect(onTryTool).toHaveBeenLastCalledWith('compress');
  fireEvent.click(cards[6]); // Edit PDF
  expect(onTryTool).toHaveBeenLastCalledWith('edit');

  fireEvent.click(cards[7]); // Document Manager
  expect(onSignup).toHaveBeenCalledTimes(1);
});

test('people who are signed in aren’t offered the free trial', () => {
  mockFetch({});
  renderAt(<HomePage isLoggedIn onOpenApp={jest.fn()} />);
  expect(screen.queryByText(/free trial/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/No credit card needed/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Open the app' }).length).toBeGreaterThan(0);
});

test('visitors are offered the free trial', async () => {
  mockFetch({});
  renderHome();
  expect(await screen.findByText(/day free trial · No credit card needed/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Try it free for/ })).toBeInTheDocument();
});
