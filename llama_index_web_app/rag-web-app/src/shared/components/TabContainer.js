/**
 * Tab Container Component
 * Manages tab navigation for the main application
 */

import React, { useState } from 'react';

const TabContainer = ({ tabs, defaultTab = 0 }) => {
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <div className='tab-container'>
      <div className='tab-container__header'>
        <div className='tab-container__nav'>
          {tabs.map((tab, index) => (
            <button
              key={index}
              className={`tab-container__tab ${activeTab === index ? 'tab-container__tab--active' : ''}`}
              onClick={() => setActiveTab(index)}
            >
              {tab.icon && <span className='tab-container__tab-icon'>{tab.icon}</span>}
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      
      <div className='tab-container__content'>
        {tabs[activeTab] && (
          <div className='tab-container__panel'>
            <h2 className='tab-container__title'>{tabs[activeTab].title}</h2>
            <div className='tab-container__body'>
              {tabs[activeTab].content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TabContainer;
