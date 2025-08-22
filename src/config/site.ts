// 站点配置文件

// 站点配置接口定义
interface SiteConfig {
  name: string;
  title: string;
  description: string;
  owner: string;
  url: string;
  author: {
    name: string;
    email: string;
  };
  keywords: string[];
  social: {
    twitter: string;
    github: string;
    gitea: string;
    matrix: string;
    timeline: string;
  };
  images: {
    default: string;
    favicon: string;
  };
  seo: {
    openGraph: {
      type: string;
      locale: string;
      siteName: string;
    };
    twitter: {
      card: string;
      creator: string;
      site: string;
    };
  };
}

export const SITE: SiteConfig = {
  name: "Ivan's Blog",
  title: "Ivan's Blog",
  description: "记录技术探索、生活感悟和创意想法的个人空间",
  owner: "Ivan Li",
  url: "https://blog.ivanli.cc",
  author: {
    name: "Ivan Li",
    email: "ivanli2048@gmail.com",
  },
  keywords: [
    "技术博客",
    "编程",
    "前端开发",
    "后端开发",
    "Ivan Li",
    "TypeScript",
    "React",
    "Next.js",
  ],
  social: {
    twitter: "@ivanli_cc",
    github: "IvanLi-CN",
    gitea: "https://git.ivanli.cc/Ivan",
    matrix: "https://matrix.to/#/@ivanli:matrix.org",
    timeline: "https://tl.ivanli.cc/u/ivan",
  },
  images: {
    default: "/og-image.png",
    favicon: "/favicon.ico",
  },
  seo: {
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: "Ivan's Blog",
    },
    twitter: {
      card: "summary_large_image",
      creator: "@ivanli_cc",
      site: "@ivanli_cc",
    },
  },
};

export const UI = {
  theme: {
    default: "system",
    mainThemes: ["system", "light", "dark"],
    lightThemes: [
      "light",
      "cupcake",
      "bumblebee",
      "emerald",
      "corporate",
      "retro",
      "cyberpunk",
      "valentine",
      "garden",
      "lofi",
      "pastel",
      "fantasy",
      "wireframe",
      "cmyk",
      "autumn",
      "acid",
      "lemonade",
      "winter",
      "nord",
      "sunset",
      "caramellatte",
      "silk",
    ],
    darkThemes: [
      "dark",
      "synthwave",
      "halloween",
      "forest",
      "aqua",
      "black",
      "luxury",
      "dracula",
      "business",
      "night",
      "coffee",
      "dim",
      "abyss",
    ],
    allThemes: [
      "light",
      "dark",
      "cupcake",
      "bumblebee",
      "emerald",
      "corporate",
      "synthwave",
      "retro",
      "cyberpunk",
      "valentine",
      "halloween",
      "garden",
      "forest",
      "aqua",
      "lofi",
      "pastel",
      "fantasy",
      "wireframe",
      "black",
      "luxury",
      "dracula",
      "cmyk",
      "autumn",
      "business",
      "acid",
      "lemonade",
      "night",
      "coffee",
      "winter",
      "dim",
      "nord",
      "sunset",
      "caramellatte",
      "abyss",
      "silk",
    ],
  },
};
