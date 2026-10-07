import { render } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';

/** Render ui inside an in-memory router starting at the given address. */
export const renderAt = (ui, route = '/') =>
  render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);

/** Shows the current address, so tests can check where navigation went. */
export const CurrentPath = () => <output data-testid='current-path'>{useLocation().pathname}</output>;

/** Stands in for the browser's Back button. */
export const BackButton = () => {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Browser back</button>;
};
