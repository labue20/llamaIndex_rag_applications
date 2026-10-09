/**
 * Home Footer
 * Footer of the public pages: tools, account and legal links, copyright
 */

import React from 'react';
import { Link } from 'react-router-dom';
import LogoMark from '../../../shared/components/LogoMark';
import TOOL_PAGES from '../../../seo/toolPages.json';

const HomeFooter = ({ onLogin, onSignup, onOpenTool }) => (
  <footer className='home-footer'>
    <div className='home-footer__inner'>
      <div className='home-footer__brand'>
        <span className='home-nav__logo'>
          <LogoMark size={16} />
        </span>
        <div>
          <strong>Dokkiman</strong>
          <p>Edit, sign, convert and chat with your PDFs.</p>
        </div>
      </div>
      <div className='home-footer__col'>
        <h4>Tools</h4>
        {TOOL_PAGES.map((page) => (
          <Link key={page.path} to={page.path}>{page.name}</Link>
        ))}
        <button type='button' onClick={() => onOpenTool('manager')}>Document Manager</button>
      </div>
      <div className='home-footer__col'>
        <h4>Account</h4>
        <button type='button' onClick={onLogin}>Log in</button>
        <button type='button' onClick={onSignup}>Start free trial</button>
        <Link to='/pricing'>Pricing</Link>
      </div>
      <div className='home-footer__col'>
        <h4>Legal</h4>
        <Link to='/privacy'>Privacy Policy</Link>
        <Link to='/terms'>Terms of Service</Link>
      </div>
    </div>
    <div className='home-footer__bottom'>
      <p>&copy; {new Date().getFullYear()} Dokkiman. All rights reserved.</p>
      <p className='home-footer__legal'>
        <Link to='/privacy'>Privacy Policy</Link>
        <span aria-hidden='true'>•</span>
        <Link to='/terms'>Terms of Service</Link>
      </p>
    </div>
  </footer>
);

export default HomeFooter;
