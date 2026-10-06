import { fireEvent, render, screen } from '@testing-library/react';
import SplitLayout from './SplitLayout';

test('tabs switch which pane is shown on small screens', () => {
  const { container } = render(
    <SplitLayout
      leftPanel={{ tabLabel: 'Chat', content: <p>the conversation</p> }}
      rightPanel={{ title: 'Document Preview', tabLabel: 'Preview', content: <p>the document</p> }}
    />
  );
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  const layout = container.querySelector('.split-layout');

  expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');
  expect(layout).toHaveClass('split-layout--show-left');

  fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
  expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
  expect(layout).toHaveClass('split-layout--show-right');

  // Both panes stay mounted (CSS hides one), so switching never loses state
  expect(screen.getByText('the conversation')).toBeInTheDocument();
  expect(screen.getByText('the document')).toBeInTheDocument();
});
