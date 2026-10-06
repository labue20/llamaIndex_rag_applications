/**
 * Centralized API Client
 * Provides a unified interface for making API calls with error handling,
 * request/response interceptors, and configuration management.
 */

// Backend API address; set REACT_APP_API_URL to point the app at another server
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5601';

// Called whenever the API answers 401 (not logged in / session expired)
let unauthorizedHandler = null;
export const setUnauthorizedHandler = (handler) => {
  unauthorizedHandler = handler;
};

/**
 * fetch() against the backend: prefixes API_BASE_URL, sends the session cookie,
 * and reports 401 responses to the unauthorized handler.
 * @param {string} path - API path, e.g. '/chat'
 * @param {Object} options - fetch options
 * @returns {Promise<Response>}
 */
export const apiFetch = async (path, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
  });
  if (response.status === 401 && unauthorizedHandler) {
    unauthorizedHandler();
  }
  return response;
};

class ApiClient {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Set authorization token for requests
   * @param {string} token - Authorization token
   */
  setAuthToken(token) {
    if (token) {
      this.defaultHeaders['Authorization'] = `Bearer ${token}`;
    } else {
      delete this.defaultHeaders['Authorization'];
    }
  }

  /**
   * Make a GET request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @returns {Promise} Response data
   */
  async get(endpoint, options = {}) {
    return this.request('GET', endpoint, null, options);
  }

  /**
   * Make a POST request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @param {Object} options - Request options
   * @returns {Promise} Response data
   */
  async post(endpoint, data = null, options = {}) {
    return this.request('POST', endpoint, data, options);
  }

  /**
   * Make a PUT request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @param {Object} options - Request options
   * @returns {Promise} Response data
   */
  async put(endpoint, data = null, options = {}) {
    return this.request('PUT', endpoint, data, options);
  }

  /**
   * Make a DELETE request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @returns {Promise} Response data
   */
  async delete(endpoint, options = {}) {
    return this.request('DELETE', endpoint, null, options);
  }

  /**
   * Generic request method
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @param {Object} options - Request options
   * @returns {Promise} Response data
   */
  async request(method, endpoint, data = null, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    const config = {
      method,
      headers: {
        ...this.defaultHeaders,
        ...options.headers,
      },
      mode: 'cors',
      credentials: 'include',
      ...options,
    };

    if (data && method !== 'GET') {
      if (data instanceof FormData) {
        // Remove Content-Type header for FormData, let browser set it
        delete config.headers['Content-Type'];
        config.body = data;
      } else {
        config.body = JSON.stringify(data);
      }
    }

    try {
      console.log(`Making ${method} request to: ${url}`);
      
      const response = await fetch(url, config);

      if (response.status === 401 && unauthorizedHandler) {
        unauthorizedHandler();
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Handle different response types
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      console.error(`API request failed: ${method} ${url}`, error);
      throw error;
    }
  }

  /**
   * Check if the API is available
   * @returns {Promise<boolean>} API availability status
   */
  async checkHealth() {
    try {
      await this.get('/health');
      return true;
    } catch (error) {
      console.warn('API health check failed:', error);
      return false;
    }
  }
}

// Create and export a singleton instance
export const apiClient = new ApiClient();

// Export the class for testing or multiple instances if needed
export { ApiClient };
