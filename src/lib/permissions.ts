/** Client-side helper: the server is the authority — this only decides what to *show*. */
export const hasPerm = (perms: string[] | undefined, ...need: string[]) =>
  !!perms && need.some(p => perms.includes(p));
