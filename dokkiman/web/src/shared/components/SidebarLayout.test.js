import { fireEvent, render, screen, within } from '@testing-library/react';
import SidebarLayout from './SidebarLayout';

const sections = [
  { label: 'Documents', title: 'Documents', content: <p>Documents page</p>, phoneTab: true },
  { label: 'Chat with PDF', title: 'Chat', content: <p>Chat page</p>, phoneTab: true },
  { label: 'Split PDF', title: 'Split', content: <p>Split page</p> },
  { label: 'Compress PDF', title: 'Compress', content: <p>Compress page</p> },
];

test('on phones, sections without a tab are listed under More', () => {
  const onSectionChange = jest.fn();
  render(<SidebarLayout sections={sections} activeSection={0} onSectionChange={onSectionChange} />);

  const more = screen.getByRole('button', { name: 'More' });
  expect(more).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(more);

  const menu = screen.getByRole('menu', { name: 'More tools' });
  expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Split PDF', 'Compress PDF']);
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Compress PDF' }));
  expect(onSectionChange).toHaveBeenCalledWith(3);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();

  // Escape closes it too
  fireEvent.click(more);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

test('no More button when every section has a tab (or none do)', () => {
  render(<SidebarLayout sections={sections.map(({ phoneTab, ...s }) => s)} activeSection={0} />);
  expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
});
