import { fireEvent, render, screen, within } from '@testing-library/react';
import HomePage from './HomePage';
import { mockFetch } from '../../../test-utils/mockFetch';

const renderHome = () => {
  const onLogin = jest.fn();
  const onSignup = jest.fn();
  render(<HomePage onLogin={onLogin} onSignup={onSignup} />);
  return { onLogin, onSignup };
};

test('lists every tool', () => {
  mockFetch({});
  renderHome();
  const titles = [...document.querySelectorAll('.home-tool__title')].map((el) => el.textContent);
  expect(titles).toEqual(['Chat with PDFAI', 'PDF to Word', 'Word to PDF', 'Split PDF', 'Document Manager']);
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
  fireEvent.click(document.querySelector('.home-tool--chat'));
  expect(onSignup).toHaveBeenCalledTimes(2);
});

test('explore the tools scrolls to the tool grid', () => {
  mockFetch({});
  renderHome();
  const scrollIntoView = jest.fn();
  document.getElementById('tools').scrollIntoView = scrollIntoView;

  fireEvent.click(screen.getByRole('button', { name: 'Explore the tools' }));
  expect(scrollIntoView).toHaveBeenCalled();
});
