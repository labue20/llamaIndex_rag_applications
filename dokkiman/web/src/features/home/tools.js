/**
 * The tools listed on the homepage, in the top bar and in the footer
 */

// Each tool gets its own accent color (see .home-tool--* in home.scss)
export const TOOLS = [
  {
    id: 'chat',
    icon: 'chat',
    title: 'Chat with PDF',
    text: 'Ask questions and get answers drawn from your document.',
    badge: 'AI',
  },
  {
    id: 'pdf-word',
    icon: 'fileToWord',
    title: 'PDF to Word',
    text: 'Turn a PDF into an editable Word document.',
  },
  {
    id: 'word-pdf',
    icon: 'fileToPdf',
    title: 'Word to PDF',
    text: 'Convert Word files into PDFs that look right everywhere.',
  },
  {
    id: 'split',
    icon: 'scissors',
    title: 'Split PDF',
    text: 'Pull out the pages you need into separate files.',
  },
  {
    id: 'sign',
    icon: 'pen',
    title: 'Sign PDF',
    text: 'Add your signature, initials and the date, with an audit trail.',
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
