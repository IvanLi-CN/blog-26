import { getAsset, getBlogPermalink, getPermalink } from './utils/permalinks';

export const headerData = {
  links: [
    {
      text: '文章',
      href: getBlogPermalink(),
      icon: 'tabler:notebook',
    },
    {
      text: '项目',
      href: getPermalink('/projects'),
      icon: 'tabler:code',
    },
    {
      text: '标签',
      href: getPermalink('/tags'),
      icon: 'tabler:tag',
    },
  ],
};

export const footerData = {
  links: [],
  secondaryLinks: [],
  socialLinks: [
    { ariaLabel: 'Gitea', icon: 'simple-icons:gitea', href: 'https://git.ivanli.cc/Ivan' },
    { ariaLabel: 'Timeline', icon: 'tabler:automatic-gearbox', href: 'https://tl.ivanli.cc/u/ivan' },
    { ariaLabel: 'Matrix', icon: 'tabler:brand-matrix', href: 'https://matrix.to/#/@ivanli:matrix.org' },
    { ariaLabel: 'RSS', icon: 'tabler:rss', href: getAsset('/rss.xml') },
    { ariaLabel: 'Github', icon: 'tabler:brand-github', href: 'https://github.com/IvanLi-CN' },
  ],
  footNote: ``,
};
