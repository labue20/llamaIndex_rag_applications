/**
 * Pass files chosen on a public tool page (e.g. /compress-pdf) to the tool in
 * the app (/app/compress-pdf), which opens them when it's shown.
 */

let pending = null; // { slug, files }

export const handFilesToTool = (slug, files) => {
  pending = { slug, files: [...files] };
};

/** The files waiting for this tool (once), or null. */
export const takeFilesForTool = (slug) => {
  if (!pending || pending.slug !== slug) return null;
  const { files } = pending;
  pending = null;
  return files;
};
