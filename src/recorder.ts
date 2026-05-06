import { chromium, type Browser, type Page } from "playwright";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface Step {
  t: number;
  action: string;
  args: Record<string, unknown>;
  url_after?: string;
  aria_after?: string;
  error?: string;
}

interface Session {
  id: string;
  goal: string;
  page: Page;
  steps: Step[];
  startedAt: number;
}

export interface Trace {
  session_id: string;
  goal: string;
  steps: Step[];
  final?: { url: string; aria: string };
  path: string;
}

const DATA_DIR = process.env.COWORK_QA_DATA ?? join(process.cwd(), ".cowork-qa");

export class Recorder {
  private browser?: Browser;
  private sessions = new Map<string, Session>();
  private traces = new Map<string, Trace>();

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: process.env.COWORK_QA_HEADED !== "1",
      });
    }
    return this.browser;
  }

  async start(goal: string, url?: string): Promise<string> {
    const browser = await this.getBrowser();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    if (url) await page.goto(url);
    const id = randomUUID();
    this.sessions.set(id, { id, goal, page, steps: [], startedAt: Date.now() });
    return id;
  }

  async act(args: {
    session_id: string;
    action: "goto" | "click" | "fill" | "press" | "eval";
    target?: string;
    value?: string;
  }) {
    const s = this.sessions.get(args.session_id);
    if (!s) throw new Error(`unknown session ${args.session_id}`);
    const step: Step = {
      t: Date.now() - s.startedAt,
      action: args.action,
      args: { target: args.target, value: args.value },
    };
    try {
      switch (args.action) {
        case "goto":
          if (!args.target) throw new Error("target (URL) required");
          await s.page.goto(args.target);
          break;
        case "click":
          if (!args.target) throw new Error("target (selector) required");
          await s.page.click(args.target);
          break;
        case "fill":
          if (!args.target || args.value == null)
            throw new Error("target + value required");
          await s.page.fill(args.target, args.value);
          break;
        case "press":
          if (!args.target) throw new Error("target (key) required");
          await s.page.keyboard.press(args.target);
          break;
        case "eval":
          if (!args.target) throw new Error("target (JS expression) required");
          await s.page.evaluate(args.target);
          break;
      }
      await s.page.waitForLoadState("domcontentloaded").catch(() => {});
      step.url_after = s.page.url();
      step.aria_after = await this.aria(s.page);
    } catch (e) {
      step.error = (e as Error).message;
    }
    s.steps.push(step);
    return {
      url: step.url_after,
      error: step.error,
      aria_excerpt: step.aria_after?.slice(0, 1200),
    };
  }

  async observe(session_id: string): Promise<string> {
    const s = this.sessions.get(session_id);
    if (!s) throw new Error(`unknown session ${session_id}`);
    return `URL: ${s.page.url()}\n\n${await this.aria(s.page)}`;
  }

  async end(session_id: string): Promise<Trace> {
    const s = this.sessions.get(session_id);
    if (!s) throw new Error(`unknown session ${session_id}`);
    const final = { url: s.page.url(), aria: await this.aria(s.page) };
    await mkdir(DATA_DIR, { recursive: true });
    const path = join(DATA_DIR, `${s.id}.json`);
    const trace: Trace = {
      session_id: s.id,
      goal: s.goal,
      steps: s.steps,
      final,
      path,
    };
    await writeFile(path, JSON.stringify(trace, null, 2));
    await s.page.context().close();
    this.sessions.delete(session_id);
    this.traces.set(session_id, trace);
    return trace;
  }

  getTrace(session_id: string): Trace {
    const t = this.traces.get(session_id);
    if (!t) throw new Error(`no trace for ${session_id} — call session_end first`);
    return t;
  }

  private async aria(page: Page): Promise<string> {
    try {
      return await page.locator("body").ariaSnapshot();
    } catch {
      return "(aria-snapshot unavailable)";
    }
  }
}
