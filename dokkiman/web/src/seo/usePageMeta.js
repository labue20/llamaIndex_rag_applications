/**
 * Keep the title, description and canonical address in step with the public
 * page being shown (src/seo/pages.json and toolPages.json) as people move
 * around the site, and start each page at the top (a link in the footer would
 * otherwise open the next page scrolled to its footer). The first visit gets
 * them from the page's own HTML (scripts/seo.js).
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import seo from './pages.json';
import TOOL_PAGES from './toolPages.json';
import SOLUTION_PAGES from './solutionPages.json';

const setAttribute = (selector, name, value) => {
  document.head.querySelector(selector)?.setAttribute(name, value);
};

const usePageMeta = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    const page = [...seo.pages, ...TOOL_PAGES, ...SOLUTION_PAGES].find((p) => p.path === pathname);
    if (!page) return;
    document.title = page.title;
    setAttribute('meta[name="description"]', 'content', page.description);
    setAttribute('link[rel="canonical"]', 'href', `${seo.siteUrl}${page.path}`);
    window.scrollTo?.(0, 0);
  }, [pathname]);
};

export default usePageMeta;
