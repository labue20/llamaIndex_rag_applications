/**
 * Solution Page (/solutions/real-estate, /solutions/legal...)
 * How Dokkiman helps one kind of user: the jobs they do (each linking to the
 * tool for it), why it fits, and common questions. The words come from
 * src/seo/solutionPages.json; the build also renders this page into its HTML
 * (scripts/seo.js), so it mustn't use the browser while rendering.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../../shared/components/Icon';
import HomeNav from '../../home/components/HomeNav';
import HomeFooter from '../../home/components/HomeFooter';
import TOOL_PAGES from '../../../seo/toolPages.json';
import '../../home/styles/home.scss';
import '../../tool-pages/styles/tool-page.scss';

const toolFor = (path) => TOOL_PAGES.find((p) => p.path === path);

const SolutionPage = ({ page, onLogin, onSignup, onOpenApp, onOpenManager, isLoggedIn = false }) => (
  <div className='home tool-page solution-page'>
    <HomeNav onLogin={onLogin} onSignup={onSignup} isLoggedIn={isLoggedIn} onOpenApp={onOpenApp} />
    <main>
      <section className='tool-hero'>
        <span className='tool-hero__eyebrow'>
          <Link to='/solutions'>Solutions</Link> · {page.name}
        </span>
        <h1 className='tool-hero__title'>{page.h1}</h1>
        <p className='tool-hero__lead'>{page.lead}</p>
        <div className='tool-hero__ctas'>
          {isLoggedIn ? (
            <button type='button' className='home-btn home-btn--primary home-btn--large' onClick={onOpenApp}>
              Open the app
            </button>
          ) : (
            <button type='button' className='home-btn home-btn--primary home-btn--large' onClick={onSignup}>
              Start free trial
            </button>
          )}
          <Link to='/pricing' className='home-btn home-btn--ghost home-btn--large'>See pricing</Link>
        </div>
      </section>

      <section className='tool-section' aria-labelledby='solution-jobs-title'>
        <h2 className='home-section-title' id='solution-jobs-title'>What you can get done</h2>
        <div className='tool-related tool-related--pairs'>
          {page.jobs.map((job) => {
            const tool = toolFor(job.tool);
            return (
              <Link key={job.title} to={job.tool} className='tool-related__item'>
                <span className='tool-related__icon' aria-hidden='true'><Icon name={tool?.icon || 'file'} size={20} /></span>
                <span>
                  <strong>{job.title}</strong>
                  <span className='tool-related__text'>{job.text}</span>
                  {tool && <span className='solution-page__tool'>{tool.name} →</span>}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className='tool-section tool-section--tinted' aria-labelledby='solution-why-title'>
        <h2 className='home-section-title' id='solution-why-title'>Why Dokkiman</h2>
        <div className='tool-features tool-features--row'>
          {page.benefits.map((benefit) => (
            <div key={benefit.title} className='tool-features__item'>
              <Icon name='check' size={18} />
              <div>
                <h3>{benefit.title}</h3>
                <p>{benefit.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className='tool-section' aria-labelledby='solution-faq-title'>
        <h2 className='home-section-title' id='solution-faq-title'>Questions</h2>
        <div className='tool-faq'>
          {page.faqs.map((faq) => (
            <details key={faq.q} className='tool-faq__item'>
              <summary>{faq.q}</summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
    <HomeFooter onLogin={onLogin} onSignup={onSignup} onOpenTool={onOpenManager} isLoggedIn={isLoggedIn} />
  </div>
);

export default SolutionPage;
