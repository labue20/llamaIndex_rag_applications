/**
 * After `npm run build`: give each public page its own HTML file, and write
 * the sitemap.
 *
 * The app is built in the browser, so every address starts from the same
 * index.html. Search engines and link previews (WhatsApp, LinkedIn, Slack...)
 * read that first HTML, so each public page in src/seo/pages.json gets a copy
 * with its own title, description and address: build/pricing/index.html for
 * /pricing, and so on. The web server serves those (see deploy/Caddyfile).
 */

const fs = require('fs');
const path = require('path');
const seo = require('../src/seo/pages.json');

const escapeAttr = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Replace one tag's value; fail the build if the tag isn't there
const replaceOne = (html, pattern, value, what) => {
  if (!pattern.test(html)) throw new Error(`seo.js: ${what} not found in index.html`);
  return html.replace(pattern, (_, before, after) => `${before}${value}${after}`);
};

const pageUrl = (pagePath) => `${seo.siteUrl}${pagePath}`;

/** index.html with the given page's title, description and address. */
const htmlForPage = (html, page) => {
  const title = escapeAttr(page.title);
  const description = escapeAttr(page.description);
  const url = escapeAttr(pageUrl(page.path));
  let out = html;
  out = replaceOne(out, /(<title>)[^<]*(<\/title>)/, title, 'title');
  out = replaceOne(out, /(<meta name="description" content=")[^"]*(")/, description, 'description');
  out = replaceOne(out, /(<link rel="canonical" href=")[^"]*(")/, url, 'canonical');
  out = replaceOne(out, /(<meta property="og:url" content=")[^"]*(")/, url, 'og:url');
  out = replaceOne(out, /(<meta property="og:title" content=")[^"]*(")/, title, 'og:title');
  out = replaceOne(out, /(<meta property="og:description" content=")[^"]*(")/, description, 'og:description');
  out = replaceOne(out, /(<meta name="twitter:title" content=")[^"]*(")/, title, 'twitter:title');
  out = replaceOne(out, /(<meta name="twitter:description" content=")[^"]*(")/, description, 'twitter:description');
  // The app's structured data describes the homepage
  if (page.path !== '/') {
    out = out.replace(/<script type="application\/ld\+json" id="structured-data">[\s\S]*?<\/script>/, '');
  }
  return out;
};

const sitemap = (pages, date) => [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...pages.map((page) => `  <url><loc>${escapeAttr(pageUrl(page.path))}</loc><lastmod>${date}</lastmod></url>`),
  '</urlset>',
  '',
].join('\n');

const run = (buildDir) => {
  const html = fs.readFileSync(path.join(buildDir, 'index.html'), 'utf8');
  for (const page of seo.pages) {
    const file = page.path === '/'
      ? path.join(buildDir, 'index.html')
      : path.join(buildDir, page.path.replace(/^\//, ''), 'index.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, htmlForPage(html, page));
  }
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(buildDir, 'sitemap.xml'), sitemap(seo.pages, today));
  console.log(`seo.js: wrote ${seo.pages.length} pages and sitemap.xml`);
};

// BUILD_PATH: where react-scripts put the build, if not build/
if (require.main === module) run(path.resolve(process.env.BUILD_PATH || path.join(__dirname, '..', 'build')));

module.exports = { htmlForPage, sitemap, run };
