/**
 * Footer Component
 * Copyright and links shown at the bottom of every page
 */

import { Link } from 'react-router-dom';
import { usePlanInfo } from '../../features/auth';

const Footer = () => {
  const { support_email: supportEmail } = usePlanInfo();

  return (
    <footer className='app-footer'>
      <p className='app-footer__copyright'>
        &copy; {new Date().getFullYear()} LlamaIndex RAG Applications. All rights reserved.
      </p>
      <p className='app-footer__links'>
        <Link to='/privacy'>Privacy Policy</Link>
        <span aria-hidden='true'>•</span>
        <Link to='/terms'>Terms of Service</Link>
        {supportEmail && (
          <>
            <span aria-hidden='true'>•</span>
            <a href={`mailto:${supportEmail}`}>Contact Us</a>
          </>
        )}
      </p>
    </footer>
  );
};

export default Footer;
