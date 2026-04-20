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

export default {
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
