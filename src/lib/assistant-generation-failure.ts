import type { AssistantGenerationJob } from "./assistant-contracts";

export type AssistantGenerationFailure = {
  message: string;
  diagnostic?: { code: string; message: string };
};

export type AssistantGenerationJobView = AssistantGenerationJob & {
  failure?: AssistantGenerationFailure;
};

export const DEFAULT_ASSISTANT_FAILURE = "请稍后重试。";
const UNAVAILABLE = "知识对话暂时不可用，请稍后重试。";
const INTERRUPTED = "本轮回答中断，可以重试。";

const presets: Record<string, { message: string; detail: string }> = {
  "assistant-clipping-context-unavailable": {
    message: "文章资料暂不可用。请重新打开原文章后再试。",
    detail: "本轮无法加载关联的剪藏上下文。",
  },
  "assistant-provider-empty-output": {
    message: "没有收到回答，可以重试。",
    detail: "聊天模型返回了空内容。",
  },
  "assistant-provider-output-too-large": {
    message: "回答超出长度限制。可以缩小问题范围后再试。",
    detail: "模型输出触及长度上限，回答未标记为完成。",
  },
  "assistant-provider-unconfigured": {
    message: UNAVAILABLE,
    detail: "聊天模型配置不完整。请在 LLM 设置中检查模型名称、服务地址和 API Key。",
  },
  "assistant-provider-error": {
    message: UNAVAILABLE,
    detail: "模型服务未能完成本轮请求，未记录可安全显示的上游状态。",
  },
  "invalid-job": {
    message: INTERRUPTED,
    detail: "生成任务缺少有效的消息或对话关联。",
  },
  "worker-lease-expired": {
    message: INTERRUPTED,
    detail: "生成任务的工作进程租约已过期。",
  },
  "worker-restarted": {
    message: INTERRUPTED,
    detail: "生成任务因工作进程重启而中断。",
  },
  "generation-failed": {
    message: DEFAULT_ASSISTANT_FAILURE,
    detail: "这次失败没有记录更具体的原因。",
  },
};

export function isAssistantFailureCode(code: string) {
  return Object.hasOwn(presets, code) || /^assistant-provider-http-[45]\d\d$/u.test(code);
}

export function presentAssistantGenerationJob(
  job: AssistantGenerationJob,
  canDiagnose: boolean
): AssistantGenerationJobView {
  if (job.status !== "failed") return job;
  const code =
    job.errorCode && isAssistantFailureCode(job.errorCode) ? job.errorCode : "generation-failed";
  const providerStatus = /^assistant-provider-http-([45]\d\d)$/u.exec(code)?.[1];
  const preset = providerStatus
    ? {
        message: providerStatus === "429" ? "模型服务繁忙，请稍后重试。" : UNAVAILABLE,
        detail: `模型服务返回 HTTP ${providerStatus}。`,
      }
    : presets[code];
  return {
    ...job,
    errorCode: canDiagnose ? code : null,
    failure: {
      message: preset.message,
      ...(canDiagnose ? { diagnostic: { code, message: preset.detail } } : {}),
    },
  };
}
