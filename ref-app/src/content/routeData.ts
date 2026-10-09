import type { LoaderFunctionArgs } from 'react-router-dom'
import type { Project } from './projects'

export type HomeProject = Pick<Project, 'slug' | 'title' | 'year' | 'category' | 'cover'>
export type ProjectDetailData = { project: Project | null; next: Project | null }

export const projectSlugs = ['malware-detection', 'btardew-walley', 'instatags'] as const

export async function homeProjectsLoader(): Promise<HomeProject[] | null> {
  if (!import.meta.env.SSR) return null
  const { projects } = await import('./projects')
  return projects.map(({ slug, title, year, category, cover }) => ({ slug, title, year, category, cover }))
}

export async function projectDetailLoader({ params }: LoaderFunctionArgs): Promise<ProjectDetailData | null> {
  if (!import.meta.env.SSR) return null
  const { projects } = await import('./projects')
  const index = projects.findIndex((project) => project.slug === params.slug)
  return index < 0
    ? { project: null, next: null }
    : { project: projects[index], next: projects[(index + 1) % projects.length] }
}
