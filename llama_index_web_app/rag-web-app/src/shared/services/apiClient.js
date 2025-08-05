/**
 * Centralized API Client
 * Provides a unified interface for making API calls with error handling,
 * request/response interceptors, and configuration management.
 */

class ApiClient {
  constructor(baseURL = 'http://localhost:5601') {
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
