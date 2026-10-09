/**
 * Home Nav
 * Top bar of the public pages: logo and tools on the left; Pricing and the
 * account buttons on the right. The tools link to their public pages.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import LogoMark from '../../../shared/components/LogoMark';
import { TRYABLE_TOOLS } from '../tools';

const HomeNav = ({ onLogin, onSignup, isLoggedIn = false, onOpenApp }) => (
  <header className='home-nav'>
    <div className='home-nav__inner'>
      <Link to='/' className='home-nav__brand' aria-label='Dokkiman home'>
        <span className='home-nav__logo'>
          <LogoMark size={18} />
        </span>
        <span className='home-nav__name'>Dokkiman</span>
      </Link>
      <nav className='home-nav__links' aria-label='Tools'>
        {TRYABLE_TOOLS.map((tool) => (
          <Link key={tool.id} to={tool.page}>{tool.title}</Link>
        ))}
      </nav>
      <div className='home-nav__actions'>
        <Link to='/pricing' className='home-nav__pricing'>Pricing</Link>
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
