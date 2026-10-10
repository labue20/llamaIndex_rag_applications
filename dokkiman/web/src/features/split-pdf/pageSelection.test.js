import { formatRanges, pagesToRanges, parseRanges, partOfPage, togglePage } from './pageSelection';

test('reads typed ranges, skipping parts that aren’t valid yet', () => {
  expect(parseRanges('1-3, 5', 10)).toEqual([[1, 3], [5, 5]]);
  expect(parseRanges('3, 1', 10)).toEqual([[3, 3], [1, 1]]);
  expect(parseRanges('1-, 4-2, 0, 12, x, 7-9', 10)).toEqual([[7, 9]]);
  expect(formatRanges([[1, 3], [5, 5]])).toBe('1-3, 5');
  expect(pagesToRanges([5, 1, 2, 3, 2])).toEqual([[1, 3], [5, 5]]);
});

test('extract: picked pages become the fewest ranges', () => {
  expect(togglePage([[1, 3]], 4, 'extract')).toEqual([[1, 4]]);
  expect(togglePage([[1, 4]], 2, 'extract')).toEqual([[1, 1], [3, 4]]);
  expect(togglePage([], 6, 'extract')).toEqual([[6, 6]]);
});

test('custom ranges: each range stays its own file', () => {
  // Adding a page next to a range doesn't merge it into that file
  expect(togglePage([[1, 3], [4, 6]], 8, 'ranges')).toEqual([[1, 3], [4, 6], [8, 8]]);
  // Taking a page out splits its range
  expect(togglePage([[1, 3], [4, 6]], 5, 'ranges')).toEqual([[1, 3], [4, 4], [6, 6]]);
  expect(partOfPage([[1, 3], [4, 6]]).get(5)).toBe(2);
});
