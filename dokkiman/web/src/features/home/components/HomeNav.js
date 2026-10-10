/**
 * Home Nav
 * Top bar of the public pages: the logo, the Features menu (every tool, linking
 * to its public page), the Solutions menu (by business size and by industry)
 * and Pricing on the left; Support (the /support page) and the account buttons
 * on the right. The menus' links are always in the page, so search engines can
 * follow them; the menus just show or hide them.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../../shared/components/Icon';
import LogoMark from '../../../shared/components/LogoMark';
import TOOL_PAGES from '../../../seo/toolPages.json';
import SOLUTION_PAGES from '../../../seo/solutionPages.json';

// A menu in the top bar: opens when pointed at or clicked; closes when the
// pointer leaves, on a click elsewhere, with Escape, or when a link is chosen
const NavMenu = ({ id, label, wide = false, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  // Pointing at the label opens the menu; a click just after that shouldn't close it again
  const hoverOpenedAt = useRef(0);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointer = (e) => {
      if (!menuRef.current?.contains(e.target)) setIsOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  return (
    <div className={`home-nav__menu ${wide ? 'home-nav__menu--wide' : ''}`} ref={menuRef}
      onMouseLeave={() => setIsOpen(false)}>
      <button
        type='button'
        className='home-nav__menu-button'
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={() => {
          if (Date.now() - hoverOpenedAt.current < 500) setIsOpen(true);
          else setIsOpen((open) => !open);
        }}
        onMouseEnter={() => {
          if (!isOpen) hoverOpenedAt.current = Date.now();
          setIsOpen(true);
        }}
      >
        {label}
        <Icon name='chevronDown' size={16} />
      </button>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div id={id} className={`home-nav__dropdown ${isOpen ? 'home-nav__dropdown--open' : ''}`}
        onClick={(e) => e.target.closest('a') && setIsOpen(false)}>
        {children}
      </div>
    </div>
  );
};

const FeaturesMenu = () => (
  <NavMenu id='home-nav-features' label='Features'>
    <ul aria-label='Tools' className='home-nav__tools'>
      {TOOL_PAGES.map((page) => (
        <li key={page.path}>
          <Link to={page.path} className='home-nav__tool'>
            <span className='home-nav__tool-icon' aria-hidden='true'><Icon name={page.icon} size={18} /></span>
            {page.name}
          </Link>
        </li>
      ))}
    </ul>
  </NavMenu>
);

const SOLUTION_GROUPS = [['size', 'By business size'], ['industry', 'By industry']];

const SolutionsMenu = ({ isLoggedIn, onSignup }) => (
  <NavMenu id='home-nav-solutions' label='Solutions' wide>
    <div className='home-nav__mega'>
      <div className='home-nav__mega-intro'>
        <p className='home-nav__mega-title'>Solutions</p>
        <p>See how Dokkiman helps people and businesses get paperwork done faster, from contracts to tax forms.</p>
      </div>
      {SOLUTION_GROUPS.map(([group, title]) => (
        <div key={group} className='home-nav__mega-col'>
          <p className='home-nav__mega-heading'>{title}</p>
          <ul aria-label={title}>
            {SOLUTION_PAGES.filter((p) => p.group === group).map((page) => (
              <li key={page.path}><Link to={page.path}>{page.name}</Link></li>
            ))}
          </ul>
          {group === 'industry' && (
            <Link to='/solutions' className='home-nav__mega-all'>
              All solutions <Icon name='chevronRight' size={16} />
            </Link>
          )}
        </div>
      ))}
      {/* The free trial is for visitors; signed-in people already have an account */}
      {!isLoggedIn && (
        <div className='home-nav__mega-promo'>
          <p className='home-nav__mega-title'>Try every tool free</p>
          <ul>
            <li><Icon name='check' size={16} /> Free for 30 days, no credit card</li>
            <li><Icon name='check' size={16} /> An audit trail on every signature</li>
            <li><Icon name='check' size={16} /> Files you only edit or convert aren&apos;t kept</li>
          </ul>
          <button type='button' className='home-btn home-btn--primary' onClick={onSignup}>Try it free</button>
        </div>
      )}
    </div>
  </NavMenu>
);

const HomeNav = ({ onLogin, onSignup, isLoggedIn = false, onOpenApp }) => (
  <header className='home-nav'>
    <div className='home-nav__inner'>
      <Link to='/' className='home-nav__brand' aria-label='Dokkiman home'>
        <span className='home-nav__logo'>
          <LogoMark size={18} />
        </span>
        <span className='home-nav__name'>Dokkiman</span>
      </Link>
      <nav className='home-nav__links' aria-label='Main'>
        <FeaturesMenu />
        <SolutionsMenu isLoggedIn={isLoggedIn} onSignup={onSignup} />
        <Link to='/pricing'>Pricing</Link>
      </nav>
      <div className='home-nav__actions'>
        {/* Phones and tablets: the links above are hidden, Pricing is here */}
        <Link to='/pricing' className='home-nav__pricing'>Pricing</Link>
        <Link to='/support' className='home-nav__support'>Support</Link>
        {isLoggedIn ? (
          <button type='button' className='home-btn home-btn--primary' onClick={onOpenApp}>
            Open the app
          </button>
        ) : (
          <>
            <button type='button' className='home-btn home-btn--text' onClick={onLogin}>
              Log in
            </button>
            <button type='button' className='home-btn home-btn--primary' onClick={onSignup}>
              Start free trial
            </button>
          </>
        )}
      </div>
    </div>
  </header>
);

export default HomeNav;
