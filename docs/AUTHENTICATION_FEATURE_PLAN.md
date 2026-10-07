# Authentication Feature Implementation Plan

## Overview
Adding login and signup functionality to your RAG application using the feature-based structure. This will demonstrate how easy it is to add new features with the proposed organization.

## Feature Structure

```
dokkiman/
├── backend/
│   ├── features/
│   │   └── authentication/
│   │       ├── __init__.py
│   │       ├── models/
│   │       │   ├── __init__.py
│   │       │   ├── user.py              # User model
│   │       │   └── session.py           # Session model
│   │       ├── services/
│   │       │   ├── __init__.py
│   │       │   ├── auth_service.py      # Authentication logic
│   │       │   ├── password_service.py  # Password hashing/validation
│   │       │   ├── token_service.py     # JWT token management
│   │       │   └── email_service.py     # Email verification/reset
│   │       ├── routes/
│   │       │   ├── __init__.py
│   │       │   ├── auth.py              # Login/logout endpoints
│   │       │   └── users.py             # User management endpoints
│   │       ├── middleware/
│   │       │   ├── __init__.py
│   │       │   ├── auth_middleware.py   # Authentication middleware
│   │       │   └── rate_limiter.py      # Rate limiting for auth
│   │       ├── validators/
│   │       │   ├── __init__.py
│   │       │   ├── user_validator.py    # User input validation
│   │       │   └── password_validator.py # Password strength
│   │       └── tests/
│   │           ├── test_auth_service.py
│   │           ├── test_routes.py
│   │           └── test_models.py
├── frontend/
│   ├── src/
│   │   ├── features/
│   │   │   └── authentication/
│   │   │       ├── components/
│   │   │       │   ├── LoginForm.js
│   │   │       │   ├── SignupForm.js
│   │   │       │   ├── AuthLayout.js
│   │   │       │   ├── PasswordReset.js
│   │   │       │   ├── EmailVerification.js
│   │   │       │   └── UserProfile.js
│   │   │       ├── pages/
│   │   │       │   ├── LoginPage.js
│   │   │       │   ├── SignupPage.js
│   │   │       │   └── ProfilePage.js
│   │   │       ├── hooks/
│   │   │       │   ├── useAuth.js        # Authentication state
│   │   │       │   ├── useLogin.js       # Login logic
│   │   │       │   ├── useSignup.js      # Signup logic
│   │   │       │   └── useUser.js        # User data management
│   │   │       ├── services/
│   │   │       │   ├── authApi.js        # API calls
│   │   │       │   ├── tokenService.js   # Token management
│   │   │       │   └── userService.js    # User operations
│   │   │       ├── context/
│   │   │       │   └── AuthContext.js    # Global auth state
│   │   │       ├── guards/
│   │   │       │   ├── ProtectedRoute.js # Route protection
│   │   │       │   └── PublicRoute.js    # Public-only routes
│   │   │       ├── types/
│   │   │       │   └── auth.types.js     # TypeScript/PropTypes
│   │   │       └── styles/
│   │   │           └── auth.scss         # Auth-specific styles
```

## Implementation Steps

### Phase 1: Backend Authentication

#### 1. Database Setup
```python
# backend/features/authentication/models/user.py
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import uuid

class User:
    def __init__(self, email, username, password_hash=None, is_verified=False):
        self.id = str(uuid.uuid4())
        self.email = email
        self.username = username
        self.password_hash = password_hash
        self.is_verified = is_verified
        self.created_at = datetime.utcnow()
        self.last_login = None
        
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
        
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
```

#### 2. Authentication Service
```python
# backend/features/authentication/services/auth_service.py
import jwt
from datetime import datetime, timedelta
from flask import current_app

class AuthService:
    @staticmethod
    def authenticate_user(email, password):
        """Authenticate user with email and password"""
        # Find user by email
        # Check password
        # Return user or None
        pass
        
    @staticmethod
    def generate_token(user_id):
        """Generate JWT token for user"""
        payload = {
            'user_id': user_id,
            'exp': datetime.utcnow() + timedelta(hours=24),
            'iat': datetime.utcnow()
        }
        return jwt.encode(payload, current_app.config['SECRET_KEY'], algorithm='HS256')
        
    @staticmethod
    def verify_token(token):
        """Verify and decode JWT token"""
        try:
            payload = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])
            return payload['user_id']
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None
```

#### 3. Authentication Routes
```python
# backend/features/authentication/routes/auth.py
from flask import Blueprint, request, jsonify
from ..services.auth_service import AuthService
from ..services.password_service import PasswordService
from ..validators.user_validator import UserValidator

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    
    # Validate input
    if not UserValidator.validate_login(data):
        return jsonify({'error': 'Invalid input'}), 400
    
    # Authenticate user
    user = AuthService.authenticate_user(data['email'], data['password'])
    if not user:
        return jsonify({'error': 'Invalid credentials'}), 401
    
    # Generate token
    token = AuthService.generate_token(user.id)
    
    return jsonify({
        'token': token,
        'user': {
            'id': user.id,
            'email': user.email,
            'username': user.username
        }
    })

@auth_bp.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()
    
    # Validate input
    if not UserValidator.validate_signup(data):
        return jsonify({'error': 'Invalid input'}), 400
    
    # Check if user exists
    if UserService.get_user_by_email(data['email']):
        return jsonify({'error': 'User already exists'}), 409
    
    # Create user
    user = UserService.create_user(data)
    
    # Send verification email
    EmailService.send_verification_email(user)
    
    return jsonify({
        'message': 'User created successfully. Please check your email for verification.',
        'user_id': user.id
    }), 201

@auth_bp.route('/logout', methods=['POST'])
def logout():
    # Handle token invalidation (if using blacklist)
    return jsonify({'message': 'Logged out successfully'})
```

### Phase 2: Frontend Authentication

#### 1. Authentication Context
```javascript
// frontend/src/features/authentication/context/AuthContext.js
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { tokenService } from '../services/tokenService';
import { authApi } from '../services/authApi';

const AuthContext = createContext();

const authReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, loading: true, error: null };
    case 'LOGIN_SUCCESS':
      return { 
        ...state, 
        loading: false, 
        user: action.payload.user, 
        isAuthenticated: true 
      };
    case 'LOGIN_ERROR':
      return { ...state, loading: false, error: action.payload };
    case 'LOGOUT':
      return { ...state, user: null, isAuthenticated: false };
    case 'SET_USER':
      return { ...state, user: action.payload, isAuthenticated: true };
    default:
      return state;
  }
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    isAuthenticated: false,
    loading: false,
    error: null
  });

  useEffect(() => {
    // Check for existing token on app load
    const token = tokenService.getToken();
    if (token) {
      // Verify token and get user data
      authApi.verifyToken(token)
        .then(user => {
          dispatch({ type: 'SET_USER', payload: user });
        })
        .catch(() => {
          tokenService.removeToken();
        });
    }
  }, []);

  const login = async (credentials) => {
    dispatch({ type: 'LOGIN_START' });
    try {
      const response = await authApi.login(credentials);
      tokenService.setToken(response.token);
      dispatch({ type: 'LOGIN_SUCCESS', payload: response });
      return response;
    } catch (error) {
      dispatch({ type: 'LOGIN_ERROR', payload: error.message });
      throw error;
    }
  };

  const signup = async (userData) => {
    dispatch({ type: 'LOGIN_START' });
    try {
      const response = await authApi.signup(userData);
      return response;
    } catch (error) {
      dispatch({ type: 'LOGIN_ERROR', payload: error.message });
      throw error;
    }
  };

  const logout = () => {
    tokenService.removeToken();
    dispatch({ type: 'LOGOUT' });
  };

  return (
    <AuthContext.Provider value={{
      ...state,
      login,
      signup,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

#### 2. Login Component
```javascript
// frontend/src/features/authentication/components/LoginForm.js
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const LoginForm = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [errors, setErrors] = useState({});
  
  const { login, loading, error } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Clear error when user starts typing
    if (errors[e.target.name]) {
      setErrors({
        ...errors,
        [e.target.name]: ''
      });
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    try {
      await login(formData);
      navigate('/dashboard'); // Redirect to main app
    } catch (err) {
      // Error is handled by context
    }
  };

  return (
    <div className="login-form">
      <h2>Login to RAG Application</h2>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className={errors.email ? 'error' : ''}
            disabled={loading}
          />
          {errors.email && <span className="error-text">{errors.email}</span>}
        </div>
        
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            className={errors.password ? 'error' : ''}
            disabled={loading}
          />
          {errors.password && <span className="error-text">{errors.password}</span>}
        </div>
        
        <button 
          type="submit" 
          className="login-button"
          disabled={loading}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      
      <div className="form-footer">
        <p>
          Don't have an account? 
          <a href="/signup">Sign up here</a>
        </p>
        <p>
          <a href="/forgot-password">Forgot your password?</a>
        </p>
      </div>
    </div>
  );
};

export default LoginForm;
```

#### 3. Signup Component
```javascript
// frontend/src/features/authentication/components/SignupForm.js
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const SignupForm = () => {
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(false);
  
  const { signup, loading, error } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Clear error when user starts typing
    if (errors[e.target.name]) {
      setErrors({
        ...errors,
        [e.target.name]: ''
      });
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    
    if (!formData.username) {
      newErrors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    try {
      await signup({
        email: formData.email,
        username: formData.username,
        password: formData.password
      });
      setSuccess(true);
    } catch (err) {
      // Error is handled by context
    }
  };

  if (success) {
    return (
      <div className="signup-success">
        <h2>Account Created Successfully!</h2>
        <p>Please check your email for verification instructions.</p>
        <button onClick={() => navigate('/login')}>
          Go to Login
        </button>
      </div>
    );
  }

  return (
    <div className="signup-form">
      <h2>Create Your Account</h2>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className={errors.email ? 'error' : ''}
            disabled={loading}
          />
          {errors.email && <span className="error-text">{errors.email}</span>}
        </div>
        
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            type="text"
            id="username"
            name="username"
            value={formData.username}
            onChange={handleChange}
            className={errors.username ? 'error' : ''}
            disabled={loading}
          />
          {errors.username && <span className="error-text">{errors.username}</span>}
        </div>
        
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            className={errors.password ? 'error' : ''}
            disabled={loading}
          />
          {errors.password && <span className="error-text">{errors.password}</span>}
        </div>
        
        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            className={errors.confirmPassword ? 'error' : ''}
            disabled={loading}
          />
          {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
        </div>
        
        <button 
          type="submit" 
          className="signup-button"
          disabled={loading}
        >
          {loading ? 'Creating Account...' : 'Sign Up'}
        </button>
      </form>
      
      <div className="form-footer">
        <p>
          Already have an account? 
          <a href="/login">Login here</a>
        </p>
      </div>
    </div>
  );
};

export default SignupForm;
```

#### 4. Protected Route Component
```javascript
// frontend/src/features/authentication/guards/ProtectedRoute.js
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login with the attempted location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;
```

### Phase 3: Integration with Existing App

#### 1. Update App.js with Authentication
```javascript
// frontend/src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './features/authentication/context/AuthContext';
import ProtectedRoute from './features/authentication/guards/ProtectedRoute';
import LoginPage from './features/authentication/pages/LoginPage';
import SignupPage from './features/authentication/pages/SignupPage';
import Header from './shared/components/Header';
import DocumentTools from './features/document-management/components/DocumentTools';
import IndexQuery from './features/query-interface/components/IndexQuery';
import './style.scss';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className='app'>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            
            {/* Protected routes */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Header />
                <div className='app-container'>
                  <div className='main-content'>
                    <div className='content-section document-section'>
                      <h2 className='section-title'>Document Management</h2>
                      <DocumentTools />
                    </div>
                    <div className='content-section query-section'>
                      <h2 className='section-title'>Query Interface</h2>
                      <IndexQuery />
                    </div>
                  </div>
                </div>
              </ProtectedRoute>
            } />
            
            {/* Redirect root to dashboard */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
```

## Benefits of This Feature-Based Approach

### 1. **Clean Separation**
- All authentication code is contained in one feature folder
- Easy to find and modify authentication logic
- No mixing with other features

### 2. **Easy to Extend**
- Add password reset by adding components/services to the auth feature
- Add social login by extending the existing auth structure
- Add user profiles without affecting other features

### 3. **Testable**
- Each part of authentication can be tested independently
- Clear boundaries make mocking easier
- Feature-specific test organization

### 4. **Reusable**
- Authentication hooks can be used throughout the app
- Components follow consistent patterns
- Services can be extended for new auth methods

### 5. **Maintainable**
- Changes to authentication are contained
- Clear file organization makes debugging easier
- Dependencies are explicit and manageable

## Next Steps

1. **Implement the backend authentication structure**
2. **Add database/storage for users (SQLite, PostgreSQL, etc.)**
3. **Create the frontend authentication components**
4. **Add routing and protection to existing features**
5. **Add email verification and password reset**
6. **Implement user preferences and settings**

This feature-based approach makes it incredibly easy to add complex functionality like authentication while keeping your codebase organized and maintainable!
