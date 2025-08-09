import React, { useState, useCallback } from 'react';

const SidebarLayout = ({ sections, defaultSection = 0 }) => {
  const [activeSection, setActiveSection] = useState(defaultSection);
  const [hoveredSection, setHoveredSection] = useState(null);

  const handleSectionHover = useCallback((index) => {
    setHoveredSection(index);
  }, []);

  const handleSectionLeave = useCallback(() => {
    setHoveredSection(null);
  }, []);

  const handleSectionClick = useCallback((index) => {
    setActiveSection(index);
  }, []);

  const handleSubItemClick = useCallback((sectionIndex, subIndex, section) => {
    if (section.onSubItemClick) {
      section.onSubItemClick(subIndex);
    }
    setActiveSection(sectionIndex);
    setHoveredSection(null);
  }, []);

  return (
    <div className="sidebar-layout">
      <div className="sidebar-layout__sidebar">
        <nav className="sidebar-layout__nav">
          {sections.map((section, index) => (
            <div 
              key={section.id || index}
              className="sidebar-layout__nav-container"
              onMouseEnter={() => handleSectionHover(index)}
              onMouseLeave={handleSectionLeave}
            >
              <button
                className={`sidebar-layout__nav-item ${
                  activeSection === index ? 'sidebar-layout__nav-item--active' : ''
                } ${hoveredSection === index ? 'sidebar-layout__nav-item--hovered' : ''}`}
                onClick={() => handleSectionClick(index)}
                type="button"
              >
                {section.icon && (
                  <span className="sidebar-layout__nav-icon">{section.icon}</span>
                )}
                <span className="sidebar-layout__nav-label">{section.label}</span>
                {section.subItems && section.subItems.length > 0 && (
                  <span className={`sidebar-layout__nav-arrow ${
                    hoveredSection === index ? 'sidebar-layout__nav-arrow--expanded' : ''
                  }`}>
                    ▶
                  </span>
                )}
              </button>
              
              {section.subItems && section.subItems.length > 0 && hoveredSection === index && (
                <div className="sidebar-layout__submenu">
                  {section.subItems.map((subItem, subIndex) => (
                    <button
                      key={subItem.id || subIndex}
                      className="sidebar-layout__submenu-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSubItemClick(index, subIndex, section);
                      }}
                      type="button"
                    >
                      {subItem.icon && (
                        <span className="sidebar-layout__submenu-icon">{subItem.icon}</span>
                      )}
                      <span className="sidebar-layout__submenu-label">{subItem.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>

      <div className="sidebar-layout__content">
        <div className="sidebar-layout__panel">
          <div className="sidebar-layout__header">
            <h1 className="sidebar-layout__title">
              {sections[activeSection]?.title || 'Select a section'}
            </h1>
            {sections[activeSection]?.headerAction && (
              <div className="sidebar-layout__header-actions">
                {sections[activeSection].headerAction}
              </div>
            )}
          </div>
          <div className="sidebar-layout__body">
            {sections[activeSection]?.content || (
              <div className="sidebar-layout__empty">
                <p>No content available for this section.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SidebarLayout;