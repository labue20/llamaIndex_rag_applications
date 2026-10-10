/**
 * Sidebar Layout Component
 * Creates a layout with sidebar navigation on the left and content on the right.
 * On phones the sidebar is a tab bar at the bottom: sections marked phoneTab
 * get a tab, and the rest are listed under More.
 */

import React, { useEffect, useState } from 'react';
import Icon from './Icon';

const SidebarLayout = ({
  sections,
  defaultSection = 0,
  footer = null,
  // Optional: control the active section from outside (e.g. from the URL)
  activeSection: controlledSection,
  onSectionChange,
}) => {
  const [uncontrolledSection, setUncontrolledSection] = useState(defaultSection);
  const activeSection = controlledSection ?? uncontrolledSection;
  const setActiveSection = (index) => {
    setUncontrolledSection(index);
    onSectionChange?.(index);
  };
  const [hoveredSection, setHoveredSection] = useState(null);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // Phones: tabs for the phoneTab sections, the others under More
  const hasMore = sections.some((s) => s.phoneTab) && sections.some((s) => !s.phoneTab);
  const inMore = (section) => hasMore && !section.phoneTab;
  const moreIsActive = hasMore && inMore(sections[activeSection] || {});

  useEffect(() => {
    if (!isMoreOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setIsMoreOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isMoreOpen]);

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
              className={`sidebar-layout__nav-container ${inMore(section) ? 'sidebar-layout__nav-container--more' : ''}`}
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
          {hasMore && (
            <div className='sidebar-layout__nav-container sidebar-layout__more'>
              <button
                type='button'
                className={`sidebar-layout__nav-item ${moreIsActive ? 'sidebar-layout__nav-item--active' : ''}`}
                aria-haspopup='menu'
                aria-expanded={isMoreOpen}
                onClick={() => setIsMoreOpen((open) => !open)}
              >
                <span className='sidebar-layout__nav-icon'><Icon name='more' /></span>
                <span className='sidebar-layout__nav-short'>More</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {isMoreOpen && (
        <>
          <div className='sidebar-layout__more-backdrop' onClick={() => setIsMoreOpen(false)} />
          <div className='sidebar-layout__more-sheet' role='menu' aria-label='More tools'>
            {sections.map((section, index) => inMore(section) && (
              <button
                key={index}
                type='button'
                role='menuitem'
                className={`sidebar-layout__more-item ${activeSection === index ? 'sidebar-layout__more-item--active' : ''}`}
                onClick={() => {
                  setIsMoreOpen(false);
                  handleSectionClick(index);
                }}
              >
                {section.icon && <span className='sidebar-layout__nav-icon'>{section.icon}</span>}
                {section.label}
              </button>
            ))}
          </div>
        </>
      )}

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
