/**
 * Admin Users
 * Every account, newest first: search by email (or a signature request's ID,
 * from an abuse report) and filter by plan. Opens an account's details.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, readApiError } from '../../../shared';
import { count, formatDate, STATE_LABELS, timeAgo } from '../format';

const AdminUsers = ({ onOpenUser, reloadKey }) => {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set('q', search);
      if (state) params.set('state', state);
      const response = await apiFetch(`/admin/users?${params}`);
      if (!response.ok) throw new Error(await readApiError(response, 'Couldn’t load accounts.'));
      setData(await response.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, state]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className='admin-users'>
      <form
        className='admin-toolbar admin-toolbar--search'
        role='search'
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(query.trim());
        }}
      >
        <input
          type='search'
          className='admin-input'
          placeholder='Email, or a signature request ID'
          aria-label='Search accounts'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className='admin-input admin-input--select'
          aria-label='Plan'
          value={state}
          onChange={(e) => {
            setPage(1);
            setState(e.target.value);
          }}
        >
          <option value=''>All plans</option>
          {Object.entries(STATE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type='submit' className='admin-btn admin-btn--primary'>Search</button>
      </form>

      {error && <p className='admin-error' role='alert'>{error}</p>}
      {data && (
        <p className='admin-muted' role='status'>
          {isLoading ? 'Loading…' : `${count(data.total)} account${data.total === 1 ? '' : 's'}`}
        </p>
      )}

      {data && data.users.length > 0 && (
        <div className='admin-table-wrap'>
          <table className='admin-table'>
            <thead>
              <tr>
                <th scope='col'>Account</th>
                <th scope='col'>Plan</th>
                <th scope='col'>Joined</th>
                <th scope='col'>Last active</th>
                <th scope='col' className='admin-table__num'>Docs</th>
                <th scope='col' className='admin-table__num'>Requests</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <button type='button' className='admin-link' onClick={() => onOpenUser(u.id)}>{u.email}</button>
                    {u.is_admin && <span className='admin-tag'>Admin</span>}
                  </td>
                  <td>
                    <span className={`admin-plan admin-plan--${u.state}`}>{STATE_LABELS[u.state] || u.state}</span>
                    {u.cancel_at_period_end && <span className='admin-tag admin-tag--warn'>Cancelling</span>}
                    {u.subscription_status === 'past_due' && <span className='admin-tag admin-tag--warn'>Past due</span>}
                  </td>
                  <td>{formatDate(u.created_at)}</td>
                  <td>{timeAgo(u.last_seen_at)}</td>
                  <td className='admin-table__num'>{count(u.documents)}</td>
                  <td className='admin-table__num'>{count(u.signature_requests)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.users.length === 0 && !isLoading && <p className='admin-muted'>No accounts match.</p>}

      {pages > 1 && (
        <nav className='admin-pager' aria-label='Pages'>
          <button type='button' className='admin-btn' disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {pages}</span>
          <button type='button' className='admin-btn' disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </nav>
      )}
    </div>
  );
};

export default AdminUsers;
