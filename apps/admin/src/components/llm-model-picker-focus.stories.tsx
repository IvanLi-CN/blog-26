import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "~/components/ui";
import { LlmModelPicker } from "./llm-model-picker";

const meta = {
  title: "Admin/LLM Model Picker Focus",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function ExternalControlFrame() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <Button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        打开模型选择
      </Button>
      <LlmModelPicker
        hideTrigger
        open={open}
        onOpenChange={setOpen}
        returnFocusElement={triggerRef.current}
        source="upstream"
        onSourceChange={() => undefined}
        value="gpt-4o-mini"
        onValueChange={() => undefined}
        models={[]}
      />
    </div>
  );
}

export const ExternalControl: Story = {
  render: () => <ExternalControlFrame />,
  tags: ["play-fn"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "打开模型选择" });
    await userEvent.click(trigger);
    const dialog = within(document.body).getByRole("dialog", { name: "选择模型" });
    await userEvent.click(within(dialog).getByRole("button", { name: "关闭模型选择" }));
    await expect(trigger).toHaveFocus();
  },
};
