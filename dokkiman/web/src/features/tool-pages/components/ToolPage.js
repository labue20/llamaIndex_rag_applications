/**
 * Tool Page
 * A public page for one tool (/compress-pdf, /edit-pdf...), found through
 * search engines: what the tool does, a button to start with your files, how
 * to use it, what it can do, and common questions. The words come from
 * src/seo/toolPages.json. The build also renders this page into the page's
 * HTML (scripts/seo.js), so it mustn't use the browser while rendering.
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../../shared/components/Icon';
import HomeNav from '../../home/components/HomeNav';
import HomeFooter from '../../home/components/HomeFooter';
import TOOL_PAGES from '../../../seo/toolPages.json';
import '../../home/styles/home.scss';
import '../styles/tool-page.scss';

const ToolPage = ({ page, onOpen, onLogin, onSignup, onOpenApp, onOpenManager, isLoggedIn = false }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputId = `tool-page-file${page.path.replace(/\//g, '-')}`;
  const related = page.related.map((path) => TOOL_PAGES.find((p) => p.path === path)).filter(Boolean);

  const open = (fileList) => {
    const files = [...(fileList || [])];
    if (files.length) onOpen?.(page.multiple ? files : files.slice(0, 1));
  };

  return (
    <div className='home tool-page'>
      <HomeNav onLogin={onLogin} onSignup={onSignup} isLoggedIn={isLoggedIn} onOpenApp={onOpenApp} />

      <main>
        <section className='tool-hero'>
          <span className='tool-hero__icon' aria-hidden='true'>
            <Icon name={page.icon} size={28} />
          </span>
          <h1 className='tool-hero__title'>{page.h1}</h1>
          <p className='tool-hero__lead'>{page.lead}</p>

          {page.accept ? (
            <div
              className={`tool-drop ${isDragging ? 'tool-drop--active' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                open(e.dataTransfer.files);
              }}
            >
              <input
                type='file'
                id={inputId}
                className='tool-drop__input'
                accept={page.accept}
                multiple={!!page.multiple}
                onChange={(e) => {
                  open(e.target.files);
                  e.target.value = '';
                }}
              />
              <label htmlFor={inputId} className='home-btn home-btn--primary home-btn--large tool-drop__button'>
                <Icon name='upload' size={20} />
                {page.cta}
              </label>
              <p className='tool-drop__hint'>{page.hint} · or drop {page.multiple ? 'files' : 'a file'} here</p>
            </div>
          ) : (
            <div className='tool-drop'>
              <button type='button' className='home-btn home-btn--primary home-btn--large tool-drop__button'
                onClick={() => onOpen?.([])}>
                <Icon name='upload' size={20} />
                {page.cta}
              </button>
              <p className='tool-drop__hint'>{page.hint}</p>
            </div>
          )}
          {!isLoggedIn && (
            <p className='tool-hero__note'>
              <Icon name='lock' size={14} /> Free to try, no sign-up needed
            </p>
          )}
        </section>

        <section className='tool-section' aria-labelledby='tool-steps-title'>
          <h2 className='home-section-title' id='tool-steps-title'>{page.howTo}</h2>
          <ol className='tool-steps'>
            {page.steps.map((step, index) => (
              <li key={step.title} className='tool-steps__item'>
                <span className='tool-steps__number' aria-hidden='true'>{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className='tool-section tool-section--tinted' aria-labelledby='tool-features-title'>
          <h2 className='home-section-title' id='tool-features-title'>What you can do with {page.name}</h2>
          <div className='tool-features'>
            {page.features.map((feature) => (
              <div key={feature.title} className='tool-features__item'>
                <Icon name='check' size={18} />
                <div>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className='tool-section' aria-labelledby='tool-faq-title'>
          <h2 className='home-section-title' id='tool-faq-title'>Questions about {page.name}</h2>
          <div className='tool-faq'>
            {page.faqs.map((faq) => (
              <details key={faq.q} className='tool-faq__item'>
                <summary>{faq.q}</summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className='tool-section tool-section--tinted' aria-labelledby='tool-related-title'>
          <h2 className='home-section-title' id='tool-related-title'>More PDF tools</h2>
          <div className='tool-related'>
            {related.map((other) => (
              <Link key={other.path} to={other.path} className='tool-related__item'>
                <span className='tool-related__icon' aria-hidden='true'>
                  <Icon name={other.icon} size={20} />
                </span>
                <span>
                  <strong>{other.name}</strong>
                  <span className='tool-related__text'>{other.lead}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <HomeFooter onLogin={onLogin} onSignup={onSignup} onOpenTool={onOpenManager} isLoggedIn={isLoggedIn} />
    </div>
  );
};

export default ToolPage;
