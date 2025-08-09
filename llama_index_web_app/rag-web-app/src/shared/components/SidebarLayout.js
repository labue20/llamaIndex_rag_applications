/**
 * Sidebar Layout Component
 * Creates a layout with sidebar navigation on the left and content on the right
 */

import React, { useState } from 'react';

const SidebarLayout = ({ sections, defaultSection = 0 }) => {
  const [activeSection, setActiveSection] = useState(defaultSection);

  return (
    <div className='sidebar-layout'>
      <div className='sidebar-layout__sidebar'>
        <div className='sidebar-layout__nav'>
          {sections.map((section, index) => (
            <button
              key={index}
              className={`sidebar-layout__nav-item ${activeSection === index ? 'sidebar-layout__nav-item--active' : ''}`}
              onClick={() => setActiveSection(index)}
            >
              {section.icon && <span className='sidebar-layout__nav-icon'>{section.icon}</span>}
              <span className='sidebar-layout__nav-label'>{section.label}</span>
            </button>
          ))}
        </div>
      </div>
      
      <div className='sidebar-layout__content'>
        {sections[activeSection] && (
          <div className='sidebar-layout__panel'>
            <div className='sidebar-layout__header'>
              <h2 className='sidebar-layout__title'>{sections[activeSection].title}</h2>
              {/* Pass the upload button as headerAction prop if available */}
              {sections[activeSection].headerAction && (
                <div className='sidebar-layout__header-actions'>
                  {sections[activeSection].headerAction}
                </div>
              )}
            </div>
            <div className='sidebar-layout__body'>
              {sections[activeSection].content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SidebarLayout;
