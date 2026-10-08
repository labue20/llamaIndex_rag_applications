/**
 * Folders (GET/POST/PATCH/DELETE /folders, POST /folders/move)
 */

import { apiFetch, readApiError } from '../../../shared/services/apiClient';

const call = async (path, options, fallback) => {
  const response = await apiFetch(path, {
    ...options,
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!response.ok) throw new Error(await readApiError(response, fallback));
  return response.json();
};

export const folderApi = {
  list: async () => (await call('/folders', {}, 'Couldn’t load your folders.')).folders,
  create: async (name, parentId = null) => (await call('/folders', {
    method: 'POST', body: JSON.stringify({ name, parent_id: parentId }),
  }, 'Couldn’t create the folder.')).folder,
  rename: async (id, name) => (await call(`/folders/${id}`, {
    method: 'PATCH', body: JSON.stringify({ name }),
  }, 'Couldn’t rename the folder.')).folder,
  remove: (id) => call(`/folders/${id}`, { method: 'DELETE' }, 'Couldn’t delete the folder.'),
  // folderId null: out of any folder
  move: (folderId, { documentIds = [], requestIds = [] }) => call('/folders/move', {
    method: 'POST',
    body: JSON.stringify({ folder_id: folderId, document_ids: documentIds, request_ids: requestIds }),
  }, 'Couldn’t move the items.'),
};

// "Willow Lane › Leases"
export const folderPath = (folders, folderId) => {
  const byId = Object.fromEntries((folders || []).map((f) => [f.id, f]));
  const parts = [];
  let folder = byId[folderId];
  while (folder) {
    parts.unshift(folder.name);
    folder = byId[folder.parent_id];
  }
  return parts.join(' › ');
};
