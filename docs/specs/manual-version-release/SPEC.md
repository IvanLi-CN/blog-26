# Manual Version Release

## Context and Scope

本主题定义产品的手动版本发布合同。发布产物固定为静态前台和完整功能 Docker 镜像；版本准备、受保护 PR 合并、实际发布和失败恢复属于同一合同。

## Terms and Interfaces

- 产品版本：两种产物共享的 SemVer 版本。
- Version Policy：校验版本格式、自动递增、单调性、可信基线、预留、冲突与恢复的独立策略。
- 发布身份：产品版本、来源提交、策略、预留及产物校验值的绑定。
- 入口：一次 `workflow_dispatch`；产品版本为可选输入。
- 版本文件：根目录 `VERSION`，由发布准备 PR 修改。

## Requirements

### REQ-MVR-001

系统 MUST 将静态前台和完整功能 Docker 镜像作为固定发布集合，两种产物共享同一个产品版本。

### REQ-MVR-002

版本输入留空时，系统 MUST 按 Version Policy 自动递增。发版人指定版本时，系统 MUST 验证其高于可信版本基线及有效预留，并拒绝为不同发布身份复用相同版本。

### REQ-MVR-003

一次手动 dispatch MUST 创建或复用同一次准备的发布 PR，仅修改根目录 `VERSION`，并启用 GitHub 原生自动合并。

### REQ-MVR-004

发布 PR MUST 满足 required checks、审查和分支保护规则。实际发布 MUST 绑定该 PR 的确切 merge SHA，并核对同一发布身份的质量证据。

### REQ-MVR-005

系统 MUST 在不可逆发布动作前建立持久预留，绑定产品版本、来源及策略。并发请求、重复请求和冲突请求 MUST 经过唯一身份验证，不能重复分配版本或挪用预留。

### REQ-MVR-006

两种产物均发布成功后系统才能标记发布完成。部分失败后的恢复 MUST 复用原版本、来源、预留、冻结输入和产物校验值；同一身份出现不同内容时 MUST 拒绝覆盖。

### REQ-MVR-007

部署及恢复 MUST 消费同一份已验证产物。产品版本和构建标识 MUST 分别记录，使静态产物和镜像的发布来源可追溯。

## Verification

### VER-MVR-001

- Method: 核对一次完整发布的静态产物、Docker 镜像和发布记录。
- covers: `REQ-MVR-001`, `REQ-MVR-007`
- Pass condition: 发布集合只有两种产物，产品版本和来源一致，部署消费验证过的产物。

### VER-MVR-002

- Method: 使用固定版本基线检查留空输入、向前指定、相同版本和回溯版本。
- covers: `REQ-MVR-002`
- Pass condition: 留空自动递增，向前指定保持调用者版本，回溯和不同身份的重复版本被拒绝。

### VER-MVR-003

- Method: 核对单次 dispatch 生成的 PR 差异、auto-merge 状态及合并证据。
- covers: `REQ-MVR-003`, `REQ-MVR-004`
- Pass condition: PR 只修改 `VERSION`，满足保护规则后自动合并，实际发布绑定该 merge SHA。

### VER-MVR-004

- Method: 对同一候选版本执行并发准备、重复准备和来源冲突样例。
- covers: `REQ-MVR-005`
- Pass condition: 只有一个有效发布身份和预留；冲突不能产生发布副作用。

### VER-MVR-005

- Method: 在部分发布完成后模拟失败，并使用同一发布身份恢复。
- covers: `REQ-MVR-006`
- Pass condition: 补齐缺失产物，既有产物校验值保持一致，版本不递增，完成状态对应两种产物实际发布成功。

## Related ADRs

- [ADR 0014](../../adr/0014-unified-product-release-version-scope.md)
- [ADR 0015](../../adr/0015-manual-version-release-delivery.md)

## References

- [实现状态](./IMPLEMENTATION.md)
- [主题记录](./HISTORY.md)
