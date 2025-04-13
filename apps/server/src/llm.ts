import { openai } from "@llamaindex/openai";
import { AgentStream, Settings, agent, tool } from 'llamaindex'
import { z } from 'zod';

Settings.llm = openai({
  model: "gpt-4o-mini",
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://new-api.ivanli.cc/v1",
});

const addTool = tool({
  name: "add",
  description: "Adds two numbers",
  parameters: z.object({ x: z.number(), y: z.number() }),
  execute: ({ x, y }) => x + y,
});

const myAgent = agent({
  tools: [addTool],
});

// Chat with the agent
const context = myAgent.run("38 + 999 = ?");

for await (const event of context) {
  if (event instanceof AgentStream) {
    for (const chunk of event.data.delta) {
      process.stdout.write(chunk); // stream response
    }
  } else {
    console.log(event); // other events
  }
}