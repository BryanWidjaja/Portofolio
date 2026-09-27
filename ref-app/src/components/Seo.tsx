import { Head } from 'vite-react-ssg'
import { site } from '../content/site'

type SeoProps = {
  title: string
  description: string
  /** Route path, e.g. "/about". Resolved against `site.url` for canonical/OG/Twitter tags. */
  path: string
  image?: string
  noindex?: boolean
}

export function Seo({ title, description, path, image = site.ogImage, noindex = false }: SeoProps) {
  const url = new URL(path, site.url).toString()
  const imageUrl = new URL(image, site.url).toString()

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex ? <meta name="robots" content="noindex" /> : null}

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={site.name} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={imageUrl} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
    </Head>
  )
}
