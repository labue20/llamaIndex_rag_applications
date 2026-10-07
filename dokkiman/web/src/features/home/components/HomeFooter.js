/**
 * Home Footer
 * Footer of the public pages: tools, account and legal links, copyright
 */

import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../../shared/components/Icon';
import { TOOLS } from '../tools';

const HomeFooter = ({ onLogin, onSignup, onOpenTool }) => (
  <footer className='home-footer'>
    <div className='home-footer__inner'>
      <div className='home-footer__brand'>
        <span className='home-nav__logo'>
          <Icon name='layers' size={16} />
        </span>
        <div>
          <strong>Dokkiman</strong>
          <p>Chat with and convert your PDFs.</p>
        </div>
      </div>
      <div className='home-footer__col'>
        <h4>Tools</h4>
        {TOOLS.map((tool) => (
          <button key={tool.id} type='button' onClick={() => onOpenTool(tool.id)}>
            {tool.title}
          </button>
        ))}
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
