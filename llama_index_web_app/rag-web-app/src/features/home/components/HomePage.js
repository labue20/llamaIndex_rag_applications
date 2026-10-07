/**
 * Home Page
 * Public, tool-focused landing page shown before login
 */

import React from 'react';
import Icon from '../../../shared/components/Icon';
import { usePlanInfo } from '../../auth/hooks/usePlanInfo';
import '../styles/home.scss';

// Each tool gets its own accent color (see .home-tool--* in home.scss)
const TOOLS = [
  {
    id: 'chat',
    icon: 'chat',
    title: 'Chat with PDF',
    text: 'Ask questions and get answers drawn from your document.',
    badge: 'AI',
  },
  {
    id: 'pdf-word',
    icon: 'fileToWord',
    title: 'PDF to Word',
    text: 'Turn a PDF into an editable Word document.',
  },
  {
    id: 'word-pdf',
    icon: 'fileToPdf',
    title: 'Word to PDF',
    text: 'Convert Word files into PDFs that look right everywhere.',
  },
  {
    id: 'split',
    icon: 'scissors',
    title: 'Split PDF',
    text: 'Pull out the pages you need into separate files.',
  },
  {
    id: 'sign',
    icon: 'pen',
    title: 'Sign PDF',
    text: 'Add your signature, initials and the date, with an audit trail.',
  },
  {
    id: 'manager',
    icon: 'folder',
    title: 'Document Manager',
    text: 'Keep your uploads in one place, ready to use again.',
  },
];

const SECURITY_POINTS = [
  {
    title: 'Private by default',
    text: 'Your documents are tied to your account. Nobody else can list, open or chat with them.',
  },
  {
    title: 'Passwords never stored',
    text: 'Only a salted, one-way hash of your password is kept, so it can’t be read back.',
  },
  {
    title: 'Delete means delete',
    text: 'Removing a document also removes everything indexed from it.',
  },
];

const ChatPreview = () => (
  <div className='home-mock' aria-hidden='true'>
    <div className='home-mock__bar'>
      <span className='home-mock__file'>
        <Icon name='file' size={14} />
        annual_report.pdf
      </span>
      <span className='home-mock__status'>Ready</span>
    </div>
    <div className='home-mock__body'>
      <div className='home-mock__msg home-mock__msg--user'>What does page 7 say about revenue?</div>
      <div className='home-mock__msg home-mock__msg--ai'>
        <span className='home-mock__avatar'>
          <Icon name='sparkle' size={12} />
        </span>
        <div>
          Page 7 reports <strong>revenue of $4.2M</strong>, up 18% year over year, driven mainly
          by subscription growth.
        </div>
      </div>
      <div className='home-mock__composer'>
        Ask a question about your PDF…
        <span className='home-mock__send'>
          <Icon name='arrowUp' size={14} />
        </span>
      </div>
    </div>
  </div>
);

const ConvertPreview = () => (
  <div className='home-mock home-mock--convert' aria-hidden='true'>
    <div className='home-convert'>
      <div className='home-convert__file home-convert__file--pdf'>
        <Icon name='file' size={28} />
        <span>contract.pdf</span>
      </div>
      <span className='home-convert__arrow'>→</span>
      <div className='home-convert__file home-convert__file--word'>
        <Icon name='fileToWord' size={28} />
        <span>contract.docx</span>
      </div>
    </div>
    <div className='home-convert__progress'>
      <span />
    </div>
    <p className='home-convert__caption'>
      <Icon name='check' size={14} /> Converted. Your download has started.
    </p>
  </div>
);

const ManagerPreview = () => (
  <div className='home-mock' aria-hidden='true'>
    <div className='home-mock__bar'>
      <span className='home-mock__file'>
        <Icon name='folder' size={14} />
        My Documents
      </span>
      <span className='home-mock__count'>3 files</span>
    </div>
    <ul className='home-files'>
      {[
        ['annual_report.pdf', '2.4 MB'],
        ['lease_agreement.pdf', '860 KB'],
        ['meeting_notes.pdf', '312 KB'],
      ].map(([name, size]) => (
        <li key={name}>
          <span className='home-files__icon'>
            <Icon name='file' size={16} />
          </span>
          <span className='home-files__name'>{name}</span>
          <span className='home-files__size'>{size}</span>
        </li>
      ))}
    </ul>
  </div>
);

const FEATURES = [
  {
    eyebrow: 'AI PDF',
    title: 'Get answers instead of searching',
    text: 'Ask a question in plain language and get a clear answer built from the most relevant passages. Ask about “page 7” or “pages 3-5” and it looks at exactly those pages.',
    cta: 'Try Chat with PDF',
    tool: 'chat',
    preview: <ChatPreview />,
  },
  {
    eyebrow: 'Convert',
    title: 'Switch between PDF and Word in seconds',
    text: 'Convert PDFs into editable Word documents, or turn Word files into PDFs ready to share. Need only part of a file? Split it into the pages you want.',
    cta: 'Convert a file',
    tool: 'pdf-word',
    preview: <ConvertPreview />,
  },
  {
    eyebrow: 'Organize',
    title: 'All your documents in one place',
    text: 'Every PDF you upload, from any tool, shows up in your document manager, so you can come back and keep asking questions later.',
    cta: 'Create your workspace',
    preview: <ManagerPreview />,
  },
];

const HomePage = ({ onLogin, onSignup, onTryTool = onSignup, isLoggedIn = false, onOpenApp }) => {
  // Tools can be tried without an account; the Document Manager needs one
  const openTool = (toolId) => (toolId === 'manager' ? onSignup() : onTryTool(toolId));

  const planInfo = usePlanInfo();
  const trialLabel = `${planInfo.trial_days}-day free trial`;

  return (
    <div className='home'>
      <header className='home-nav'>
        <div className='home-nav__inner'>
          <div className='home-nav__brand'>
            <span className='home-nav__logo'>
              <Icon name='layers' size={18} />
            </span>
            <span className='home-nav__name'>RAG Web Application</span>
          </div>
          <nav className='home-nav__links' aria-label='Tools'>
            {TOOLS.filter((tool) => tool.id !== 'manager').map((tool) => (
              <button key={tool.id} type='button' onClick={() => openTool(tool.id)}>
                {tool.title}
              </button>
            ))}
          </nav>
          <div className='home-nav__actions'>
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

      <main>
        <section className='home-hero'>
          <span className='home-hero__eyebrow'>
            <Icon name='sparkle' size={14} />
            {trialLabel} · No credit card needed
          </span>
          <h1 className='home-hero__title'>
            Do more with your <span className='home-hero__highlight'>PDFs</span>
          </h1>
          <p className='home-hero__text'>
            Chat with documents, convert between PDF and Word, and split files, all in one place.
          </p>
          <div className='home-hero__ctas'>
            {isLoggedIn ? (
              <button type='button' className='home-btn home-btn--primary home-btn--large' onClick={onOpenApp}>
                Open the app
              </button>
            ) : (
              <button type='button' className='home-btn home-btn--primary home-btn--large' onClick={onSignup}>
                Start your {trialLabel}
              </button>
            )}
            <button type='button' className='home-btn home-btn--ghost home-btn--large' onClick={() => onTryTool('chat')}>
              Try it now, no sign-up
            </button>
          </div>
        </section>

        <section className='home-tools' id='tools' aria-labelledby='home-tools-title'>
          <h2 className='home-section-title' id='home-tools-title'>Our tools</h2>
          <div className='home-tools__grid'>
            {TOOLS.map((tool) => (
              <button
                key={tool.id}
                type='button'
                className={`home-tool home-tool--${tool.id}`}
                onClick={() => openTool(tool.id)}
              >
                <span className='home-tool__icon'>
                  <Icon name={tool.icon} size={22} />
                </span>
                <span className='home-tool__title'>
                  {tool.title}
                  {tool.badge && <span className='home-tool__badge'>{tool.badge}</span>}
                </span>
                <span className='home-tool__text'>{tool.text}</span>
              </button>
            ))}
          </div>
        </section>

        {FEATURES.map((feature, i) => (
          <section
            key={feature.title}
            className={`home-feature ${i % 2 === 1 ? 'home-feature--reverse' : ''}`}
          >
            <div className='home-feature__copy'>
              <span className='home-feature__eyebrow'>{feature.eyebrow}</span>
              <h2>{feature.title}</h2>
              <p>{feature.text}</p>
              <button
                type='button'
                className='home-btn home-btn--link'
                onClick={() => (feature.tool ? onTryTool(feature.tool) : onSignup())}
              >
                {feature.cta} →
              </button>
            </div>
            <div className='home-feature__visual'>{feature.preview}</div>
          </section>
        ))}

        <section className='home-security'>
          <div className='home-security__header'>
            <span className='home-security__icon'>
              <Icon name='lock' size={22} />
            </span>
            <h2 className='home-section-title'>Your documents stay yours</h2>
          </div>
          <div className='home-security__grid'>
            {SECURITY_POINTS.map((point) => (
              <div key={point.title} className='home-security__item'>
                <Icon name='check' size={18} />
                <div>
                  <h3>{point.title}</h3>
                  <p>{point.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className='home-cta'>
          <h2>Try it free for {planInfo.trial_days} days</h2>
          <p>
            Full access to every tool, up to {planInfo.trial_max_documents} documents and{' '}
            {planInfo.trial_max_questions_per_day} questions a day. No credit card needed.
          </p>
          <button type='button' className='home-btn home-btn--light home-btn--large' onClick={onSignup}>
            Start free trial
          </button>
        </section>
      </main>

      <footer className='home-footer'>
        <div className='home-footer__inner'>
          <div className='home-footer__brand'>
            <span className='home-nav__logo'>
              <Icon name='layers' size={16} />
            </span>
            <div>
              <strong>RAG Web Application</strong>
              <p>Chat with and convert your PDFs.</p>
            </div>
          </div>
          <div className='home-footer__col'>
            <h4>Tools</h4>
            {TOOLS.map((tool) => (
              <button key={tool.id} type='button' onClick={() => openTool(tool.id)}>
                {tool.title}
              </button>
            ))}
          </div>
          <div className='home-footer__col'>
            <h4>Account</h4>
            <button type='button' onClick={onLogin}>Log in</button>
            <button type='button' onClick={onSignup}>Start free trial</button>
          </div>
        </div>
        <p className='home-footer__note'>Built with LlamaIndex and OpenAI</p>
      </footer>
    </div>
  );
};

export default HomePage;
