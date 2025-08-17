interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  body: string;
  image?: string;
  author?: string;
  category?: string;
  tags?: string;
  publishDate: number;
  updateDate?: number;
  public?: boolean;
  draft?: boolean;
}

interface StructuredDataProps {
  post: Post;
}

export default function StructuredData({ post }: StructuredDataProps) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const postUrl = `${baseUrl}/posts/${post.slug}`;
  const imageUrl = post.image ? (post.image.startsWith('http') ? post.image : `${baseUrl}${post.image}`) : `${baseUrl}/og-image.png`;

  // Article 结构化数据
  const articleStructuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": post.title,
    "description": post.excerpt || post.title,
    "image": [imageUrl],
    "datePublished": new Date(post.publishDate * 1000).toISOString(),
    ...(post.updateDate && post.updateDate !== post.publishDate && {
      "dateModified": new Date(post.updateDate * 1000).toISOString(),
    }),
    "author": {
      "@type": "Person",
      "name": post.author || "Ivan Li",
      "url": baseUrl,
      "sameAs": [
        "https://github.com/ivanli",
        "https://twitter.com/ivanli_cc",
        "https://linkedin.com/in/ivanli"
      ]
    },
    "publisher": {
      "@type": "Organization",
      "name": "Ivan's Blog",
      "url": baseUrl,
      "logo": {
        "@type": "ImageObject",
        "url": `${baseUrl}/logo.png`,
        "width": 512,
        "height": 512
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": postUrl
    },
    "url": postUrl,
    ...(post.category && {
      "articleSection": post.category
    }),
    ...(post.tags && {
      "keywords": post.tags.split(',').map(tag => tag.trim())
    }),
    "inLanguage": "zh-CN",
    "isAccessibleForFree": true,
    "creativeWorkStatus": post.draft ? "Draft" : "Published"
  };

  // BreadcrumbList 结构化数据
  const breadcrumbStructuredData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "首页",
        "item": baseUrl
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "文章",
        "item": `${baseUrl}/posts`
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": post.title,
        "item": postUrl
      }
    ]
  };

  // WebSite 结构化数据
  const websiteStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Ivan's Blog",
    "url": baseUrl,
    "description": "Ivan Li 的个人博客，分享技术文章、项目经验和思考",
    "inLanguage": "zh-CN",
    "author": {
      "@type": "Person",
      "name": "Ivan Li",
      "url": baseUrl
    },
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": `${baseUrl}/search?q={search_term_string}`
      },
      "query-input": "required name=search_term_string"
    }
  };

  return (
    <>
      {/* Article 结构化数据 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(articleStructuredData, null, 2)
        }}
      />
      
      {/* BreadcrumbList 结构化数据 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbStructuredData, null, 2)
        }}
      />
      
      {/* WebSite 结构化数据 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteStructuredData, null, 2)
        }}
      />
    </>
  );
}
