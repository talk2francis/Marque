import { notFound } from 'next/navigation'
import { ArticleView } from '../ArticleView'
import { articles } from '../articles'

export function generateStaticParams() { return Object.keys(articles).map((slug) => ({ slug })) }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = articles[slug]
  return { title: article?.label ?? 'Documentation', description: article?.description }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = articles[slug]
  if (!article) notFound()
  return <ArticleView slug={slug} article={article} />
}
