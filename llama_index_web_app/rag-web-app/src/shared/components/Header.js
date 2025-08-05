const Header = () => {
  return (
    <header className='app-header'>
      <div className='app-header__container'>
        <div className='app-header__brand'>
          <h1 className='app-header__title'>
            <span className='app-header__title--primary'>RAG Web</span>
            <span className='app-header__title--secondary'>Application</span>
          </h1>
          <p className='app-header__subtitle'>Llama Index</p>
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