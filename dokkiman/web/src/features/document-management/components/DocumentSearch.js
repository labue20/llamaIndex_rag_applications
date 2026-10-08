/**
 * Document Search
 * Results for the Document Manager's search box, across every folder: the
 * folders, documents and signature requests that match, each with where it
 * is. Choosing one opens its folder.
 */

import React from 'react';
import { Icon } from '../../../shared';
import { REQUEST_STATUS } from '../../e-sign/fields';

// Every word must appear (in any order), ignoring case
export const matches = (text, query) => {
  const haystack = (text || '').toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
};

const Result = ({ icon, tone, title, detail, where, onOpen, badge }) => (
  <li>
    <button type='button' className='search-results__item' onClick={onOpen}>
      <span className={`search-results__icon search-results__icon--${tone}`} aria-hidden='true'>
        <Icon name={icon} size={16} />
      </span>
      <span className='search-results__text'>
        <span className='search-results__title'>{title}</span>
        <span className='search-results__where'>
          {detail && `${detail} · `}
          {where}
        </span>
      </span>
      {badge}
    </button>
  </li>
);

const DocumentSearch = ({ query, folders, documents, requests, pathOf, nameOf, onOpenFolder }) => {
  const where = (folderId) => (folderId ? `in ${pathOf(folderId)}` : 'in All documents');
  const folderHits = folders.filter((f) => matches(f.name, query));
  const documentHits = documents.filter((d) => matches(nameOf(d), query));
  const requestHits = requests.filter((r) => matches(
    [r.title, r.file_name, ...r.signers.flatMap((s) => [s.name, s.email])].join(' '), query,
  ));
  const total = folderHits.length + documentHits.length + requestHits.length;

  if (total === 0) {
    return <p className='search-results__none'>Nothing matches “{query}”.</p>;
  }

  return (
    <div className='search-results' aria-live='polite'>
      <p className='search-results__count'>{total} {total === 1 ? 'result' : 'results'} for “{query}”</p>
      {folderHits.length > 0 && (
        <section aria-label='Matching folders'>
          <h3 className='folders__heading'>Folders</h3>
          <ul className='search-results__list'>
            {folderHits.map((f) => (
              <Result key={f.id} icon='folder' tone='folder' title={f.name}
                where={f.parent_id ? `in ${pathOf(f.parent_id)}` : 'in All documents'}
                onOpen={() => onOpenFolder(f.id)} />
            ))}
          </ul>
        </section>
      )}
      {documentHits.length > 0 && (
        <section aria-label='Matching documents'>
          <h3 className='folders__heading'>Documents</h3>
          <ul className='search-results__list'>
            {documentHits.map((d) => (
              <Result key={d.id} icon='file' tone='file' title={nameOf(d)} where={where(d.folder_id)}
                onOpen={() => onOpenFolder(d.folder_id || null)} />
            ))}
          </ul>
        </section>
      )}
      {requestHits.length > 0 && (
        <section aria-label='Matching signature requests'>
          <h3 className='folders__heading'>Signature requests</h3>
          <ul className='search-results__list'>
            {requestHits.map((r) => (
              <Result key={r.id} icon='pen' tone='request' title={r.title}
                detail={r.signers.map((s) => s.name).join(', ')} where={where(r.folder_id)}
                onOpen={() => onOpenFolder(r.folder_id || null)}
                badge={<span className={`esign-status esign-status--${r.status}`}>{REQUEST_STATUS[r.status] || r.status}</span>} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default DocumentSearch;
