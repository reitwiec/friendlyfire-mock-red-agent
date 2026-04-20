import path from "node:path";
import { fileURLToPath } from "node:url";

const submittedNote = "friendlyfire-note-01";

const metadata = {
  name: "Mock Browser Red Agent",
  description: "Deterministic non-LLM red agent for backend MVP end-to-end verification.",
  category: "unauthorized_data_access",
  minSupportedTier: "starter",
};

const capabilities = {
  http: true,
  memory: true,
  credentials: false,
  evidence: true,
  browser: true,
};

const agent = {
  metadata,
  capabilities,
  async run(ctx) {
    const health = await ctx.tools.http.request({
      method: "GET",
      path: "/health",
    });

    await ctx.tools.browser.goto({
      path: "/",
    });

    await ctx.tools.browser.screenshot({
      label: "before-submit",
    });

    await ctx.tools.browser.fill({
      selector: "#note-input",
      value: submittedNote,
    });

    await ctx.tools.browser.click({
      selector: "#submit-note",
    });

    await ctx.tools.browser.waitFor({
      selector: '[data-testid="note-saved"]',
    });

    const confirmation = await ctx.tools.browser.extractText({
      selector: '[data-testid="note-saved"]',
    });

    const currentUrl = await ctx.tools.browser.currentUrl({});

    const afterSubmit = await ctx.tools.browser.screenshot({
      label: "after-submit",
    });

    const notesResponse = await ctx.tools.http.request({
      method: "GET",
      path: "/api/notes",
    });

    await ctx.tools.memory.set({
      key: "submitted-note",
      value: submittedNote,
    });

    await ctx.tools.evidence.record({
      label: "submitted-note-present",
      severity: "info",
      value: {
        submittedNote,
        notesPreview: notesResponse.bodyPreview,
      },
    });

    return {
      healthStatus: health.status,
      submittedNote,
      confirmationText: confirmation.text,
      currentUrl: currentUrl.currentUrl,
      notesPreview: notesResponse.bodyPreview,
      afterSubmitScreenshotArtifactId: afterSubmit.artifact.id,
    };
  },
};

export default agent;

function isEntrypoint() {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint) && path.resolve(entrypoint) === fileURLToPath(import.meta.url);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForReady(rpcUrl, options = {}) {
  const maxWaitMs = options.maxWaitMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 100;
  const deadline = Date.now() + maxWaitMs;
  let currentIntervalMs = intervalMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/ready", rpcUrl));
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // red-runner not up yet
    }

    await sleep(currentIntervalMs);
    currentIntervalMs = Math.min(currentIntervalMs * 2, 5_000);
  }

  throw new Error(`Runner RPC /ready did not succeed within ${maxWaitMs}ms.`);
}

async function invokeTool(rpcUrl, toolName, input) {
  const response = await fetch(new URL("/invoke", rpcUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      toolName,
      input,
    }),
  });

  const body = await response.json();
  if (!body.ok) {
    const error = new Error(body.error?.message ?? `Tool invocation failed: ${toolName}`);
    error.code = body.error?.code ?? "agent_step_failed";
    throw error;
  }

  return body.output;
}

function createToolClients(rpcUrl) {
  return {
    http: {
      request: (input) => invokeTool(rpcUrl, "http.request", input),
    },
    memory: {
      set: (input) => invokeTool(rpcUrl, "memory.set", input),
    },
    evidence: {
      record: (input) => invokeTool(rpcUrl, "evidence.record", input),
    },
    browser: {
      goto: (input) => invokeTool(rpcUrl, "browser.goto", input),
      screenshot: (input) => invokeTool(rpcUrl, "browser.screenshot", input),
      fill: (input) => invokeTool(rpcUrl, "browser.fill", input),
      click: (input) => invokeTool(rpcUrl, "browser.click", input),
      waitFor: (input) => invokeTool(rpcUrl, "browser.waitFor", input),
      extractText: (input) => invokeTool(rpcUrl, "browser.extractText", input),
      currentUrl: (input) => invokeTool(rpcUrl, "browser.currentUrl", input),
    },
  };
}

function createLogger() {
  return {
    debug(message, metadata) {
      console.debug(message, metadata ?? "");
    },
    info(message, metadata) {
      console.info(message, metadata ?? "");
    },
    warn(message, metadata) {
      console.warn(message, metadata ?? "");
    },
    error(message, metadata) {
      console.error(message, metadata ?? "");
    },
  };
}

function createContext(ready, rpcUrl) {
  const invoke = (toolName, input) => invokeTool(rpcUrl, toolName, input);

  return {
    sdkVersion: ready.protocol.version,
    run: {
      id: ready.run.id,
      executionId: ready.run.executionId,
      budgets: ready.agent.budgets,
    },
    target: {
      id: ready.target.id,
      name: ready.target.name,
      description: ready.target.description,
      routes: ready.target.routes,
      authMethods: ready.target.authMethods,
    },
    validationMode: false,
    logger: createLogger(),
    tools: createToolClients(rpcUrl),
    invoke,
  };
}

async function reportDone(rpcUrl, result) {
  const response = await fetch(new URL("/done", rpcUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(result),
  });

  if (!response.ok) {
    throw new Error(`Runner RPC /done failed with ${response.status}.`);
  }
}

async function serve(currentAgent) {
  const rpcUrl = process.env.FRIENDLYFIRE_RPC_URL;
  if (!rpcUrl) {
    throw new Error("FRIENDLYFIRE_RPC_URL environment variable is not set.");
  }

  const ready = await waitForReady(rpcUrl);
  const ctx = createContext(ready, rpcUrl);

  try {
    const summary = await currentAgent.run(ctx);
    await reportDone(rpcUrl, {
      status: "completed",
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code =
      error && typeof error === "object" && typeof error.code === "string"
        ? error.code
        : "agent_run_failed";

    await reportDone(rpcUrl, {
      status: "failed",
      error: {
        code,
        message,
      },
    });

    throw error;
  }
}

if (isEntrypoint()) {
  serve(agent).catch((error) => {
    console.error(
      "[mock-red-agent] runtime failed",
      error instanceof Error ? error.stack ?? error.message : String(error),
    );
    process.exitCode = 1;
  });
}
