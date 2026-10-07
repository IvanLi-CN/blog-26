# Manual Version Release 主题记录

## Lifecycle / Compatibility

本主题为 active，定义静态前台和完整功能 Docker 镜像共享产品版本的手动发版合同。

## Related Changes

- 基础清理与合同提交：`260692f8be487574ee6227c81f65be4a576a2f6a`。
- 手动发布实现引入独立签名登记分支、原运行冻结产物、只读版本端点及统一静态/GHCR 发布链路；内置令牌签名探针已核验，最终候选验证与审查记录由实现 PR 承载。
- [PR #171](https://github.com/IvanLi-CN/blog-26/pull/171) 将原生令牌的正式版手动发布实现合并至 main，合并提交为 `8bfc0b602fd849bc129763c97c46821afc9749be`；该实现合并不触发产品发布，合并本身不构成真实发版验收。
- 产品预发布需求讨论确认 alpha/beta/rc 与正式版共享两种产物及单一版本请求入口，预发布不部署站点、不推进正式 latest；相应解析、分配及完成条件仍待实现和真实发布验收。
- 版本请求讨论确认留空/stable 和 alpha/beta/rc 快捷值、完整版本精确指定；同一目标允许阶段跳跃，向更早阶段的自动请求停止，由发版人显式选择更高完整目标。正式语义基线和已占用版本约束分开判断。
- 主人确认整体需求收敛；正式自动分配请求统一命名为 stable。需求确认不代替实现或真实发布验收。
- `th/product-prerelease` 候选实现统一解析与分配、预发布完成登记、两种产物 metadata 和部署密钥隔离；针对性合同测试通过。Agent VM 准入受共享内存配额占满阻断，完整构建、平台实证、实现 PR 合并与真实 alpha 验收尚未完成。

## References

- [SPEC.md](./SPEC.md)
- [IMPLEMENTATION.md](./IMPLEMENTATION.md)
