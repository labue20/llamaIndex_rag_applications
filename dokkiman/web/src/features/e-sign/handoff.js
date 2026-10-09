/**
 * Hand a file to E-Sign's Request signatures (for example, a PDF just made in
 * Edit PDF). E-Sign stays mounted while other tools are open, so it listens
 * for files sent its way; one sent before it's listening waits for it.
 */

import { useEffect } from 'react';

let pending = null;
const listeners = new Set();

export const sendForSignature = (file) => {
  pending = file;
  listeners.forEach((listener) => listener());
};

/** Calls onFile(file) with each file sent for signature. */
export const useSignatureHandOff = (onFile) => {
  useEffect(() => {
    const take = () => {
      if (!pending) return;
      const file = pending;
      pending = null;
      onFile(file);
    };
    listeners.add(take);
    take();
    return () => {
      listeners.delete(take);
    };
  }, [onFile]);
};
