/**
 * After `npm run build`: give each public page its own HTML file, and write
 * the sitemap.
 *
 * The app is built in the browser, so every address starts from the same
 * index.html. Search engines and link previews (WhatsApp, LinkedIn, Slack...)
 * read that first HTML, so each public page in src/seo/pages.json gets a copy
 * with its own title, description and address: build/pricing/index.html for
 * /pricing, and so on. The tool pages (src/seo/toolPages.json) also get their
 * content: the ToolPage component, rendered here, so search engines read the
 * words without running the app. The web server serves these files (see
 * deploy/Caddyfile).
 */

const fs = require('fs');
const Module = require('module');
const path = require('path');
const seo = require('../src/seo/pages.json');
const TOOL_PAGES = require('../src/seo/toolPages.json');
const SOLUTION_PAGES = require('../src/seo/solutionPages.json');

const SRC = path.join(__dirname, '..', 'src');

/** Load the app's components here: compile src/ with the app's Babel setup, skip styles. */
const loadAppModule = (file) => {
  process.env.BABEL_ENV = process.env.BABEL_ENV || 'test'; // CommonJS for Node
  const babel = require('@babel/core');
  const compileJs = Module._extensions['.js'];
  Module._extensions['.js'] = (module, filename) => {
    if (!filename.startsWith(SRC)) return compileJs(module, filename);
    const { code } = babel.transformFileSync(filename, {
      presets: [[require.resolve('babel-preset-react-app'), { runtime: 'automatic' }]], babelrc: false, configFile: false,
    });
    return module._compile(code, filename);
  };
  Module._extensions['.scss'] = () => {};
  Module._extensions['.css'] = () => {};
  return require(path.join(SRC, file));
};

/** A page component's content as HTML at this address, as the app first shows it. */
const renderPage = (file, path, props = {}) => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { StaticRouter } = require('react-router-dom');
  const Component = loadAppModule(file).default;
  return renderToStaticMarkup(React.createElement(StaticRouter, { location: path }, React.createElement(Component, props)));
};

const renderToolPage = (page) => renderPage('features/tool-pages/components/ToolPage.js', page.path, { page });
const renderSolutionPage = (page) => renderPage('features/solutions/components/SolutionPage.js', page.path, { page });

// Pages in pages.json whose content is rendered too
const PAGE_CONTENT = {
  '/solutions': () => renderPage('features/solutions/components/SolutionsIndexPage.js', '/solutions'),
};

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
  if (page.content) {
    out = replaceOne(out, /(<div id="root">)(<\/div>)/, page.content, 'root');
    // The page reads fine without JavaScript, so drop the "enable JavaScript" notice
    out = out.replace(/<noscript>[\s\S]*?<\/noscript>/, '');
  }
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
  const pages = [
    ...seo.pages.map((page) => (PAGE_CONTENT[page.path] ? { ...page, content: PAGE_CONTENT[page.path]() } : page)),
    ...TOOL_PAGES.map((page) => ({ ...page, content: renderToolPage(page) })),
    ...SOLUTION_PAGES.map((page) => ({ ...page, content: renderSolutionPage(page) })),
  ];
  for (const page of pages) {
    const file = page.path === '/'
      ? path.join(buildDir, 'index.html')
      : path.join(buildDir, page.path.replace(/^\//, ''), 'index.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, htmlForPage(html, page));
  }
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(buildDir, 'sitemap.xml'), sitemap(pages, today));
  console.log(`seo.js: wrote ${pages.length} pages and sitemap.xml`);
};

// BUILD_PATH: where react-scripts put the build, if not build/
if (require.main === module) run(path.resolve(process.env.BUILD_PATH || path.join(__dirname, '..', 'build')));

module.exports = { htmlForPage, renderToolPage, renderSolutionPage, sitemap, run };
