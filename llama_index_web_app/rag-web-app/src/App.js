import { Header } from './shared';
import { DocumentTools } from './features/document-management';
import { IndexQuery } from './features/query-interface';
import './shared/styles/base.scss';
import './shared/styles/components.scss';
import './features/document-management/styles/components.scss';
import './features/query-interface/styles/components.scss';

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