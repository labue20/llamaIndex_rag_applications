/**
 * Message Markdown Component
 * Renders the small subset of Markdown that chat answers use (headings, lists,
 * paragraphs, **bold**, *italic*, `code`) as React elements - no raw HTML.
 */

import React from 'react';

const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

const renderInline = (text, keyPrefix) =>
  text.split(INLINE_RE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (/^(\*\*|__).+\1$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (/^`.+`$/.test(part)) return <code key={key}>{part.slice(1, -1)}</code>;
    if (/^([*_]).+\1$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>;
    return part;
  });

// Render a paragraph, keeping single line breaks
const renderLines = (lines, keyPrefix) =>
  lines.flatMap((line, i) => [
    i > 0 ? <br key={`${keyPrefix}-br-${i}`} /> : null,
    ...renderInline(line, `${keyPrefix}-${i}`),
  ]);

const UL_RE = /^\s*[-*•]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const HEADING_RE = /^\s*#{1,6}\s+(.*)$/;

const parseBlocks = (text) => {
  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'p', lines: paragraph });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  text.split('\n').forEach((line) => {
    const ul = line.match(UL_RE);
    const ol = !ul && line.match(OL_RE);
    const heading = line.match(HEADING_RE);

    if (ul || ol) {
      flushParagraph();
      const type = ul ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((ul || ol)[1]);
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'h', text: heading[1] });
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (list && /^\s{2,}\S/.test(line)) {
      // Indented continuation of the previous list item
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      flushList();
      paragraph.push(line);
    }
  });
  flushParagraph();
  flushList();
  return blocks;
};

const MessageMarkdown = ({ text }) => (
  <div className='pdf-chat__markdown'>
    {parseBlocks(text || '').map((block, i) => {
      const key = `b-${i}`;
      if (block.type === 'h') return <h4 key={key}>{renderInline(block.text, key)}</h4>;
      if (block.type === 'p') return <p key={key}>{renderLines(block.lines, key)}</p>;
      const List = block.type;
      return (
        <List key={key}>
          {block.items.map((item, j) => (
            <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
          ))}
        </List>
      );
    })}
  </div>
);

export default MessageMarkdown;
