/**
 * Home Nav
 * Top bar of the public pages: logo and tools on the left; Pricing and the
 * account buttons on the right
 */

import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../../shared/components/Icon';
import { TRYABLE_TOOLS } from '../tools';

const HomeNav = ({ onLogin, onSignup, onOpenTool, isLoggedIn = false, onOpenApp }) => (
  <header className='home-nav'>
    <div className='home-nav__inner'>
      <Link to='/' className='home-nav__brand' aria-label='RAG Web Application home'>
        <span className='home-nav__logo'>
          <Icon name='layers' size={18} />
        </span>
        <span className='home-nav__name'>RAG Web Application</span>
      </Link>
      <nav className='home-nav__links' aria-label='Tools'>
        {TRYABLE_TOOLS.map((tool) => (
          <button key={tool.id} type='button' onClick={() => onOpenTool(tool.id)}>
            {tool.title}
          </button>
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
