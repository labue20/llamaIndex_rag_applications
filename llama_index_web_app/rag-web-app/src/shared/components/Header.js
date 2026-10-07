import { Link } from 'react-router-dom';
import Icon from './Icon';
import { AccountMenu, useAuth, TrialBadge } from '../../features/auth';

const Header = () => {
  const { user, showAuth } = useAuth();

  return (
    <header className='app-header'>
      <div className='app-header__container'>
        <Link to='/' className='app-header__brand' aria-label='RAG Web Application home'>
          <span className='app-header__logo'>
            <Icon name='layers' size={18} />
          </span>
          <span className='app-header__title'>RAG Web Application</span>
          <span className='app-header__subtitle'>LlamaIndex</span>
        </Link>
        <div className='app-header__actions'>
          <TrialBadge />
          {user && <AccountMenu />}
          {!user && (
            <div className='user-menu'>
              <button type='button' className='user-menu__logout' onClick={() => showAuth('login')}>
                Log in
              </button>
              <button type='button' className='trial-badge__upgrade' onClick={() => showAuth('signup')}>
                Sign up free
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
