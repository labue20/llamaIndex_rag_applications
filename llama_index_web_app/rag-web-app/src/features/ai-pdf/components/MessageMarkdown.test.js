import { render, screen, within } from '@testing-library/react';
import MessageMarkdown from './MessageMarkdown';

test('renders headings, paragraphs and inline formatting', () => {
  render(<MessageMarkdown text={'## Summary\nPage 7 covers **income** and *credits*.\nSee `line 9`.'} />);

  expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
  expect(screen.getByText('income').tagName).toBe('STRONG');
  expect(screen.getByText('credits').tagName).toBe('EM');
  expect(screen.getByText('line 9').tagName).toBe('CODE');
  // Single line breaks are kept within one paragraph
  const paragraph = screen.getByText((_, element) => element.tagName === 'P');
  expect(paragraph).toHaveTextContent(/^Page 7 covers income and credits\.\s*See line 9\.$/);
  expect(paragraph).toContainHTML('<br>');
});

test('renders bulleted and numbered lists', () => {
  render(<MessageMarkdown text={'- first\n* second\n• third\n\n1. one\n2) two'} />);
  const [bullets, numbered] = screen.getAllByRole('list');

  expect(bullets.tagName).toBe('UL');
  expect(within(bullets).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['first', 'second', 'third']);
  expect(numbered.tagName).toBe('OL');
  expect(within(numbered).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['one', 'two']);
});

test('joins indented continuation lines onto the list item', () => {
  render(<MessageMarkdown text={'- a long item\n  that continues here'} />);
  expect(screen.getByRole('listitem')).toHaveTextContent('a long item that continues here');
});

test('shows HTML as text instead of running it', () => {
  render(<MessageMarkdown text='<script>alert(1)</script> <img src=x onerror=alert(1)>' />);
  const paragraph = screen.getByText(/<script>alert\(1\)<\/script>/);

  expect(paragraph).not.toContainHTML('<script>');
  expect(screen.queryByRole('img')).toBeNull();
});

test('handles empty text', () => {
  render(<MessageMarkdown text='' />);
  render(<MessageMarkdown text={undefined} />);
  expect(screen.queryByText(/./)).toBeNull();
});
