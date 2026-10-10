import { htmlForPage, renderSolutionPage as solutionPageHtml, renderToolPage as toolPageHtml, sitemap } from '../../scripts/seo';
import SOLUTION_PAGES from './solutionPages.json';
import TOOL_PAGES from './toolPages.json';

const INDEX = [
  '<head><title>Home</title><meta name="description" content="Home text"/>',
  '<link rel="canonical" href="https://dokkiman.com/"/>',
  '<meta property="og:url" content="https://dokkiman.com/"/><meta property="og:title" content="Home"/>',
  '<meta property="og:description" content="Home text"/><meta name="twitter:title" content="Home"/>',
  '<meta name="twitter:description" content="Home text"/>',
  '<script type="application/ld+json" id="structured-data">{"@type":"WebApplication"}</script></head>',
  '<body><noscript>You need to enable JavaScript to run this app.</noscript><div id="root"></div></body>',
].join('');

test('each page gets its own title, description, address and content', () => {
  const html = htmlForPage(INDEX, {
    path: '/compress-pdf', title: 'Compress "PDF"', description: 'Smaller & faster', content: '<h1>Compress</h1>',
  });
  expect(html).toContain('<title>Compress &quot;PDF&quot;</title>');
  expect(html).toContain('<meta name="description" content="Smaller &amp; faster"/>');
  expect(html).toContain('<link rel="canonical" href="https://dokkiman.com/compress-pdf"/>');
  expect(html).toContain('<meta property="og:url" content="https://dokkiman.com/compress-pdf"/>');
  expect(html).toContain('<div id="root"><h1>Compress</h1></div>');
  expect(html).not.toContain('enable JavaScript');
  // The structured data describes the homepage only
  expect(html).not.toContain('structured-data');
  expect(htmlForPage(INDEX, { path: '/', title: 'Home', description: 'Home text' })).toContain('structured-data');
});

test('a missing tag fails the build instead of shipping a wrong page', () => {
  expect(() => htmlForPage('<title>x</title>', { path: '/', title: 'a', description: 'b' })).toThrow(/description/);
});

test('tool pages are rendered to HTML with their content and links', () => {
  const html = toolPageHtml(TOOL_PAGES.find((p) => p.path === '/split-pdf'));
  expect(html).toContain('<h1 class="tool-hero__title">Split PDF</h1>');
  expect(html).toContain('How to split a PDF');
  expect(html).toContain('href="/merge-pdf"');
});

test('the sitemap lists every page', () => {
  const xml = sitemap([{ path: '/' }, { path: '/compress-pdf' }], '2026-10-09');
  expect(xml).toContain('<url><loc>https://dokkiman.com/compress-pdf</loc><lastmod>2026-10-09</lastmod></url>');
  expect(xml.match(/<url>/g)).toHaveLength(2);
});

test('solution pages are rendered to HTML with their jobs and tool links', () => {
  const html = solutionPageHtml(SOLUTION_PAGES.find((p) => p.path === '/solutions/legal'));
  expect(html).toContain('Document work for legal teams');
  expect(html).toContain('href="/edit-pdf"');
});
