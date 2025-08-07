import { Header, SidebarLayout } from './shared';
import { DocumentTools } from './features/document-management';
import { IndexQuery } from './features/query-interface';
import { AiPdfTools } from './features/ai-pdf';
import './shared/styles/base.scss';
import './shared/styles/components.scss';
import './features/document-management/styles/components.scss';
import './features/query-interface/styles/components.scss';
import './features/ai-pdf/styles/components.scss';

function App() {
  const sections = [
    {
      label: 'Document Management',
      title: 'Document Management',
      icon: '🗂️',
      content: <DocumentTools />
    },
    {
      label: 'Query Interface',
      title: 'Query Interface',
      icon: '🔍',
      content: <IndexQuery />
    },
    {
      label: 'AI PDF',
      title: 'AI PDF Features',
      icon: '🤖',
      content: <AiPdfTools />
    }
  ];

  return (
    <div className='app'>
      <Header />
      <div className='app-container'>
        <SidebarLayout sections={sections} defaultSection={0} />
      </div>
    </div>
  );
}

export default App;
