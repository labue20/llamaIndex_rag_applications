/**
 * Footer Component
 * Copyright and links shown at the bottom of every page
 */

import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className='app-footer'>
      <p className='app-footer__copyright'>
        &copy; {new Date().getFullYear()} Dokkiman. All rights reserved.
      </p>
      <p className='app-footer__links'>
        <Link to='/privacy'>Privacy Policy</Link>
        <span aria-hidden='true'>•</span>
        <Link to='/terms'>Terms of Service</Link>
        <span aria-hidden='true'>•</span>
        <Link to='/support'>Contact Us</Link>
      </p>
    </footer>
  );
};

export default Footer;
