import { render, screen } from '@testing-library/react';
import App from './App';

test('renders RAG Web Application header', () => {
  render(<App />);
  const headerElement = screen.getByText(/RAG Web/i);
  expect(headerElement).toBeInTheDocument();
});
