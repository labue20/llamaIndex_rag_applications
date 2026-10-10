/**
 * Solutions (/solutions): every solution page, by business size and by industry.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../../shared/components/Icon';
import HomeNav from '../../home/components/HomeNav';
import HomeFooter from '../../home/components/HomeFooter';
import SOLUTION_PAGES from '../../../seo/solutionPages.json';
import '../../home/styles/home.scss';
import '../../tool-pages/styles/tool-page.scss';

export const SOLUTION_GROUPS = [
  { id: 'size', title: 'By business size' },
  { id: 'industry', title: 'By industry' },
];

const SolutionsIndexPage = ({ onLogin, onSignup, onOpenApp, onOpenManager, isLoggedIn = false }) => (
  <div className='home tool-page solution-page'>
    <HomeNav onLogin={onLogin} onSignup={onSignup} isLoggedIn={isLoggedIn} onOpenApp={onOpenApp} />
    <main>
      <section className='tool-hero'>
        <h1 className='tool-hero__title'>Solutions</h1>
        <p className='tool-hero__lead'>
          See how Dokkiman helps people and businesses get paperwork done faster: signing, forms, editing and
          finding answers in documents.
        </p>
      </section>
      {SOLUTION_GROUPS.map((group, i) => (
        <section key={group.id} className={`tool-section ${i % 2 ? 'tool-section--tinted' : ''}`}
          aria-labelledby={`solutions-${group.id}`}>
          <h2 className='home-section-title' id={`solutions-${group.id}`}>{group.title}</h2>
          <div className='tool-related'>
            {SOLUTION_PAGES.filter((p) => p.group === group.id).map((page) => (
              <Link key={page.path} to={page.path} className='tool-related__item'>
                <span className='tool-related__icon' aria-hidden='true'><Icon name={page.icon} size={20} /></span>
                <span>
                  <strong>{page.name}</strong>
                  <span className='tool-related__text'>{page.lead}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
    <HomeFooter onLogin={onLogin} onSignup={onSignup} onOpenTool={onOpenManager} isLoggedIn={isLoggedIn} />
  </div>
);

export default SolutionsIndexPage;
