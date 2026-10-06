/**
 * Footer Component
 * Copyright and links shown at the bottom of every page
 */

const Footer = () => {
  return (
    <footer className='app-footer'>
      <p className='app-footer__copyright'>&copy; 2025 LlamaIndex RAG Applications. All rights reserved.</p>
      <p className='app-footer__links'>
        <a href='#privacy'>Privacy Policy</a>
        <span aria-hidden='true'>•</span>
        <a href='#terms'>Terms of Service</a>
        <span aria-hidden='true'>•</span>
        <a href='#contact'>Contact Us</a>
      </p>
    </footer>
  );
};

export default Footer;
