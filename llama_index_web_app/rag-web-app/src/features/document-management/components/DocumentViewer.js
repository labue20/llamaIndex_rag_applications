/**
 * Document Viewer Component
 * Displays a table of documents with selection, deletion, and metadata viewing capabilities
 */

import React, { useState } from 'react';

const MAX_TITLE_LENGTH = 45;

const DocumentViewer = ({ documentList, onDeleteDocument }) => {
  console.log('DocumentViewer received documentList:', documentList);
  
  const [selectedDocuments, setSelectedDocuments] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hoveredDocument, setHoveredDocument] = useState(null);
  
  const truncateText = (text, maxLength) => {
    return text.length <= maxLength ? text : text.substring(0, maxLength) + '...';
  };

  const getDocumentDisplayName = (document) => {
    // Try different possible filename fields in order of preference
    const possibleNames = [
      document.filename,
      document.name, 
      document.title,
      document.original_filename,
      document.file_name,
      document.id
    ];
    
    for (const name of possibleNames) {
      if (name && typeof name === 'string' && name.trim()) {
        let filename = name;
        
        // Try to decode URL-encoded characters
        try {
          filename = decodeURIComponent(filename);
        } catch (e) {
          // If decoding fails, use the original string
          console.log('Failed to decode filename:', filename);
        }
        
        // Replace common encoded characters that might display as symbols
        filename = filename
          .replace(/%20/g, ' ')        // Replace %20 with space
          .replace(/\+/g, ' ')         // Replace + with space  
          .replace(/%2B/g, '+')        // Decode + symbol
          .replace(/%2F/g, '/')        // Decode / symbol
          .replace(/%5C/g, '\\')       // Decode \ symbol
          .replace(/%2E/g, '.')        // Decode . symbol
          .replace(/%2D/g, '-')        // Decode - symbol
          .replace(/%5F/g, '_');       // Decode _ symbol
        
        // If it's a path, extract just the filename
        filename = filename.includes('/') ? filename.split('/').pop() : filename;
        filename = filename.includes('\\') ? filename.split('\\').pop() : filename;
        
        // Remove any remaining non-printable characters
        filename = filename.replace(/[^\x20-\x7E]/g, '');
        
        return filename.trim() || 'Unknown Document';
      }
    }
    
    return 'Unknown Document';
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getDocumentSize = (document) => {
    // Log the document structure for debugging
    console.log('Document structure for size calculation:', document);
    
    // Try different possible size properties in order of preference
    
    // 1. Check for file_size (actual file size in bytes) - highest priority
    if (document.file_size && document.file_size > 0) {
      return formatFileSize(document.file_size);
    }
    
    // 2. Check for statistics object from backend (text characters)
    if (document.statistics?.total_characters) {
      return formatFileSize(document.statistics.total_characters) + ' (text)';
    }
    
    // 3. Check for full_document_summary statistics
    if (document.full_document_summary?.statistics?.total_characters) {
      return formatFileSize(document.full_document_summary.statistics.total_characters) + ' (text)';
    }
    
    // 4. Check for full_text_length
    if (document.full_text_length) {
      return formatFileSize(document.full_text_length) + ' (text)';
    }
    
    // 5. Check for text length if available
    if (document.text && document.text.length > 0) {
      return formatFileSize(document.text.length) + ' (preview)';
    }
    
    // 6. Check for generic size property
    if (document.size) {
      return formatFileSize(document.size);
    }
    
    return 'N/A';
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileTypeIcon = (fileType) => {
    switch (fileType?.toLowerCase()) {
      case '.pdf': return '📋'; // PDF document
      case '.txt': return '📝'; // Text file
      case '.md': return '📄'; // Markdown
      case '.docx':
      case '.doc': return '📝'; // Word document
      case '.json': return '⚙️'; // JSON data
      case '.xlsx':
      case '.xls': return '📊'; // Excel spreadsheet
      case '.pptx':
      case '.ppt': return '📺'; // PowerPoint
      case '.zip':
      case '.rar': return '📦'; // Archive
      case '.jpg':
      case '.jpeg':
      case '.png':
      case '.gif': return '🖼️'; // Image
      default: return '📄'; // Generic document
    }
  };

  // Selection handlers
  const handleSelectDocument = (documentId) => {
    setSelectedDocuments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(documentId)) {
        newSet.delete(documentId);
      } else {
        newSet.add(documentId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedDocuments.size === documentList.length) {
      setSelectedDocuments(new Set());
    } else {
      setSelectedDocuments(new Set(documentList.map(doc => doc.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedDocuments.size > 0) {
      setShowDeleteConfirm(true);
    }
  };

  const clearSelections = () => {
    setSelectedDocuments(new Set());
  };

  const confirmDelete = async () => {
    if (!onDeleteDocument) {
      console.error('No delete handler provided');
      return;
    }

    setIsDeleting(true);
    try {
      // Delete documents one by one
      for (const documentId of selectedDocuments) {
        await onDeleteDocument(documentId);
      }
      setSelectedDocuments(new Set());
      setShowDeleteConfirm(false);
      // Clear selections after successful deletion
      clearSelections();
    } catch (error) {
      console.error('Error deleting documents:', error);
      alert('Failed to delete some documents. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  return (
    <div className='viewer'>
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className='viewer__modal-overlay'>
          <div className='viewer__modal'>
            <h3>Confirm Deletion</h3>
            <p>
              Are you sure you want to delete {selectedDocuments.size} document{selectedDocuments.size > 1 ? 's' : ''}?
              This action cannot be undone.
            </p>
            <div className='viewer__modal-actions'>
              <button 
                className='viewer__modal-btn viewer__modal-btn--cancel'
                onClick={cancelDelete}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button 
                className='viewer__modal-btn viewer__modal-btn--delete'
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {documentList.length > 0 ? (
        <div className='viewer__table-container'>
          {/* Action Bar - Only show when documents are selected */}
          {selectedDocuments.size > 0 && (
            <div className='viewer__action-bar'>
              <div className='viewer__selection-info'>
                <label className='viewer__select-all'>
                  <input
                    type='checkbox'
                    checked={selectedDocuments.size === documentList.length && documentList.length > 0}
                    onChange={handleSelectAll}
                  />
                  <span>
                    {selectedDocuments.size > 0 
                      ? `${selectedDocuments.size} selected` 
                      : 'Select all'
                    }
                  </span>
                </label>
              </div>
              <div className='viewer__action-buttons'>
                <button 
                  className='viewer__delete-btn'
                  onClick={handleDeleteSelected}
                  disabled={isDeleting}
                >
                  🗑️ Delete Selected ({selectedDocuments.size})
                </button>
                <button 
                  className='viewer__cancel-btn'
                  onClick={clearSelections}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <table className='viewer__table'>
            <thead>
              <tr>
                <th className='viewer__table-header--select'>
                  {selectedDocuments.size > 0 && (
                    <input
                      type='checkbox'
                      checked={selectedDocuments.size === documentList.length && documentList.length > 0}
                      onChange={handleSelectAll}
                      className='viewer__checkbox viewer__checkbox--header'
                    />
                  )}
                </th>
                <th>Name</th>
                <th>Size</th>
                <th>Date Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {documentList.map((document) => {
                console.log('Document object:', document);
                const displayName = getDocumentDisplayName(document);
                const truncatedName = truncateText(displayName, MAX_TITLE_LENGTH);
                const fileIcon = getFileTypeIcon(document.file_type);
                const isSelected = selectedDocuments.has(document.id);
                
                return (
                  <tr 
                    key={document.id} 
                    className={`viewer__table-row ${isSelected ? 'viewer__table-row--selected' : ''}`}
                    onMouseEnter={() => setHoveredDocument(document.id)}
                    onMouseLeave={() => setHoveredDocument(null)}
                  >
                    <td className='viewer__table-cell viewer__table-cell--select'>
                      {(hoveredDocument === document.id || isSelected || selectedDocuments.size > 0) && (
                        <input
                          type='checkbox'
                          checked={isSelected}
                          onChange={() => handleSelectDocument(document.id)}
                          className='viewer__checkbox'
                        />
                      )}
                    </td>
                    <td className='viewer__table-cell viewer__table-cell--name'>
                      <span className='viewer__file-icon'>{fileIcon}</span>
                      <span className='viewer__file-name' title={displayName}>
                        {truncatedName}
                      </span>
                    </td>
                    <td className='viewer__table-cell viewer__table-cell--size'>
                      {getDocumentSize(document)}
                    </td>
                    <td className='viewer__table-cell viewer__table-cell--date'>
                      {formatDate(document.processing_timestamp)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className='viewer__empty-state'>
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📁</div>
            <p className='viewer__empty-title'>No documents yet</p>
            <p className='viewer__empty-text'>
              Upload your first document to start building your knowledge base.
            </p>
            <p className='viewer__empty-formats'>
              Supported formats: PDF, TXT, JSON, MD, DOCX
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentViewer;
