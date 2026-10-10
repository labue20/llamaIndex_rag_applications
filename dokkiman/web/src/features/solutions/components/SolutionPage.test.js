import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SolutionPage from './SolutionPage';
import SolutionsIndexPage from './SolutionsIndexPage';
import SOLUTION_PAGES from '../../../seo/solutionPages.json';
import TOOL_PAGES from '../../../seo/toolPages.json';

const pageAt = (path) => SOLUTION_PAGES.find((p) => p.path === path);

test('a solution page shows its jobs, each linking to the tool for it', () => {
  render(<MemoryRouter><SolutionPage page={pageAt('/solutions/real-estate')} /></MemoryRouter>);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Leases and offers');
  const jobs = screen.getByRole('region', { name: 'What you can get done' });
  // Others sign it: Request Signatures, not Sign Documents
  expect(within(jobs).getByRole('link', { name: /Get a lease signed/ })).toHaveAttribute('href', '/request-signatures');
  expect(within(screen.getByRole('main')).getByRole('button', { name: 'Start free trial' })).toBeInTheDocument();
});

test('signed-in visitors aren’t offered the trial', () => {
  render(<MemoryRouter><SolutionPage page={pageAt('/solutions/legal')} isLoggedIn /></MemoryRouter>);
  expect(screen.queryByRole('button', { name: /free trial|Try it free/ })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Open the app' }).length).toBeGreaterThan(0);
});

test('the Solutions page lists every solution by group', () => {
  render(<MemoryRouter><SolutionsIndexPage /></MemoryRouter>);
  const bySize = screen.getByRole('region', { name: 'By business size' });
  const byIndustry = screen.getByRole('region', { name: 'By industry' });
  expect(within(bySize).getAllByRole('link')).toHaveLength(SOLUTION_PAGES.filter((p) => p.group === 'size').length);
  expect(within(byIndustry).getAllByRole('link')).toHaveLength(SOLUTION_PAGES.filter((p) => p.group === 'industry').length);
});

test('every solution page has what search engines and the page need, and links to real tools', () => {
  const tools = TOOL_PAGES.map((p) => p.path);
  const paths = SOLUTION_PAGES.map((p) => p.path);
  expect(new Set(paths).size).toBe(paths.length);
  SOLUTION_PAGES.forEach((page) => {
    expect(page.path).toMatch(/^\/solutions\/[a-z-]+$/);
    expect(['size', 'industry']).toContain(page.group);
    expect(page.title.length).toBeLessThanOrEqual(65);
    expect(page.description.length).toBeLessThanOrEqual(160);
    page.jobs.forEach((job) => expect(tools).toContain(job.tool));
  });
});
