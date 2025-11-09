// 导航配置文件 - 迁移自旧版 old/src/navigation.ts

export interface NavLink {
  text: string;
  href: string;
  icon: string;
}

export interface SocialLink {
  ariaLabel: string;
  icon: string;
  href: string;
}

export const headerData = {
  links: [
    {
      text: "闪念",
      href: "/memos",
      icon: "tabler:notes",
    },
    {
      text: "文章",
      href: "/posts",
      icon: "tabler:notebook",
    },
    {
      text: "项目",
      href: "/projects",
      icon: "tabler:code",
    },
    {
      text: "标签",
      href: "/tags",
      icon: "tabler:tag",
    },
  ] as NavLink[],
};

export const footerData = {
  links: [],
  secondaryLinks: [],
  socialLinks: [
    { ariaLabel: "Gitea", icon: "tabler:brand-git", href: "https://git.ivanli.cc/Ivan" },
    {
      ariaLabel: "Timeline",
      icon: "tabler:automatic-gearbox",
      href: "https://tl.ivanli.cc/u/ivan",
    },
    {
      ariaLabel: "Matrix",
      icon: "tabler:brand-matrix",
      href: "https://matrix.to/#/@ivanli:matrix.org",
    },
    { ariaLabel: "RSS", icon: "tabler:rss", href: "/rss.xml" },
    { ariaLabel: "Github", icon: "tabler:brand-github", href: "https://github.com/IvanLi-CN" },
  ] as SocialLink[],
  footNote: "",
};
