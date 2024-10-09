---
title: 自部署的 BaaS 服务对比
date: '2023-01-24'
tags: ['BaaS', 'Self-Hosted', 'appwrite', 'nhost', 'supabase']
draft: false
summary: supabase、nhost、appwrite 之间的对比，关注自部署方向。
---

BaaS，后端即服务。
最近关注 BaaS 自部署主要还是因为自己有一些简单的服务端开发需求，可能就一两个函数的事。
如果专门去写一个后端，显得有些铺张了。而且创建一个项目是个麻烦事，我也不愿意从旧项目复制可能已经过时代码进来，所以就想到 FaaS。
但是 FaaS 我搜罗了一圈，适合个人自部署的 FaaS 平台少之又少，最后找了个 Serverless 的函数项目 [Trusted CGI](https://trusted-cgi.reddec.net/)（[Repo](https://github.com/reddec/trusted-cgi)，Go Lang）。
这个挺适合个人使用，但是无状态意味着我还得自己搞状态存储，还是不太符合我的需求，所以就看上了 BaaS。

## BaaS 简要介绍

目前 BaaS 大概是用户管理、授权、认证，加上数据库设计和存储、对象存储，再加上各类的 event hook 和 push，再加上 Serverless Functions 构成的。这个组件构成非常适合原型、Demo 以及轻量的应用开发。
当然，如果后续有性能瓶颈，至少垂直扩展和 functions 层水平扩展是没有任何问题。至于持久层的水平扩展，也能像传统方案处理。

BaaS 最佳的应用场景就是各类 Apps 的服务端了。包括 Web Apps 在内，主要业务由 Apps 端处理的话，BaaS 就是绝佳的生产力工具。而且服务端的业务逻辑基本上都是写在 Serverless Functions 里，所以根本不需要考虑升级会暂停服务，因为它是无状态的，更新时是能做到零秒重载的。

更权威的定义可以看[这里](https://www.cloudflare.com/zh-cn/learning/serverless/glossary/backend-as-a-service-baas/)。

## 对比

适合生产的环境自然也就是各大平台自有的云 BaaS 平台了，在他们各自的云平台上，你可以享受到完整、轻松的开发体验。但是这是对于企业和专业用途的个人用户，而玩票性质的我就暂时用不上了，所以我的目标就是开源的、可自部署的 BaaS 服务。

我淘了好久，找到了三个不错的开源项目，分别是 supabase <img alt="Packagist Stars" class="inline" src="https://img.shields.io/packagist/stars/appwrite/appwrite?style=social"/>、appwrite <img alt="Packagist Stars" class="inline" src="https://img.shields.io/packagist/stars/nhost/nhost?style=social"/>、nhost <img alt="Packagist Stars" class="inline" src="https://img.shields.io/packagist/stars/appwrite/appwrite?style=social"/>。他们仨在 Github 上的 Stars 目前是从多到少的。
接下来就以自部署的角度来对比下他们三个之间的差异。

TL; DR, 如果小项目多，推荐使用 appwrite；如果现阶段需要表的关联，建议使用 nhost；supabase 不适合自部署，他没有可以自部署的 serverless functions。

### Supabase

Github 上的星星老多了，可以说是目前最火的 BaaS 项目了。他对标的是  Firebase，以  Firebase 的开源版本自居。
