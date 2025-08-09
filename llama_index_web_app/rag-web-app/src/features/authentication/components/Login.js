/**
 * Login Component
 * Handles user authentication login form
 */

import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const result = await login(email, password);
      if (result.success && onLogin) {
        onLogin(result.user);
      }
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  return (
    <div className="auth-form">
      <h2>Login to RAG Application</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email:</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="password">Password:</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>

        {error && <div className="error-message">{error}</div>}
        
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
};

export default Login;
