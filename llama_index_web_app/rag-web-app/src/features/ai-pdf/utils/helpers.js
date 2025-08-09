/**
 * AI PDF Feature Utilities
 * Common helper functions for AI PDF components
 */

/**
 * Get display name for a PDF document
 * @param {Object} pdf - PDF document object
 * @returns {string} Display name
 */
export const getPdfDisplayName = (pdf) => {
  if (!pdf) return 'Unknown';
  return pdf.file_path ? pdf.file_path.split('/').pop() : pdf.id || 'Unknown';
};

/**
 * Format timestamp for display
 * @param {string} timestamp - ISO timestamp
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export const formatTimestamp = (timestamp, options = {}) => {
  const defaultOptions = {
    hour: '2-digit',
    minute: '2-digit',
    ...options
  };
  return new Date(timestamp).toLocaleTimeString([], defaultOptions);
};

/**
 * Format date for display
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Formatted date string
 */
export const formatDate = (timestamp) => {
  return new Date(timestamp).toLocaleString();
};

/**
 * Validate PDF document object
 * @param {Object} pdf - PDF document object
 * @returns {boolean} Whether PDF is valid
 */
export const isValidPdf = (pdf) => {
  return pdf && (pdf.id || pdf.file_path);
};

/**
 * Generate unique message ID
 * @param {string} type - Message type (user, assistant, etc.)
 * @returns {string} Unique ID
 */
export const generateMessageId = (type = 'message') => {
  return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Sanitize and validate user input
 * @param {string} input - User input
 * @returns {string} Sanitized input
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  return input.trim().substring(0, 1000); // Limit length for safety
};

/**
 * Handle API errors consistently
 * @param {Error} error - Error object
 * @param {string} context - Context where error occurred
 * @returns {string} User-friendly error message
 */
export const handleApiError = (error, context = 'operation') => {
  console.error(`API Error in ${context}:`, error);
  
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return 'Unable to connect to the server. Please check your connection.';
  }
  
  if (error.message.includes('404')) {
    return 'The requested resource was not found.';
  }
  
  if (error.message.includes('500')) {
    return 'Server error occurred. Please try again later.';
  }
  
  return error.message || `An error occurred during ${context}. Please try again.`;
};
