---
publishDate: 2021-10-06T00:00:00Z
title: TypeScript + TS-Node + ESM 造成的尴尬局面
---

# ES Module 入坑 —— 只因引入纯 ESM Package

最近在开发一个 package，添加了一个以 ESM 构建的 package。结果翻车了……终于，在激进的上游开发者面前，我接受了他~~真诚~~强力的邀请，步入了 ESM 的天堂中……先说结论：确实可冲，虽然有传染性，但是下游改成 ESM 成本并不会特别大。Nest.js 框架是能支持 ESM 的，目前用着还行，Emmm

## 事故现场

当我开发完成后，使用 ts-node 运行示例代码，出现了下面的错误信息：

> ```shell
> > DEBUG=* ts-node ./examples/config-loader.ts
> 
> Error [ERR_REQUIRE_ESM]: Must use import to load ES Module: /Users/example/Projects/Fennec/configuration/node_modules/find-up/index.js
> require() of ES modules is not supported.
> require() of /Users/example/Projects/Fennec/configuration/node_modules/find-up/index.js from /Users/example/Projects/Fennec/configuration/src/config-loader.ts is an ES module file as it is a .js file whose nearest parent package.json contains "type": "module" which defines all .js files in that package scope as ES modules.
> Instead rename index.js to end in .cjs, change the requiring code to use import(), or remove "type": "module" from /Users/example/Projects/Fennec/configuration/node_modules/find-up/package.json.
> ```

错误信息明确地告诉了我们这个错误源自 `require()` 引用了 ES modules。而想要解决这个问题，要么使用 `import()` 引入，要么去改动被依赖的 pageage 中的 `package.json` 文件。

## 前置知识

### Javascript 模块

Javascript 一开始就是个纯粹的脚本语言，短小精悍。不过时代在发展，JavaScript 也是一样。现在 许多 的 Javascript 程序十分庞大，所以社区已经出现了许多 Javascript Module 解决方案。

AMD、CJS、 ESM 都是 JavaScript 模块化相关规范。`AMD + CJS = UMD`！目前 CJS 和 ESM 是主流的方案，但可以预见，不久的将来，ESM 将会一统江湖。（不然我今天能掉进这个天坑里吗？）

CommonJS，缩写 `CJS`，是 Node.js 使用的模块格式。他只能同步导入模块。示例代码如下：

```js
// importing 
const doSomething = require('./doSomething.js'); 

// exporting
module.exports = function doSomething() {
  // do something
}
```

ECMAScript Module，缩写 `ESM`。看名字就知道，这是官方标准化的模块系统。示例代码如下：

``` js
// importing
import { doSomething } from 'doSomething.js';

//exporting
export function doSomething() {
  // do something
}

// importing asyncly
const { doSomething } = await import('doSometing.js')
```

ESM 支持 Tree-shakeable，目前适用于绝大多数的现代浏览器，且支持直接在 HTML 中调用：

```html
<script type="module">
  import {func1} from 'my-lib';

  func1();
</script>
```

参考阅读：

- *[What are CJS, AMD, UMD, and ESM in Javascript?](https://dev.to/iggredible/what-the-heck-are-cjs-amd-umd-and-esm-ikm)*

- *[ESM 浏览器兼容性](https://caniuse.com/es6-module)*

### NodeJS 与 ESM

> <details class="changelog" open="" style="box-sizing: border-box;"><summary style="box-sizing: border-box; margin: 0.5rem 0px; padding: 0.5rem 0px; cursor: pointer;">History</summary><slot name="user-agent-default-slot" id="details-content"><table style="box-sizing: border-box; border-collapse: collapse; margin: 0px 0px 1.5rem;"><tbody style="box-sizing: border-box;"><tr style="box-sizing: border-box;"><th style="box-sizing: border-box; border: 1px solid rgb(170, 170, 170); padding: 0.75rem 1rem; vertical-align: top; text-align: left;">Version</th><th style="box-sizing: border-box; border: 1px solid rgb(170, 170, 170); padding: 0.75rem 1rem; vertical-align: top; text-align: left;">Changes</th></tr><tr style="box-sizing: border-box;"><td style="box-sizing: border-box; border: 1px solid rgb(170, 170, 170); padding: 0.75rem 1rem; vertical-align: top; word-break: normal;">v14.8.0</td><td style="box-sizing: border-box; border: 1px solid rgb(170, 170, 170); padding: 0.75rem 1rem; vertical-align: top; word-break: break-word;"><p style="box-sizing: border-box; text-rendering: optimizelegibility; margin: 0px; line-height: 1.5;">Unflag Top-Level Await.</p></td></tr><tr style="box-sizing: border-box;"><td style="box-sizing: border-box; border: 1px solid rgb(170, 170, 170); padding: 0.75rem 1rem; vertical-align: top; word-break: normal;">v15.3.0, v12.22.0</td><td style="box-sizing: border-box; border: 1px solid rgb(170, 170, 170); padding: 0.75rem 1rem; vertical-align: top; word-break: break-word;"><p style="box-sizing: border-box; text-rendering: optimizelegibility; margin: 0px; line-height: 1.5;">Stabilize modules implementation.</p></td></tr><tr style="box-sizing: border-box;"><td style="box-sizing: border-box; border: 1px solid rgb(170, 170, 170); padding: 0.75rem 1rem; vertical-align: top; word-break: normal;">v14.13.0, v12.20.0</td><td style="box-sizing: border-box; border: 1px solid rgb(170, 170, 170); padding: 0.75rem 1rem; vertical-align: top; word-break: break-word;"><p style="box-sizing: border-box; text-rendering: optimizelegibility; margin: 0px; line-height: 1.5;">Support for detection of CommonJS named exports.</p></td></tr><tr style="box-sizing: border-box;"><td style="box-sizing: border-box; border: 1px solid rgb(170, 170, 170); padding: 0.75rem 1rem; vertical-align: top; word-break: normal;">v14.0.0, v13.14.0, v12.20.0</td><td style="box-sizing: border-box; border: 1px solid rgb(170, 170, 170); padding: 0.75rem 1rem; vertical-align: top; word-break: break-word;"><p style="box-sizing: border-box; text-rendering: optimizelegibility; margin: 0px; line-height: 1.5;">Remove experimental modules warning.</p></td></tr><tr style="box-sizing: border-box;"><td style="box-sizing: border-box; border: 1px solid rgb(170, 170, 170); padding: 0.75rem 1rem; vertical-align: top; word-break: normal;">v13.2.0, v12.17.0</td><td style="box-sizing: border-box; border: 1px solid rgb(170, 170, 170); padding: 0.75rem 1rem; vertical-align: top; word-break: break-word;"><p style="box-sizing: border-box; text-rendering: optimizelegibility; margin: 0px; line-height: 1.5;">Loading ECMAScript modules no longer requires a command-line flag.</p></td></tr><tr style="box-sizing: border-box;"><td style="box-sizing: border-box; border: 1px solid rgb(170, 170, 170); padding: 0.75rem 1rem; vertical-align: top; word-break: normal;">v12.0.0</td><td style="box-sizing: border-box; border: 1px solid rgb(170, 170, 170); padding: 0.75rem 1rem; vertical-align: top; word-break: break-word;"><p style="box-sizing: border-box; text-rendering: optimizelegibility; margin: 0px; line-height: 1.5;">Add support for ES modules using<span>&nbsp;</span><code style="box-sizing: border-box; font-family: SFMono-Regular, Menlo, Consolas, &quot;Liberation Mono&quot;, &quot;Courier New&quot;, monospace; font-size: 0.9em; line-height: 1.5rem; margin: 0px; padding: 1px 3px; color: rgb(4, 4, 4); background-color: rgb(242, 242, 242); border-radius: 2px;">.js</code><span>&nbsp;</span>file extension via<span>&nbsp;</span><code style="box-sizing: border-box; font-family: SFMono-Regular, Menlo, Consolas, &quot;Liberation Mono&quot;, &quot;Courier New&quot;, monospace; font-size: 0.9em; line-height: 1.5rem; margin: 0px; padding: 1px 3px; color: rgb(4, 4, 4); background-color: rgb(242, 242, 242); border-radius: 2px;">package.json</code><span>&nbsp;</span><code style="box-sizing: border-box; font-family: SFMono-Regular, Menlo, Consolas, &quot;Liberation Mono&quot;, &quot;Courier New&quot;, monospace; font-size: 0.9em; line-height: 1.5rem; margin: 0px; padding: 1px 3px; color: rgb(4, 4, 4); background-color: rgb(242, 242, 242); border-radius: 2px;">"type"</code><span>&nbsp;</span>field.</p></td></tr><tr style="box-sizing: border-box;"><td style="box-sizing: border-box; border: 1px solid rgb(170, 170, 170); padding: 0.75rem 1rem; vertical-align: top; word-break: normal;">v8.5.0</td><td style="box-sizing: border-box; border: 1px solid rgb(170, 170, 170); padding: 0.75rem 1rem; vertical-align: top; word-break: break-word;"><p style="box-sizing: border-box; text-rendering: optimizelegibility; margin: 0px; line-height: 1.5;"><span style="box-sizing: border-box; margin-right: 0px;">Added in: v8.5.0</span></p></td></tr></tbody></table></slot></details>

上面是 Node.js 在每个版本中对 ESM 作出的修改。简单地说 v12、v14、v16 的最新的次版本都是标准支持 ESM，而 v8 仅是实验性支持。

参考阅读：

- https://nodejs.org/dist./v8.14.1/docs/api/esm.html
- https://nodejs.org/api/esm.html#esm_modules_ecmascript_modules

## ESM 现状

目前，javascript 庞大的生态中， CJS 是绝对的主流，ESM 也在逐渐壮大。不过目前大多数支持 ESM 的 package 也一并提供了 CJS 文件。不过我这次恰巧遇到了个不提供 CJS 的……这个有些激进的 package 作者也是受到了一些争议。迁移到 ESM 是大势所趋，而且有著名的 Node.js 生态贡献者已经着手拒绝 CJS 了，但是目前社区并没有完全做好从 CJS 到 ESM 的迁移的准备，所以这阵痛期可能还会持续一段时间……

### ESM 在 TypeScript 中的处境

我一般会选用 TypeScript 开发项目，所以 TypeScript 对 ESM 的支持对于我的来说是很重要的。TypeSciprt 使用的是 ECMAScript 2015 相同的语法来 import 和 export 模块的。通过以下配置启用 ESM 输出：

```json
// tsconfig.json
{
  "compilerOptions": {
    "module": "es2020", // es2015, es6, esnext 都行
    "moduleResolution": "Node"
  }
}
```

目前在 TypeScript 4.5 Beta 中，提供了两个新的 `module` 选项：`node12` 和 `nodenext`。配置为这两个值时，会根据 [Node.js 定义的情况](/#Node.js%20%E5%A6%82%E4%BD%95%E5%8C%BA%E5%88%86%20CJS%20%E6%A8%A1%E5%9D%97%E5%92%8C%20ESM%20%E6%A8%A1%E5%9D%97%EF%BC%9F)来区分如何当前文件编译是采用 CJS 的语法还是 ESM 的语法。

如果配置为 `node12` 或 `nodenext` 时，VS Code 有语法错误提示，可以更新下 TypeScript 扩展到开发版，毕竟 TypeScript 4.5 还没正式发布。

### Node.js 如何区分 CJS 模块和 ESM 模块？

CJS 模块的文件名使用 `*.cjs` 结尾，而 ESM 模块的文件名采用 `*.mjs` 结尾。那 `*.js` 文件的时代结束了？并没有！在 `package.json` 中的 `type` 字段值为 `commonjs` 时，默认 `*.js` 文件为 CJS 模块；当值为 `module` 时，默认 `*.js` 文件为 ESM 模块。如果 没提供 `type` 字段，默认为 CJS 模块。

### 如何开发 ESM 项目

开发一个 ESM 项目，或者说迁移一个项目到 ESM， 首先需要修改 `package.json` 文件：

```json
{
  "name": "esm-project",
  "version": "1.0.0",
  "main": "src/main.mjs"
}
// or
{
  "name": "esm-project",
  "version": "1.0.0",
  "main": "src/main.js",
  "type": "module"
}
```

第一种方式是直接导出 ESM 模块文件，第二种方式是将项目默认设为 ESM 类型的项目，这样 `src/main.js` 相当于 `src/main.mjs`。推荐使用第二种，避免兼容性问题。

源码文件中，使用 import 和 export 语法来导入导出模块。并且要写明文件名及其后缀，不可省略：

```js
import { func } from './commons/index.js'; // √
import { func } from './commons';  // ×
import { func } from './commons/index'; // ×

import { func } from './mjs/index.mjs'; // √
import { func } from './cjs/index.cjs'; // √
```

Javascript 文件名则应该根据需要写为 `*.mjs` 或 *.`cjs`；或者默认为 *.`js` 时，通过修改 `package.json` 中的 `type` 字段来控制。

对于 TypeScript 来说，你还是得使用 `*.js` 的文件名，而不是 `*.ts`。在 TypeScript 4.5 Beta 中，你可以使用 `*.mts`、`*.cts` 作为文件名，但引入时仍然应该对应地写作 `*.mjs`、`*.cjs`。原因是 TypeScript 团队认为他们只做纯粹的转换，而不应该改变原始代码。是不是十分的别扭？

```ts
// TypeScript
import { func } from './commons/index.js'; // √
import { func } from './mjs/index.mjs'; // √
import { func } from './cjs/index.cjs'; // √
```

附送一个全局替换的正则表达式：`(\s+from\s+(['"])\.\S+)(?<!\.[jt]s)['"]` -> `$1.js$2`。

开发工具目前在 import 时，还只是乖巧地帮你省略缺省路径，所以得配置下。以 VS Code 举例，

### TS-Node

 TS-Node 在 ESM 的问题上已经卡了一年半了……不过还好，官方早早地就给出了临时的解决方案（似乎已经临时很久了）要求在 `package.json` 中将 `type` 设为 `module` 后，使用下面的命令来执行你的脚本：

```shell
node --loader ts-node/esm ./my-script.ts

# To force the use of a specific tsconfig.json, use the TS_NODE_PROJECT environment variable
TS_NODE_PROJECT="path/to/tsconfig.json" node --loader ts-node/esm ./my-script.ts
```

## 小结

说实话，虽然很早就知道 Node.js 有支持 ESM 的计划了，但后面一直使用 TypeScript 后，就再也没在 Node.js 中关心 ESM 相关的事了，没想到这次突然遇到了纯的 ESM Package。这次查阅了一些资料后，才大概了解了情况。期待 ESM 一统江湖的那一天，目前情况应该是能迁移但不能十分放心地迁移到 ESM。我已经迁移啦，尤其是这次开发底层 Package 时，~~被迫~~迁移到 ESM 后，我的这堆项目应该也就要愉快地一并迁移过去了，希望不要被坑。 毕竟我也想吃上 ESM。

这是 Sindre Sorhus 大佬总结的精华，想要了解更多可以看这个：https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

