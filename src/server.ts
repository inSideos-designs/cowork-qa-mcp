#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Recorder } from "./recorder.js";

const recorder = new Recorder();
const server = new McpServer({ name: "cowork-qa", version: "0.1.0" });

server.tool(
  "session_start",
  "Open a fresh browser tab and start recording a goal-driven session.",
  {
    goal: z.string().describe("Plain-English goal the agent will try to accomplish."),
    url: z.string().url().optional().describe("Optional starting URL."),
  },
  async ({ goal, url }) => {
    const id = await recorder.start(goal, url);
    return { content: [{ type: "text", text: JSON.stringify({ session_id: id }) }] };
  },
);

server.tool(
  "session_act",
  "Perform a browser action in a session: goto | click | fill | press | eval.",
  {
    session_id: z.string(),
    action: z.enum(["goto", "click", "fill", "press", "eval"]),
    target: z
      .string()
      .optional()
      .describe("Selector for click/fill, URL for goto, key for press, JS expression for eval."),
    value: z.string().optional().describe("Value for fill."),
  },
  async (args) => {
    const result = await recorder.act(args);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

server.tool(
  "session_observe",
  "Return the current URL and aria-snapshot of the session's page.",
  { session_id: z.string() },
  async ({ session_id }) => {
    const text = await recorder.observe(session_id);
    return { content: [{ type: "text", text }] };
  },
);

server.tool(
  "session_end",
  "Close the session, persist the trace to disk, and return the path.",
  { session_id: z.string() },
  async ({ session_id }) => {
    const trace = await recorder.end(session_id);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ steps: trace.steps.length, trace_path: trace.path }),
        },
      ],
    };
  },
);

server.tool(
  "qa_get_trace",
  "Return the full recorded trace (goal, every step, final URL, final aria-snapshot) so the calling LLM can judge whether the goal was achieved. Call session_end first.",
  { session_id: z.string() },
  async ({ session_id }) => {
    const trace = recorder.getTrace(session_id);
    const stepsText = trace.steps
      .map((s, i) => {
        const args = JSON.stringify(s.args);
        const tail = s.error ? `ERROR: ${s.error}` : `→ ${s.url_after ?? ""}`;
        return `${i + 1}. ${s.action} ${args} ${tail}`;
      })
      .join("\n");
    const text = `Goal: ${trace.goal}

Steps (${trace.steps.length} total):
${stepsText}

Final URL: ${trace.final?.url ?? "(none)"}

Final aria-snapshot:
${trace.final?.aria ?? "(none)"}`;
    return { content: [{ type: "text", text }] };
  },
);

await server.connect(new StdioServerTransport());
