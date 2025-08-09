/**
 * Right Pane Component
 * Placeholder component for the right side of the split layout
 */

import React from 'react';

const RightPane = () => {
  return (
    <div className='right-pane'>
      <div className='right-pane__header'>
        <h2 className='right-pane__title'>Additional Features</h2>
        <p className='right-pane__subtitle'>This space is reserved for future enhancements</p>
      </div>
      
      <div className='right-pane__content'>
        <div className='right-pane__placeholder'>
          <div className='right-pane__icon'>🚀</div>
          <h3>Coming Soon</h3>
          <p>This panel will contain additional features such as:</p>
          <ul>
            <li>📊 Analytics Dashboard</li>
            <li>🔧 Advanced Settings</li>
            <li>📈 Usage Statistics</li>
            <li>🎯 Quick Actions</li>
            <li>📋 Recent Activity</li>
          </ul>
          <div className='right-pane__note'>
            <p><strong>Note:</strong> Currently, all main features are available in the left panel tabs.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RightPane;
