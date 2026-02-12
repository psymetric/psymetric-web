/**
 * /news — Public news listing page
 *
 * Phase 1 public projection pages - server component only
 * - Direct Prisma reads for published news
 * - Simple semantic HTML rendering
 * - No client-side logic, no styling framework
 */
import Link from "next/link";
import { prisma } from "@/lib/prisma";

interface NewsEntity {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  publishedAt: Date | null;
}

async function getPublishedNews(): Promise<NewsEntity[]> {
  const items = await prisma.entity.findMany({
    where: { entityType: "news", status: "published" },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: 50,
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      publishedAt: true,
    },
  });
  
  return items;
}

export default async function NewsPage() {
  const newsItems = await getPublishedNews();

  if (newsItems.length === 0) {
    return (
      <div>
        <h1>News</h1>
        <p>No published news yet.</p>
      </div>
    );
  }

  return (
    <div>
      <h1>News</h1>
      <div>
        {newsItems.map((item) => (
          <article key={item.id}>
            <h2>
              <Link href={`/news/${item.slug}`}>
                {item.title}
              </Link>
            </h2>
            {item.summary && <p>{item.summary}</p>}
            {item.publishedAt && (
              <time dateTime={item.publishedAt.toISOString()}>
                {item.publishedAt.toLocaleDateString()}
              </time>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
