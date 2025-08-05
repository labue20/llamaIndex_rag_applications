/**
 * Query Interface Feature Exports
 * Centralized exports for all query interface related functionality
 */

// Components
export { default as IndexQuery } from './components/IndexQuery';

// Hooks
export { useQuery, useQuerySuggestions, useQueryHistory } from './hooks/useQuery';

// Services
export { queryApi } from './services/queryApi';
