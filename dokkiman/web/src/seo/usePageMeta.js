/**
 * Keep the title, description and canonical address in step with the public
 * page being shown (src/seo/pages.json), as people move around the site. The
 * first visit gets them from the page's own HTML (scripts/seo.js).
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import seo from './pages.json';

const setAttribute = (selector, name, value) => {
  document.head.querySelector(selector)?.setAttribute(name, value);
};

const usePageMeta = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    const page = seo.pages.find((p) => p.path === pathname);
    if (!page) return;
    document.title = page.title;
    setAttribute('meta[name="description"]', 'content', page.description);
    setAttribute('link[rel="canonical"]', 'href', `${seo.siteUrl}${page.path}`);
  }, [pathname]);
};

export default usePageMeta;
