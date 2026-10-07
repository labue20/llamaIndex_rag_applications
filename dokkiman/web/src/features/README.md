# Feature Development Template

This directory structure provides a template for adding new features to the RAG application. Each feature should follow this consistent pattern to maintain code organization and ease of maintenance.

## Feature Structure

```
src/features/[feature-name]/
├── components/          # React components specific to this feature
│   ├── ComponentName.js
│   └── index.js        # Export all components
├── hooks/              # Custom React hooks for this feature
│   ├── useFeatureName.js
│   └── index.js        # Export all hooks
├── services/           # API calls and business logic
│   ├── featureApi.js
│   └── index.js        # Export all services
├── styles/             # Feature-specific styles
│   ├── components.scss
│   └── themes.scss     # Optional theme overrides
├── types/              # TypeScript type definitions (if using TS)
│   └── feature.types.js
├── utils/              # Feature-specific utility functions
│   └── helpers.js
├── constants/          # Feature-specific constants
│   └── config.js
└── index.js           # Main feature exports
```

## Adding a New Feature

### 1. Create Feature Structure
```bash
mkdir -p src/features/[feature-name]/{components,hooks,services,styles}
```

### 2. Component Guidelines
- Keep components focused on a single responsibility
- Use custom hooks for complex state management
- Import shared components from `src/shared/components`

### 3. Hook Guidelines
- Create custom hooks for reusable logic
- Use the `use[FeatureName]` naming convention
- Handle loading states, errors, and data consistently

### 4. Service Guidelines
- Centralize all API calls in service files
- Use the shared `apiClient` for HTTP requests
- Handle errors consistently across services

### 5. Style Guidelines
- Use SCSS with the shared variable system
- Follow BEM naming convention for CSS classes
- Import shared styles: `@import '../../../shared/styles/variables';`

### 6. Export Pattern
Each feature should have an index.js file that exports all public components, hooks, and services:

```javascript
// src/features/[feature-name]/index.js
export { default as ComponentName } from './components/ComponentName';
export { useFeatureName } from './hooks/useFeatureName';
export { featureApi } from './services/featureApi';
```

## Examples

### Available Features
- `document-management/` - Document upload, viewing, and management
- `query-interface/` - Query execution and results display
- `authentication/` - User login/logout (template example)

### Potential Future Features
- `analytics/` - Usage tracking and performance metrics
- `export/` - Document and data export functionality
- `collaboration/` - Team features and sharing
- `settings/` - User preferences and configuration
- `notifications/` - Real-time notifications and alerts

## Integration with Main App

To use a feature in the main application:

```javascript
// src/App.js
import { FeatureComponent } from './features/feature-name';

function App() {
  return (
    <div>
      <FeatureComponent />
    </div>
  );
}
```

## Best Practices

1. **Single Responsibility**: Each feature should handle one business domain
2. **Loose Coupling**: Features should not directly depend on each other
3. **Consistent Patterns**: Follow the established patterns for all features
4. **Shared Dependencies**: Use shared components, hooks, and utilities when possible
5. **Documentation**: Document complex features and their public APIs

This structure makes it easy to:
- Add new features without affecting existing code
- Remove features cleanly if needed
- Test features in isolation
- Onboard new developers quickly
- Scale the application as it grows
