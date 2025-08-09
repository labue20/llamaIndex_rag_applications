/**
 * Authentication API Service
 * Handles authentication API calls to the backend
 */

const API_BASE_URL = 'http://localhost:5601'; // Adjust to match your backend URL

export const authApi = {
  /**
   * Login user
   * @param {string} email - User email
   * @param {string} password - User password
   */
  async login(email, password) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        mode: 'cors'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Login failed');
      }

      return await response.json();
    } catch (error) {
      throw new Error(error.message || 'Network error during login');
    }
  },

  /**
   * Logout user
   */
  async logout() {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error('Logout failed');
      }

      return await response.json();
    } catch (error) {
      throw new Error(error.message || 'Network error during logout');
    }
  },

  /**
   * Register new user
   * @param {Object} userData - User registration data
   */
  async register(userData) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
        mode: 'cors'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Registration failed');
      }

      return await response.json();
    } catch (error) {
      throw new Error(error.message || 'Network error during registration');
    }
  },

  /**
   * Verify authentication token
   * @param {string} token - Authentication token
   */
  async verifyToken(token) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        mode: 'cors'
      });

      if (!response.ok) {
        return { valid: false };
      }

      const result = await response.json();
      return { valid: true, user: result.user };
    } catch (error) {
      return { valid: false };
    }
  }
};
