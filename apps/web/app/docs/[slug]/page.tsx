import { notFound } from 'next/navigation'
import { ArticleView } from '../ArticleView'
import { articles } from '../articles'
export function generateStaticParams() { return Object.keys(articles).filter(s=>s!=='guide').map(slug=>({slug})) }
export async function generateMetadata({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params; const article=articles[slug]; return {title:article?.title ?? 'Documentation',description:article?.description}
}
export default async function Page({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params; const article=articles[slug]; if(!article) notFound(); return <ArticleView article={article}/>
}
