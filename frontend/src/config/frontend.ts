// The public url of the frontend, used for share links, metadata and the sitemap.
// Only available on the server, and read at runtime so it can be set without rebuilding.
export const getFrontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:1234').replace(/\/+$/, '')
