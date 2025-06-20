import { getAsset, getBlogPermalink, getPermalink } from './utils/permalinks';

export const headerData = {
  links: [
    {
      text: 'Post',
      href: getBlogPermalink(),
    },
    // {
    //   text: 'About',
    //   href: getPermalink('/about'),
    // },
    {
      text: 'Tag',
      href: getPermalink('/tags'),
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
