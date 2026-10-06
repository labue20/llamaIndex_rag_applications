import Icon from './Icon';
import { useAuth } from '../../features/auth';

const Header = () => {
  const { user, logout } = useAuth();

  return (
    <header className='app-header'>
      <div className='app-header__container'>
        <div className='app-header__brand'>
          <span className='app-header__logo'>
            <Icon name='layers' size={18} />
          </span>
          <h1 className='app-header__title'>RAG Web Application</h1>
          <span className='app-header__subtitle'>LlamaIndex</span>
        </div>
        <div className='app-header__actions'>
          <div className='app-header__status'>
            <span className='status-indicator'></span>
            <span className='status-text'>Connected</span>
          </div>
          {user && (
            <div className='user-menu'>
              <span className='user-menu__avatar' aria-hidden='true'>
                {user.email.charAt(0)}
              </span>
              <span className='user-menu__email' title={user.email}>{user.email}</span>
              <button type='button' className='user-menu__logout' onClick={logout}>
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
