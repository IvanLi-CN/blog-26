# Web Demo Global Inspector Controls

## Status

Accepted

## Decision

Web Demo 全局控制只拥有模拟身份、网络连接、请求延迟、主题和动效偏好。这些设置在同一 Demo 会话的正式路由与场景之间保持同一含义；常驻与高级仅决定控件的展示层级，不改变其作用范围。

数据规模、业务请求结果、内容边界和媒体状态依赖具体数据集、操作或资源。控件能够跨场景复用，并不意味着其状态应由全局环境拥有；这些能力不属于全局控制合同。

Inspector 的主工作流采用标题与间距分组，不为`全局环境`、`Scene`、`Data`和`Actions`之间重复绘制分隔线；头部与状态条同样不使用装饰性边界。`分享与记录`作为折叠的次要工作流，可以保留唯一的顶部边界线。`高级`属于全局环境，不得通过缩进、独立背景或独立分隔线伪造新的层级。

## Rationale

把所有可复用控件集中进全局状态虽然减少字段分组，却会让场景覆盖环境、让无关数据集一起变化，或让某项业务失败同时阻断模拟会话读取。明确全局环境的所有权，能让每个场景在同一环境下被独立审查，并避免控件共享演变成业务状态耦合。

## Consequences

- 场景与路由变化保留明确选择的全局环境，不能替用户重设身份或网络。
- 全局断网覆盖 Demo 接管的产品请求，包括模拟会话读取；Inspector 自身仍可操作，以便恢复网络。
- 本决定细化 [build-time Web Demo boundary](./0013-build-time-web-demo-and-story-boundary.md)，不改变正式路由、构建时隔离或完整 Inspector 的其他既有职责。
- 全局能力与展示规则由 [Web Demo global controls Spec](../specs/web-demo-global-controls/SPEC.md) 定义。
