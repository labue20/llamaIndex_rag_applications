/**
 * Admin Portal (/admin)
 * For accounts in the server's ADMIN_EMAILS: Overview (stats) and Users.
 * The server checks admin rights on every request; this page only hides itself.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../../../shared/components/Icon';
import LogoMark from '../../../shared/components/LogoMark';
import { HOME_AFTER_LOGIN } from '../../../routes';
import AdminOverview from './AdminOverview';
import AdminUsers from './AdminUsers';
import AdminUserPanel from './AdminUserPanel';
import '../styles/admin.scss';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
];

const AdminPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'users' ? 'users' : 'overview';
  const [openUserId, setOpenUserId] = useState(null);
  // Bumped after a change, so lists show it
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    document.title = 'Admin · Dokkiman';
  }, []);

  const closeUser = useCallback(() => setOpenUserId(null), []);
  const changed = useCallback(() => setReloadKey((k) => k + 1), []);

  return (
    <div className='admin-page'>
      <header className='admin-page__nav'>
        <Link to='/' className='admin-page__brand' aria-label='Dokkiman home'>
          <span className='admin-page__logo'><LogoMark size={16} /></span>
          Dokkiman <span className='admin-tag'>Admin</span>
        </Link>
        <Link to={HOME_AFTER_LOGIN} className='admin-page__back'>
          <Icon name='arrowLeft' size={16} /> Back to the app
        </Link>
      </header>

      <main className='admin-page__body'>
        <h1 className='admin-page__title'>Admin</h1>
        <div className='admin-tabs' role='tablist' aria-label='Admin sections'>
          {TABS.map((t) => (
            <button
              key={t.id}
              type='button'
              role='tab'
              id={`admin-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`admin-panel-${t.id}`}
              className={`admin-tabs__tab ${tab === t.id ? 'admin-tabs__tab--active' : ''}`}
              onClick={() => setParams(t.id === 'overview' ? {} : { tab: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role='tabpanel' id={`admin-panel-${tab}`} aria-labelledby={`admin-tab-${tab}`}>
          {tab === 'overview' ? (
            <AdminOverview key={reloadKey} onOpenUser={setOpenUserId} />
          ) : (
            <AdminUsers onOpenUser={setOpenUserId} reloadKey={reloadKey} />
          )}
        </div>
      </main>

      {openUserId && <AdminUserPanel userId={openUserId} onClose={closeUser} onChanged={changed} />}
    </div>
  );
};

export default AdminPage;
