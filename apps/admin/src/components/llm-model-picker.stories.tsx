import type { Meta, StoryObj } from "@storybook/react-vite";
import { WandSparkles } from "lucide-react";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import {
  decorateUpstreamLlmModelNames,
  type LlmModelSource,
  toBuiltinLlmModelOptions,
} from "@/lib/llm-models";
import { Button, Card, CardContent, FieldLabel, Input } from "~/components/ui";
import { PageHeader } from "~/pages/helpers";
import { LlmModelPicker, type LlmModelPickerProps } from "./llm-model-picker";

const realisticUpstreamModelIds = [
  "chatgpt-4o-latest",
  "claude-3-5-haiku-latest",
  "claude-3-5-sonnet-latest",
  "claude-3-opus-latest",
  "deepseek-chat",
  "deepseek-reasoner",
  "gemini-1.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gpt-3.5-turbo",
  "gpt-4-turbo",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o",
  "gpt-4o-mini",
  "meta-llama/llama-3.3-70b-instruct",
  "mistral-large-latest",
  "mistral-small-latest",
  "moonshotai/kimi-k2",
  "o3",
  "o3-mini",
  "o4-mini",
  "openai/gpt-4o-mini",
  "openrouter/auto",
  "qwen/qwen2.5-coder-32b-instruct",
  "qwen/qwen3-32b",
  "qwen/qwen3-235b-a22b",
  "text-embedding-3-large",
  "text-embedding-3-small",
  "x-ai/grok-3-mini",
  "z-ai/glm-4.5",
];

const upstreamMatched = decorateUpstreamLlmModelNames(realisticUpstreamModelIds);
const upstreamWithUnknown = decorateUpstreamLlmModelNames([
  "gpt-4o-mini",
  "provider/new-experimental-model",
]);
const builtinModels = toBuiltinLlmModelOptions();

const meta = {
  title: "Admin/LLM Model Picker",
  component: LlmModelPicker,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof LlmModelPicker>;

export default meta;

type Story = StoryObj<typeof meta>;

interface ControlledPickerProps extends Partial<LlmModelPickerProps> {
  upstreamModels?: LlmModelPickerProps["models"];
  builtinModels?: LlmModelPickerProps["models"];
}

function ControlledPicker(props: ControlledPickerProps) {
  const [source, setSource] = useState<LlmModelSource>(props.source ?? "upstream");
  const [value, setValue] = useState(props.value ?? "");
  const models =
    props.models ??
    (source === "builtin"
      ? (props.builtinModels ?? builtinModels)
      : (props.upstreamModels ?? upstreamMatched));

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="标签分组"
          description="用 AI 生成建议，再把最终 JSON 保存回数据库。"
          actions={
            <>
              <Button variant="secondary">
                <WandSparkles className="size-4" />
                AI 重新分组
              </Button>
              <Button>保存分组</Button>
            </>
          }
        />

        <Card>
          <CardContent className="grid gap-4 p-5 lg:grid-cols-[180px_360px_minmax(0,1fr)]">
            <div>
              <FieldLabel>目标分组数</FieldLabel>
              <Input value="8" readOnly />
            </div>
            <div>
              <LlmModelPicker
                source={source}
                onSourceChange={setSource}
                value={value}
                onValueChange={setValue}
                models={models}
                isLoading={props.isLoading}
                error={props.error}
                defaultOpen={props.defaultOpen}
                preferredCapability={props.preferredCapability}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              当前标签总数：
              <span className="ml-1 font-medium text-foreground">128</span>
              <span className="mx-2">·</span>
              已配置分组：
              <span className="ml-1 font-medium text-foreground">8</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const UpstreamMatched: Story = {
  render: () => (
    <ControlledPicker
      source="upstream"
      value="gpt-4o-mini"
      upstreamModels={upstreamMatched}
      defaultOpen
      preferredCapability="chat"
    />
  ),
};

export const FilteringAndCustomModel: Story = {
  render: () => (
    <ControlledPicker
      source="upstream"
      value="gpt-4o-mini"
      upstreamModels={upstreamMatched}
      defaultOpen
      preferredCapability="chat"
    />
  ),
};

export const UpstreamUnmatched: Story = {
  render: () => (
    <ControlledPicker
      source="upstream"
      value="provider/new-experimental-model"
      upstreamModels={upstreamWithUnknown}
      defaultOpen
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = canvas.getByRole("dialog", { name: "选择模型" });
    await expect(
      within(dialog).getByRole("button", {
        name: /provider\/new-experimental-model/,
      })
    ).toBeInTheDocument();
  },
};

export const BuiltinData: Story = {
  render: () => (
    <ControlledPicker source="builtin" value="gpt-4.1" builtinModels={builtinModels} defaultOpen />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "预设" }));
    const dialog = canvas.getByRole("dialog", { name: "选择模型" });
    await expect(
      within(dialog).getByRole("button", { name: /GPT-4\.1 OpenAI gpt-4\.1/ })
    ).toBeInTheDocument();
  },
};

export const LoadingUpstream: Story = {
  render: () => <ControlledPicker source="upstream" models={[]} isLoading defaultOpen />,
};

export const UpstreamError: Story = {
  render: () => (
    <ControlledPicker
      source="upstream"
      models={[]}
      error="Missing required env: OPENAI_API_KEY"
      defaultOpen
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Missing required env: OPENAI_API_KEY")).toBeInTheDocument();
  },
};
