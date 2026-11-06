# 助手消息渲染兼容背景

## Lifecycle / Compatibility

本主题为 active，独立拥有消息显示的长期合同；对话归属、临时保留、额度、来源材料权限、生成恢复与重试继续由 [站内知识助手](../site-knowledge-assistant/SPEC.md) 拥有。本主题不替换一般与剪藏对话统一模型，不进行历史消息迁移。

用户截图中的回答曾以字面形式显示列表与粗体标记。审查基线已包含共享 MarkdownRenderer 接入；本主题在其基础上定义标准语法保真、双角色内容边界、代码与公式、受限媒体请求及消息内定位。截图不作为当前版本仍有同一接入故障的复测证据。

## Boundary Decisions

聊天对用户消息改用字面显示，因此历史用户文字中的星号、反引号或标签将直接呈现。历史助手正文保持原始记录，按聊天合同显示；此前依赖编辑器全局修复、原始 HTML 或外图自动加载的呈现可能改变，这是已确认的显示边界调整，不是数据清洗或内容删除。

脚注由现有 GFM 能力解析，但自定义组件需要保留定位属性；不得把早先“未见独立脚注插件”的推测当作缺失事实。正文裸编号与系统来源当前没有可靠映射，本主题保留独立来源列表，不为历史文本反推引用关系。

聊天代码从超过阈值默认折叠改为默认展开、用户主动折叠。文章共享组件的原有默认值和作者 HTML/媒体能力继续由文章主题拥有；共享修复需要验证文章回归。

公开站与旧剪藏对话统一使用聊天专用入口，系统来源继续独立显示。旧剪藏的临时正文与保存后的终态共用同一行列表及稳定消息身份；只保持 DOM 属性相同而重新挂载组件，会丢失用户主动折叠状态。去重只检查当前用户轮次对应的终态回答，不以历史回答的共同前缀隐藏新正文。

本轮交付父 PR 为 [#431](https://github.com/IvanLi-CN/blog-26/pull/431)，仅到待审停靠点；子 PR 经验证后只合入 `th/assistant-message-rendering`。当前没有 `main` 合并、release 或部署授权，也没有相应完成结论。

## Architectural References

- [ADR 0036](../../adr/0036-assistant-generation-independent-of-ui-lifecycle.md) 约束关闭、切换及刷新时生成持续与可恢复。
- [ADR 0037](../../adr/0037-unified-assistant-and-clipping-conversations.md) 约束一般对话与剪藏对话的模型归属。
- [ADR 0040](../../adr/0040-assistant-content-and-media-trust-boundary.md) 记录助手内容与图片请求的信任边界及便利性取舍。

## References

- [需求](./SPEC.md)
- [实现覆盖](./IMPLEMENTATION.md)
- [需求访谈与决策](./DECISIONS.md)
