import { render } from '@testing-library/react';
import MessageMarkdown from './MessageMarkdown';

const renderMarkdown = (text) => render(<MessageMarkdown text={text} />).container;

test('renders headings, paragraphs and inline formatting', () => {
  const container = renderMarkdown('## Summary\nPage 7 covers **income** and *credits*.\nSee `line 9`.');

  expect(container.querySelector('h4')).toHaveTextContent('Summary');
  expect(container.querySelector('strong')).toHaveTextContent('income');
  expect(container.querySelector('em')).toHaveTextContent('credits');
  expect(container.querySelector('code')).toHaveTextContent('line 9');
  // Single line breaks are kept within a paragraph
  expect(container.querySelector('p br')).not.toBeNull();
});

test('renders bulleted and numbered lists', () => {
  const container = renderMarkdown('- first\n* second\n• third\n\n1. one\n2) two');
  expect([...container.querySelectorAll('ul li')].map((li) => li.textContent)).toEqual(['first', 'second', 'third']);
  expect([...container.querySelectorAll('ol li')].map((li) => li.textContent)).toEqual(['one', 'two']);
});

test('joins indented continuation lines onto the list item', () => {
  const container = renderMarkdown('- a long item\n  that continues here');
  expect(container.querySelector('li')).toHaveTextContent('a long item that continues here');
});

test('shows HTML as text instead of running it', () => {
  const container = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)>');
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(container).toHaveTextContent('<script>alert(1)</script>');
});

test('handles empty text', () => {
  expect(renderMarkdown('').textContent).toBe('');
  expect(renderMarkdown(undefined).textContent).toBe('');
});
