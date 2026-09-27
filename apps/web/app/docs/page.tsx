import { ArticleView } from './ArticleView'
import { articles } from './articles'
export const metadata = { title: 'Documentation', description: articles.guide!.description }
export default function DocsPage() { return <ArticleView article={articles.guide!}/> }
