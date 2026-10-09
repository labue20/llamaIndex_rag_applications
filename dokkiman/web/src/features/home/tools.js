/**
 * The tools listed on the homepage and in the top bar. `page` is the tool's
 * public page (src/seo/toolPages.json), which search engines find.
 */

// Each tool gets its own accent color (see .home-tool--* in home.scss)
export const TOOLS = [
  {
    id: 'chat',
    page: '/chat-with-pdf',
    icon: 'chat',
    title: 'Chat with PDF',
    text: 'Ask questions and get answers drawn from your document.',
    badge: 'AI',
  },
  {
    id: 'pdf-word',
    page: '/pdf-to-word',
    icon: 'fileToWord',
    title: 'PDF to Word',
    text: 'Turn a PDF into an editable Word document.',
  },
  {
    id: 'word-pdf',
    page: '/word-to-pdf',
    icon: 'fileToPdf',
    title: 'Word to PDF',
    text: 'Convert Word files into PDFs that look right everywhere.',
  },
  {
    id: 'split',
    page: '/split-pdf',
    icon: 'scissors',
    title: 'Split PDF',
    text: 'Pull out the pages you need into separate files.',
  },
  {
    id: 'compress',
    page: '/compress-pdf',
    icon: 'compress',
    title: 'Compress PDF',
    text: 'Shrink big PDFs and scans so they’re easy to email and upload.',
    badge: 'New',
  },
  {
    id: 'edit',
    page: '/edit-pdf',
    icon: 'edit',
    title: 'Edit PDF',
    text: 'Add text, images and highlights, fill in forms, and reorder or combine pages.',
    badge: 'New',
  },
  {
    id: 'sign',
    page: '/sign-pdf',
    icon: 'pen',
    title: 'E-Sign',
    text: 'Sign documents yourself, or send them to others to sign by email, with an audit trail.',
  },
  {
    id: 'manager',
    icon: 'folder',
    title: 'Document Manager',
    text: 'Keep your uploads in one place, ready to use again.',
  },
];

// Tools that work without an account (the Document Manager needs one)
export const TRYABLE_TOOLS = TOOLS.filter((tool) => tool.id !== 'manager');
