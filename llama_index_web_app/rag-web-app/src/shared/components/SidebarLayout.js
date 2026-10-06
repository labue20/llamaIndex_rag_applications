/**
 * Sidebar Layout Component
 * Creates a layout with sidebar navigation on the left and content on the right
 */

import React, { useState } from 'react';

const SidebarLayout = ({ sections, defaultSection = 0, footer = null }) => {
  const [activeSection, setActiveSection] = useState(defaultSection);
  const [hoveredSection, setHoveredSection] = useState(null);

  const handleSectionClick = (index, subIndex = null) => {
    setActiveSection(index);
    // If there's a subsection, we can handle it here
    if (sections[index].onSubItemClick && subIndex !== null) {
      sections[index].onSubItemClick(subIndex);
    }
  };

  return (
    <div className='sidebar-layout'>
      <div className='sidebar-layout__sidebar'>
        <div className='sidebar-layout__nav'>
          {sections.map((section, index) => (
            <div
              key={index}
              className='sidebar-layout__nav-container'
              onMouseEnter={() => setHoveredSection(index)}
              onMouseLeave={() => setHoveredSection(null)}
            >
              <button
                className={`sidebar-layout__nav-item ${activeSection === index ? 'sidebar-layout__nav-item--active' : ''}`}
                onClick={() => handleSectionClick(index)}
                title={section.label}
              >
                {section.icon && <span className='sidebar-layout__nav-icon'>{section.icon}</span>}
                <span className='sidebar-layout__nav-label'>{section.label}</span>
                {/* Shorter label for the phone tab bar */}
                <span className='sidebar-layout__nav-short' aria-hidden='true'>
                  {section.shortLabel || section.label}
                </span>
               
              </button>
              
              {/* Hover menu for subsections */}
              {section.subItems && hoveredSection === index && (
                <div className='sidebar-layout__submenu'>
                  {section.subItems.map((subItem, subIndex) => (
                    <button
                      key={subIndex}
                      className='sidebar-layout__submenu-item'
                      onClick={() => handleSectionClick(index, subIndex)}
                    >
                      {subItem.icon && <span className='sidebar-layout__submenu-icon'>{subItem.icon}</span>}
                      <span className='sidebar-layout__submenu-label'>{subItem.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      <div className='sidebar-layout__content'>
        {/* Keep every section mounted so state (e.g. an open PDF) survives switching sections */}
        {sections.map((section, index) => (
          <div
            key={index}
            className='sidebar-layout__panel'
            style={activeSection === index ? undefined : { display: 'none' }}
          >
            <div className='sidebar-layout__header'>
              <h2 className='sidebar-layout__title'>{section.title}</h2>
              {/* Pass the upload button as headerAction prop if available */}
              {section.headerAction && (
                <div className='sidebar-layout__header-actions'>
                  {section.headerAction}
                </div>
              )}
            </div>
            <div className='sidebar-layout__body'>
              {section.content}
            </div>
          </div>
        ))}
        {footer}
      </div>
    </div>
  );
};

export default SidebarLayout;
