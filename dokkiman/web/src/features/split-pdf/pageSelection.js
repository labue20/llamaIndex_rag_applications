/**
 * Page ranges as typed ("1-3, 5") and as picked on the page previews. The
 * server checks the ranges properly; these only keep the previews and the
 * Pages box in step, so parts that aren't valid (yet) are skipped.
 */

const PART = /^(\d+)(?:\s*-\s*(\d+))?$/;

/** "1-3, 5" -> [[1, 3], [5, 5]], in the order typed. */
export const parseRanges = (spec, pageCount) => spec
  .split(',')
  .map((part) => part.trim().match(PART))
  .filter(Boolean)
  .map((match) => [Number(match[1]), Number(match[2] || match[1])])
  .filter(([start, end]) => start >= 1 && start <= end && end <= pageCount);

/** [[1, 3], [5, 5]] -> "1-3, 5" */
export const formatRanges = (ranges) => ranges
  .map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`))
  .join(', ');

/** Pages as the fewest ranges: [5, 1, 2, 3] -> [[1, 3], [5, 5]] */
export const pagesToRanges = (pages) => [...new Set(pages)].sort((a, b) => a - b).reduce((ranges, page) => {
  const last = ranges[ranges.length - 1];
  if (last && page === last[1] + 1) last[1] = page;
  else ranges.push([page, page]);
  return ranges;
}, []);

/**
 * Pick or unpick one page.
 * Extract (one file): the picked pages, as the fewest ranges.
 * Custom ranges (a file each): the other ranges stay as they are; a page taken
 * out splits its range, and a page added becomes a range of its own.
 */
export const togglePage = (ranges, page, mode) => {
  const index = ranges.findIndex(([start, end]) => page >= start && page <= end);
  if (mode === 'extract') {
    const pages = ranges.flatMap(([start, end]) => Array.from({ length: end - start + 1 }, (_, i) => start + i));
    return pagesToRanges(index >= 0 ? pages.filter((p) => p !== page) : [...pages, page]);
  }
  if (index >= 0) {
    const [start, end] = ranges[index];
    const rest = [];
    if (start < page) rest.push([start, page - 1]);
    if (page < end) rest.push([page + 1, end]);
    return [...ranges.slice(0, index), ...rest, ...ranges.slice(index + 1)];
  }
  return [...ranges, [page, page]].sort((a, b) => a[0] - b[0]);
};

/** Which part (1, 2...) each page goes into, for the previews' labels. */
export const partOfPage = (ranges) => {
  const parts = new Map();
  ranges.forEach(([start, end], index) => {
    for (let page = start; page <= end; page += 1) if (!parts.has(page)) parts.set(page, index + 1);
  });
  return parts;
};
