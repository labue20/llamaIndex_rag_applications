/**
 * Split Layout Component
 * Two panes side by side; on narrow screens (see .split-layout in
 * components.scss) they become tabs showing one pane at a time.
 */

import React, { useState } from 'react';

const SplitLayout = ({ leftPanel, rightPanel, leftWidth = '50%' }) => {
  // Which pane the tabs show on narrow screens
  const [activePane, setActivePane] = useState('left');

  const renderPanel = (panel) => (
    <div className='split-layout__panel'>
      {(panel?.title || panel?.icon) && (
        <div className='split-layout__header'>
          <h2 className='split-layout__title'>
            {panel.icon && <span className='split-layout__icon'>{panel.icon}</span>}
            {panel.title}
          </h2>
        </div>
      )}
      <div className='split-layout__body'>{panel?.content}</div>
    </div>
  );

  const tab = (pane, label) => (
    <button
      type='button'
      role='tab'
      aria-selected={activePane === pane}
      className={`split-layout__tab ${activePane === pane ? 'split-layout__tab--active' : ''}`}
      onClick={() => setActivePane(pane)}
    >
      {label}
    </button>
  );

  return (
    <div className={`split-layout split-layout--show-${activePane}`}>
      <div className='split-layout__tabs' role='tablist'>
        {tab('left', leftPanel?.tabLabel || leftPanel?.title || 'Main')}
        {tab('right', rightPanel?.tabLabel || rightPanel?.title || 'Details')}
      </div>
      <div className='split-layout__left' style={{ width: leftWidth }}>
        {renderPanel(leftPanel)}
      </div>
      <div className='split-layout__right'>{renderPanel(rightPanel)}</div>
    </div>
  );
};

export default SplitLayout;
