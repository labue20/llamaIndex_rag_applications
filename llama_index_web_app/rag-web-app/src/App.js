import Header from './components/Header';
import DocumentTools from './components/DocumentTools';
import IndexQuery from './components/IndexQuery';
import './style.scss';

function App() {
  return (
    <div className='app'>
      <Header />
      <div className='app-container'>
        <div className='main-content'>
          <div className='content-section document-section'>
            <h2 className='section-title'>Document Management</h2>
            <DocumentTools />
          </div>
          <div className='content-section query-section'>
            <h2 className='section-title'>Query Interface</h2>
            <IndexQuery />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;