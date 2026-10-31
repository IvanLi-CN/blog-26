# Manual Version Release 主题记录

## Lifecycle / Compatibility

本主题为 active，定义静态前台和完整功能 Docker 镜像共享产品版本的手动发版合同。

## Related Changes

- 基础清理与合同提交：`260692f8be487574ee6227c81f65be4a576a2f6a`。
- 迁移边界：该提交删除旧的 PR-label/label-gate/release workflow 与文档；当前入口为 `.github/workflows/manual-product-release.yml`，`.github/workflows/product-release.yml` 只消费已登记的发布身份。
- 手动发布实现引入独立签名登记分支、原运行冻结产物、只读版本端点及统一静态/GHCR 发布链路；内置令牌签名探针已核验，最终候选验证与审查记录由实现 PR 承载。
- [PR #171](https://github.com/IvanLi-CN/blog-26/pull/171) 将原生令牌的正式版手动发布实现合并至 main，合并提交为 `8bfc0b602fd849bc129763c97c46821afc9749be`；该实现合并不触发产品发布，合并本身不构成真实发版验收。
- 产品预发布需求讨论确认 alpha/beta/rc 与正式版共享两种产物及单一版本请求入口，预发布不部署站点、不推进正式 latest；相应解析、分配及完成条件仍待实现和真实发布验收。
- 版本请求讨论确认留空/stable 和 alpha/beta/rc 快捷值、完整版本精确指定；同一目标允许阶段跳跃，向更早阶段的自动请求停止，由发版人显式选择更高完整目标。正式语义基线和已占用版本约束分开判断。
- 主人确认整体需求收敛；正式自动分配请求统一命名为 stable。需求确认不代替实现或真实发布验收。
- `th/product-prerelease` 候选实现统一解析与分配、预发布完成登记、两种产物 metadata 和部署密钥隔离；针对性合同测试通过。Agent VM 准入受共享内存配额占满阻断，完整构建、平台实证、实现 PR 合并与真实 alpha 验收尚未完成。
- 候选同步至远端 `main` 的 `ec6d69799380de5b2266798d802ebd871d685cd2` 后，修复了既有 `2.8.0` 登记身份摘要兼容与完整 verified 影响证据；`837` 个测试、稳定版和 alpha 非生产两产品 smoke 已通过，平台候选和真实 alpha 验收仍未完成。
- 修复发布冻结阶段只重试连接建立、不重试公开快照响应体读取的问题；分块响应在读取中途超时或连接重置时按既有退避策略重新请求，完整读取后才进入快照校验。
- 补充准备 PR 合并后 exact main CI/E2E 失败、但 Product Release 尚未绑定时的专用废弃恢复边界；该身份保持可审计并烧毁版本，后续发布必须走新的 Manual Product Release identity。
- 补强 ledger recovery marker 链的读取：bot-authored recovery wrapper 可安全叠加，只有最终 owner-authored、GitHub Verified 的 legacy head 才能提供恢复权限。
- 收紧 recovery marker 读取：每个 marker 都必须是合法且位于实际单父祖先链中的 SHA；孤立、格式错误或未绑定 marker 与合法 marker 共存时仍必须拒绝登记。
- 继续收紧 recovery marker：只解析 head 到 bootstrap root 的 ledger 链，要求 marker 指向声明提交的严格祖先、active legacy target 之前的 marker lineage 收敛到同一 owner legacy，并拒绝同提交多个 marker 或 active lineage 中彼此断开的 marker；target 之后的历史 marker 仍逐一验证；CAS 返回已验证提交后即使 branch 被并发推进也不再误报写入失败。

## References

- [PR #177](https://github.com/IvanLi-CN/blog-26/pull/177) 承载预发布实现；候选保留主干 Web Demo 和发布快照恢复变更，并将 content search 的重复路由测试数据放入单个事务，保留测试数量和全部断言。经证明的 VERSION-only 写入使用业务语义投影校验证据，未登记的写入仍阻断。

- [SPEC.md](./SPEC.md)
- [IMPLEMENTATION.md](./IMPLEMENTATION.md)
