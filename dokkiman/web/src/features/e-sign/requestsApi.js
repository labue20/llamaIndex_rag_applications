/**
 * Signature request downloads, shared by the Sent tab and the Document Manager
 */

import { apiFetch, downloadBlob, readApiError } from '../../shared';

// part: 'signed' (the original until everyone has signed), 'certificate' or 'combined'
export const downloadRequestDocument = async (request, part = 'signed') => {
  const response = await apiFetch(`/signature-requests/${request.id}/document?part=${part}`);
  if (!response.ok) throw new Error(await readApiError(response, 'Couldn’t download the document.'));
  const stem = request.file_name.replace(/\.pdf$/i, '');
  const names = {
    signed: `${stem}_signed.pdf`,
    certificate: `${stem}_certificate.pdf`,
    combined: `${stem}_signed_with_certificate.pdf`,
  };
  downloadBlob(await response.blob(), request.status === 'completed' ? names[part] : request.file_name);
};

export const fetchSignatureRequests = async () => {
  const response = await apiFetch('/signature-requests');
  if (!response.ok) throw new Error(await readApiError(response, 'Couldn’t load your signature requests.'));
  return (await response.json()).requests;
};
