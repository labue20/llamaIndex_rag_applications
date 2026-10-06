import { fireEvent, render, screen, within } from '@testing-library/react';
import HomePage from './HomePage';
import { mockFetch } from '../../../test-utils/mockFetch';

const renderHome = () => {
  const onLogin = jest.fn();
  const onSignup = jest.fn();
  render(<HomePage onLogin={onLogin} onSignup={onSignup} />);
  return { onLogin, onSignup };
};

const toolCards = () => within(screen.getByRole('region', { name: 'Our tools' })).getAllByRole('button');

test('lists every tool', () => {
  mockFetch({});
  renderHome();
  const cards = toolCards();
  expect(cards).toHaveLength(5);
  ['Chat with PDF', 'PDF to Word', 'Word to PDF', 'Split PDF', 'Document Manager'].forEach((title, i) => {
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
  fireEvent.click(toolCards()[0]);
  expect(onSignup).toHaveBeenCalledTimes(2);
});

test('explore the tools scrolls to the tool grid', () => {
  mockFetch({});
  renderHome();
  const scrollIntoView = jest.fn();
  Element.prototype.scrollIntoView = scrollIntoView;

  fireEvent.click(screen.getByRole('button', { name: 'Explore the tools' }));
  expect(scrollIntoView).toHaveBeenCalled();
});
