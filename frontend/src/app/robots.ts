import { MetadataRoute } from 'next'

import { getFrontendUrl } from '/src/config/frontend'

// Rendered per request so the frontend url can be set at runtime
export const dynamic = 'force-dynamic'

const robots = (): MetadataRoute.Robots => ({
  rules: {
    userAgent: '*',
    allow: [
      '/$',
      '/how-to$',
      '/*.xml$',
      '/*.js$',
      '/*.css$',
      '/*.json$',
      '/*.webmanifest$',
      '/*.woff$',
      '/*.woff2$',
      '/*.ttf$',
      '/*.png$',
      '/*.ico$',
      '/*.svg$',
    ],
    disallow: '*',
  },
  sitemap: `${getFrontendUrl()}/sitemap.xml`,
})

export default robots
