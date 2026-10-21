// Stand-in for `vite` in the Vercel bundle (the dev server is never used there).
export const createServer = async () => { throw new Error('vite is not available in this build'); };
