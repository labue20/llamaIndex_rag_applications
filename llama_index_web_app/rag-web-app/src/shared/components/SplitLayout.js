/**
 * Split Layout Component
 * Creates a split-screen layout with left and right panes
 */

import React from 'react';

const SplitLayout = ({ leftPanel, rightPanel, leftWidth = '50%' }) => {
  return (
    <div className='split-layout'>
      <div className='split-layout__left' style={{ width: leftWidth }}>
        <div className='split-layout__panel'>
          {((leftPanel && leftPanel.title) || (leftPanel && leftPanel.icon)) && (
            <div className='split-layout__header'>
              <h2 className='split-layout__title'>
                {leftPanel.icon && <span className='split-layout__icon'>{leftPanel.icon}</span>}
                {leftPanel.title}
              </h2>
            </div>
          )}
          <div className='split-layout__body'>
            {leftPanel.content}
          </div>
        </div>
      </div>
      <div className='split-layout__right'>
        <div className='split-layout__panel'>
          {((rightPanel && rightPanel.title) || (rightPanel && rightPanel.icon)) && (
            <div className='split-layout__header'>
              <h2 className='split-layout__title'>
                {rightPanel.icon && <span className='split-layout__icon'>{rightPanel.icon}</span>}
                {rightPanel.title}
              </h2>
            </div>
          )}
          <div className='split-layout__body'>
            {rightPanel.content}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SplitLayout;
