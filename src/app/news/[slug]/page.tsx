/**
 * /news/[slug] — Public single news page
 *
 * Phase 1 public projection pages - server component only
 * - Direct Prisma reads for published news
 * - Simple semantic HTML rendering
 * - No markdown rendering, no file fetching yet
 */
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

// This page reads from the database; it must not be statically prerendered at build time.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface NewsEntity {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  contentRef: string | null;
  publishedAt: Date | null;
}

async function getNewsItem(slug: string): Promise<NewsEntity | null> {
  const entity = await prisma.entity.findFirst({
    where: { entityType: "news", slug, status: "published" },
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      contentRef: true,
      publishedAt: true,
    },
  });

  return entity;
}

export default async function NewsItemPage(
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const newsItem = await getNewsItem(slug);

  if (!newsItem) {
    notFound();
  }

  return (
    <article>
      <h1>{newsItem.title}</h1>

      {newsItem.summary && (
        <div>
          <h2>Summary</h2>
          <p>{newsItem.summary}</p>
        </div>
      )}

      {newsItem.contentRef && (
        <div>
          <h2>Content Reference</h2>
          <p>{newsItem.contentRef}</p>
        </div>
      )}

      {newsItem.publishedAt && (
        <div>
          <p>
            Published:{" "}
            <time dateTime={newsItem.publishedAt.toISOString()}>
              {newsItem.publishedAt.toLocaleDateString()}
            </time>
          </p>
        </div>
      )}
    </article>
  );
}
