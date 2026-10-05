import Icon from './Icon';

const Header = () => {
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
        </div>
      </div>
    </header>
  );
};

export default Header;
