/**
 * Split Layout Component
 * Creates a split-screen layout with left and right panes
 */

import React from 'react';

const SplitLayout = ({ leftPane, rightPane, leftWidth = '50%' }) => {
  return (
    <div className='split-layout'>
      <div className='split-layout__left' style={{ width: leftWidth }}>
        {leftPane}
      </div>
      <div className='split-layout__right'>
        {rightPane}
      </div>
    </div>
  );
};

export default SplitLayout;
