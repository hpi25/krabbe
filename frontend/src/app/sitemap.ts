import { MetadataRoute } from 'next'

import { getFrontendUrl } from '/src/config/frontend'

// Rendered per request so the frontend url can be set at runtime
export const dynamic = 'force-dynamic'

const sitemap = (): MetadataRoute.Sitemap => [
  {
    url: `${getFrontendUrl()}/`,
    priority: 1,
  },
  {
    url: `${getFrontendUrl()}/how-to`,
    priority: 0.4,
  },
]

export default sitemap
