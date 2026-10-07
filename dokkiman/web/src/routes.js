/**
 * Web addresses for the app's screens
 */

// /app/<slug> for each section of the app, in sidebar order
export const APP_SECTION_SLUGS = ['documents', 'chat', 'pdf-to-word', 'word-to-pdf', 'split-pdf', 'sign-pdf'];

export const appPath = (slug) => `/app/${slug}`;

// Tool ids used on the homepage -> their address
export const TOOL_PATHS = {
  manager: appPath('documents'),
  chat: appPath('chat'),
  'pdf-word': appPath('pdf-to-word'),
  'word-pdf': appPath('word-to-pdf'),
  split: appPath('split-pdf'),
  sign: appPath('sign-pdf'),
};

// Where people land after signing in or creating an account
export const HOME_AFTER_LOGIN = appPath('documents');
