import path from "node:path";
import { fileURLToPath } from "node:url";

import { serveAgent } from "@friendlyfire/agent-sdk";

const submittedNote = "friendlyfire-note-01";

const metadata = {
  name: "Mock Browser Red Agent",
  description: "Deterministic SDK-native red agent for backend MVP end-to-end verification.",
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

const requiredTools = [
  "http.request",
  "memory.set",
  "evidence.record",
  "browser.goto",
  "browser.screenshot",
  "browser.fill",
  "browser.click",
  "browser.waitFor",
  "browser.extractText",
  "browser.currentUrl",
];

function isEntrypoint() {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint) && path.resolve(entrypoint) === fileURLToPath(import.meta.url);
}

function getMissingTools(availableTools) {
  return requiredTools.filter((toolName) => !availableTools.includes(toolName));
}

const agent = {
  metadata,
  capabilities,
  async run(ctx) {
    const missingTools = getMissingTools(ctx.runtime.availableTools);
    if (missingTools.length > 0) {
      throw new Error(`Mock browser flow requires missing tools: ${missingTools.join(", ")}`);
    }

    const runtimeSummary = {
      executionProfile: ctx.runtime.executionProfile,
      sessionMode: ctx.runtime.sessionMode,
      resetReproducibilityHint: ctx.runtime.resetReproducibilityHint,
      availableTools: ctx.runtime.availableTools,
      enabledRoles: ctx.runtime.enabledRoles,
    };

    ctx.logger.info("starting mock browser flow", runtimeSummary);

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

    const currentUrl = await ctx.invoke("browser.currentUrl", {});

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
        runtime: runtimeSummary,
      },
    });

    return {
      healthStatus: health.status,
      submittedNote,
      confirmationText: confirmation.text,
      currentUrl: currentUrl.currentUrl,
      notesPreview: notesResponse.bodyPreview,
      afterSubmitScreenshotArtifactId: afterSubmit.artifact.id,
      runtime: runtimeSummary,
    };
  },
};

export default agent;

if (isEntrypoint()) {
  serveAgent(agent).catch((error) => {
    console.error(
      "[mock-red-agent] runtime failed",
      error instanceof Error ? error.stack ?? error.message : String(error),
    );
    process.exitCode = 1;
  });
}
