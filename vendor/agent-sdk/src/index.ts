import {
  redAgentCategoryValues,
  redAgentSdkVersion,
  redAgentTierValues,
  normalizeRedAgentScopes,
  toolNames,
  toolRegistry,
  type RedAgentCapabilities,
  type RedAgentCategory,
  type RedAgentScope,
  type RedAgentTier,
  type ToolInputByName,
  type ToolName,
  type ToolOutputByName,
  type ToolTransport,
} from "@friendlyfire/agent-protocol";

type NamespaceOf<TValue extends string> = TValue extends `${infer TNamespace}.${string}`
  ? TNamespace
  : never;
type MethodOf<TValue extends string> = TValue extends `${string}.${infer TMethod}` ? TMethod : never;

export interface RedAgentMetadata {
  name: string;
  description: string;
  category: RedAgentCategory;
  minSupportedTier: RedAgentTier;
}

export interface RedAgentRunInfo {
  id: string;
  executionId: string;
  budgets?: { maxSteps: number; maxDurationMs: number };
}

export interface RedAgentTargetContext {
  id: string;
  name: string;
  description?: string;
  routes?: Array<{ path: string; method: string; description?: string }>;
  authMethods?: string[];
}

export interface RedAgentRuntimeContext {
  executionProfile: string | null;
  availableTools: RedAgentScope[];
  enabledRoles: string[];
  sessionMode: string | null;
  resetReproducibilityHint: string | null;
}

export interface RedAgentLogger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

export type ToolClients = {
  [TNamespace in NamespaceOf<ToolName>]: {
    [TName in Extract<ToolName, `${TNamespace}.${string}`> as MethodOf<TName>]: (
      input: ToolInputByName[TName],
    ) => Promise<ToolOutputByName[TName]>;
  };
};

export interface RedAgentContext {
  sdkVersion: string;
  run: RedAgentRunInfo;
  target: RedAgentTargetContext;
  validationMode: boolean;
  logger: RedAgentLogger;
  runtime: RedAgentRuntimeContext;
  tools: ToolClients;
  llm: ToolClients["llm"];
  invoke<TName extends ToolName>(
    toolName: TName,
    input: ToolInputByName[TName],
  ): Promise<ToolOutputByName[TName]>;
  invoke(toolName: string, input: unknown): Promise<unknown>;
}

export interface RedAgentDefinition<TSummary = unknown> {
  metadata: RedAgentMetadata;
  capabilities: RedAgentCapabilities;
  run(context: RedAgentContext): Promise<TSummary | undefined> | TSummary | undefined;
}

export interface CreateAuthoringContextInput {
  sdkVersion?: string;
  run: RedAgentRunInfo;
  target: RedAgentTargetContext;
  transport: ToolTransport;
  validationMode?: boolean;
  logger?: Partial<RedAgentLogger>;
  runtime?: Partial<RedAgentRuntimeContext>;
}

export interface LocalLlmTransportOptions {
  apiBase?: string;
  openAiApiKey?: string;
  anthropicApiKey?: string;
}

export class AgentToolError extends Error {
  readonly code: string;
  readonly toolName: string;

  constructor(toolName: string, code: string, message: string) {
    super(message);
    this.name = "AgentToolError";
    this.toolName = toolName;
    this.code = code;
  }
}

export class ToolPolicyDeniedError extends AgentToolError {
  constructor(toolName: string, code: string, message: string) {
    super(toolName, code, message);
    this.name = "ToolPolicyDeniedError";
  }
}

export class ToolTimeoutError extends AgentToolError {
  constructor(toolName: string, code: string, message: string) {
    super(toolName, code, message);
    this.name = "ToolTimeoutError";
  }
}

export class UnsupportedToolError extends AgentToolError {
  constructor(toolName: string, message = `Unsupported tool: ${toolName}`) {
    super(toolName, "agent_unsupported_tool", message);
    this.name = "UnsupportedToolError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function createNoopLogger(): RedAgentLogger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

function normalizeToolError(toolName: string, error: unknown): AgentToolError {
  if (error instanceof AgentToolError) {
    return error;
  }

  if (isRecord(error) && typeof error.code === "string" && typeof error.message === "string") {
    if (
      error.code === "agent_http_invalid_target" ||
      error.code === "browser_invalid_target" ||
      error.code === "tool_policy_denied"
    ) {
      return new ToolPolicyDeniedError(toolName, error.code, error.message);
    }

    if (error.code === "agent_tool_timeout") {
      return new ToolTimeoutError(toolName, error.code, error.message);
    }

    if (error.code === "agent_unsupported_tool") {
      return new UnsupportedToolError(toolName, error.message);
    }

    return new AgentToolError(toolName, error.code, error.message);
  }

  if (error instanceof Error) {
    return new AgentToolError(toolName, "agent_step_failed", error.message);
  }

  return new AgentToolError(toolName, "agent_step_failed", String(error));
}

async function invokeTool<TName extends ToolName>(
  transport: ToolTransport,
  toolName: TName,
  input: ToolInputByName[TName],
): Promise<ToolOutputByName[TName]> {
  try {
    return await transport.invoke(toolName, input);
  } catch (error) {
    throw normalizeToolError(toolName, error);
  }
}

export function createToolClients(transport: ToolTransport): ToolClients {
  const clients = {} as Record<string, Record<string, unknown>>;

  for (const toolName of toolNames) {
    const definition = toolRegistry[toolName];
    const namespace = definition.namespace;
    const method = definition.method;

    clients[namespace] ??= {};
    clients[namespace][method] = (input: ToolInputByName[typeof toolName]) =>
      invokeTool(transport, toolName, input);
  }

  return clients as ToolClients;
}

export function createAuthoringContext(input: CreateAuthoringContextInput): RedAgentContext {
  const logger = {
    ...createNoopLogger(),
    ...input.logger,
  };
  const tools = createToolClients(input.transport);

  const invoke: RedAgentContext["invoke"] = (toolName: string, toolInput: unknown) => {
    if (!toolNames.includes(toolName as ToolName)) {
      throw new UnsupportedToolError(toolName);
    }

    return invokeTool(
      input.transport,
      toolName as ToolName,
      toolInput as ToolInputByName[ToolName],
    );
  };

  return {
    sdkVersion: input.sdkVersion ?? redAgentSdkVersion,
    run: input.run,
    target: input.target,
    validationMode: input.validationMode ?? false,
    logger,
    runtime: {
      executionProfile: input.runtime?.executionProfile ?? null,
      availableTools:
        input.runtime?.availableTools ??
        normalizeRedAgentScopes(undefined, {
          http: true,
          memory: true,
          credentials: true,
          evidence: true,
          browser: true,
        }),
      enabledRoles: input.runtime?.enabledRoles ?? [],
      sessionMode: input.runtime?.sessionMode ?? null,
      resetReproducibilityHint: input.runtime?.resetReproducibilityHint ?? null,
    },
    tools,
    llm: tools.llm,
    invoke,
  };
}

export function defineRedAgent<TSummary = unknown>(
  definition: RedAgentDefinition<TSummary>,
): RedAgentDefinition<TSummary> {
  return definition;
}

export function collectRedAgentCapabilitiesValidationErrors(value: unknown): string[] {
  if (!isRecord(value)) {
    return ["capabilities must be an object"];
  }

  const errors: string[] = [];
  const keys: Array<keyof RedAgentCapabilities> = [
    "http",
    "memory",
    "credentials",
    "evidence",
    "browser",
  ];

  for (const key of keys) {
    if (typeof value[key] !== "boolean") {
      errors.push(`capabilities.${key} must be a boolean`);
    }
  }

  return errors;
}

export function collectRedAgentScopesValidationErrors(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return ["scopes must be an array"];
  }

  const errors: string[] = [];
  const seen = new Set<string>();

  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      errors.push(`scopes[${index}] must be a non-empty string`);
      return;
    }

    if (!toolNames.includes(entry as ToolName)) {
      errors.push(`scopes[${index}] must be a known tool id`);
      return;
    }

    if (seen.has(entry)) {
      errors.push(`scopes[${index}] duplicates ${entry}`);
      return;
    }

    seen.add(entry);
  });

  return errors;
}

export function collectRedAgentMetadataValidationErrors(value: unknown): string[] {
  if (!isRecord(value)) {
    return ["metadata must be an object"];
  }

  const errors: string[] = [];

  if (!isNonEmptyString(value.name)) {
    errors.push("metadata.name must be a non-empty string");
  }

  if (!isNonEmptyString(value.description)) {
    errors.push("metadata.description must be a non-empty string");
  }

  if (
    typeof value.category !== "string" ||
    !redAgentCategoryValues.includes(value.category as RedAgentCategory)
  ) {
    errors.push(`metadata.category must be one of ${redAgentCategoryValues.join(", ")}`);
  }

  if (
    typeof value.minSupportedTier !== "string" ||
    !redAgentTierValues.includes(value.minSupportedTier as RedAgentTier)
  ) {
    errors.push(`metadata.minSupportedTier must be one of ${redAgentTierValues.join(", ")}`);
  }

  return errors;
}

export function collectRedAgentDefinitionValidationErrors(value: unknown): string[] {
  if (!isRecord(value)) {
    return ["default export must be an object"];
  }

  const errors = [
    ...collectRedAgentMetadataValidationErrors(value.metadata),
    ...collectRedAgentCapabilitiesValidationErrors(value.capabilities),
  ];

  if (typeof value.run !== "function") {
    errors.push("run must be a function");
  }

  return errors;
}

export interface RunContext {
  rpcUrl: string;
  run: { id: string; executionId: string };
  target: { id: string; name: string; category: string; tier: string };
}

export interface ReadyResponse {
  status: "ready";
  protocol: { version: string; rpcVersion: "1" };
  run: { id: string; executionId: string };
  target: {
    id: string;
    name: string;
    description?: string;
    appPort: number;
    healthcheckPath: string;
    routes?: Array<{ path: string; method: string; description?: string }>;
    authMethods?: string[];
  };
  runtime: {
    executionProfile: string | null;
    availableTools: RedAgentScope[];
    enabledRoles: string[];
    sessionMode: string | null;
    resetReproducibilityHint: string | null;
  };
  agent: {
    tools: string[];
    budgets: { maxSteps: number; maxDurationMs: number };
  };
}

export function readRunContext(envValue?: string): RunContext {
  const raw = envValue ?? process.env.FRIENDLYFIRE_RUN_CONTEXT;
  if (!raw) {
    throw new Error("FRIENDLYFIRE_RUN_CONTEXT environment variable is not set");
  }
  try {
    return JSON.parse(raw) as RunContext;
  } catch {
    throw new Error("FRIENDLYFIRE_RUN_CONTEXT is not valid JSON");
  }
}

export async function waitForReady(
  rpcUrl: string,
  options?: { maxWaitMs?: number; intervalMs?: number },
): Promise<ReadyResponse> {
  const maxWait = options?.maxWaitMs ?? 60_000;
  const baseInterval = options?.intervalMs ?? 100;
  const deadline = Date.now() + maxWait;
  let interval = baseInterval;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${rpcUrl}/ready`);
      if (res.ok) {
        return (await res.json()) as ReadyResponse;
      }
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(interval * 2, 5_000);
  }

  throw new Error(`Red-runner not ready after ${maxWait}ms`);
}

export function createRpcTransport(rpcUrl: string): ToolTransport {
  return {
    async invoke<TName extends ToolName>(
      toolName: TName,
      toolInput: ToolInputByName[TName],
    ): Promise<ToolOutputByName[TName]> {
      const res = await fetch(`${rpcUrl}/invoke`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolName, input: toolInput }),
      });

      const body = await res.json() as {
        ok: boolean;
        output?: ToolOutputByName[TName];
        error?: { code: string; message: string; retryable?: boolean };
      };

      if (!body.ok) {
        const err = body.error ?? { code: "unknown", message: "Tool invocation failed" };
        throw normalizeToolError(toolName, err);
      }

      return body.output as ToolOutputByName[TName];
    },
  };
}

export async function reportDone(
  rpcUrl: string,
  result:
    | { status: "completed"; summary?: unknown }
    | { status: "failed"; error: { code: string; message: string } },
): Promise<void> {
  await fetch(`${rpcUrl}/done`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result),
  });
}

function mapReadyToContext(
  ready: ReadyResponse,
  transport: ToolTransport,
  logger?: Partial<RedAgentLogger>,
): RedAgentContext {
  return createAuthoringContext({
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
    transport,
    logger,
    runtime: ready.runtime,
  });
}

export { mapReadyToContext as createAuthoringContextFromReady };

async function invokeLocalLlm(
  input: ToolInputByName["llm.respond"],
  options: LocalLlmTransportOptions = {},
): Promise<ToolOutputByName["llm.respond"]> {
  if (typeof input.model !== "string" || input.model.trim().length === 0) {
    throw new AgentToolError("llm.respond", "llm_invalid_input", "llm.respond input.model is required");
  }

  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    throw new AgentToolError(
      "llm.respond",
      "llm_invalid_input",
      "llm.respond requires at least one message",
    );
  }

  const [provider, ...rest] = input.model.split("/");
  const modelName = rest.join("/").trim();
  if (!provider || modelName.length === 0) {
    throw new AgentToolError(
      "llm.respond",
      "llm_invalid_input",
      "llm.respond model must be in provider/model format",
    );
  }

  if (provider === "openai") {
    const apiKey = options.openAiApiKey ?? process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY;
    if (!apiKey) {
      throw new AgentToolError("llm.respond", "llm_model_unavailable", `Model ${input.model} is not configured locally`);
    }

    const response = await fetch(options.apiBase ?? "https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        input: input.messages,
        reasoning: input.reasoningEffort ? { effort: input.reasoningEffort } : undefined,
        max_output_tokens: input.maxOutputTokens,
        temperature: input.temperature,
      }),
    });
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      throw new AgentToolError(
        "llm.respond",
        "llm_provider_request_failed",
        typeof body.error === "string" ? body.error : `Local OpenAI request failed with HTTP ${response.status}`,
      );
    }

    return {
      requestId: typeof body.id === "string" ? body.id : "local-openai",
      model: input.model,
      outputText: typeof body.output_text === "string" ? body.output_text : "",
      stopReason: typeof body.status === "string" ? body.status : null,
      usage:
        body.usage && typeof body.usage === "object"
          ? {
              inputTokens:
                typeof (body.usage as Record<string, unknown>).input_tokens === "number"
                  ? ((body.usage as Record<string, unknown>).input_tokens as number)
                  : undefined,
              outputTokens:
                typeof (body.usage as Record<string, unknown>).output_tokens === "number"
                  ? ((body.usage as Record<string, unknown>).output_tokens as number)
                  : undefined,
              totalTokens:
                typeof (body.usage as Record<string, unknown>).total_tokens === "number"
                  ? ((body.usage as Record<string, unknown>).total_tokens as number)
                  : undefined,
            }
          : undefined,
    };
  }

  if (provider === "anthropic") {
    const apiKey =
      options.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? process.env.LLM_API_KEY;
    if (!apiKey) {
      throw new AgentToolError("llm.respond", "llm_model_unavailable", `Model ${input.model} is not configured locally`);
    }

    const system = input.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const response = await fetch(options.apiBase ?? "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelName,
        system: system || undefined,
        messages: input.messages
          .filter((message) => message.role !== "system")
          .map((message) => ({
            role: message.role,
            content: [{ type: "text", text: message.content }],
          })),
        max_tokens: input.maxOutputTokens ?? 1024,
        temperature: input.temperature,
      }),
    });
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      throw new AgentToolError(
        "llm.respond",
        "llm_provider_request_failed",
        typeof body.error === "string" ? body.error : `Local Anthropic request failed with HTTP ${response.status}`,
      );
    }

    return {
      requestId: typeof body.id === "string" ? body.id : "local-anthropic",
      model: input.model,
      outputText: Array.isArray(body.content)
        ? body.content
            .filter((entry): entry is { type?: string; text?: string } => Boolean(entry && typeof entry === "object"))
            .filter((entry) => entry.type === "text" && typeof entry.text === "string")
            .map((entry) => entry.text as string)
            .join("\n")
        : "",
      stopReason: typeof body.stop_reason === "string" ? body.stop_reason : null,
      usage:
        body.usage && typeof body.usage === "object"
          ? {
              inputTokens:
                typeof (body.usage as Record<string, unknown>).input_tokens === "number"
                  ? ((body.usage as Record<string, unknown>).input_tokens as number)
                  : undefined,
              outputTokens:
                typeof (body.usage as Record<string, unknown>).output_tokens === "number"
                  ? ((body.usage as Record<string, unknown>).output_tokens as number)
                  : undefined,
              totalTokens:
                typeof (body.usage as Record<string, unknown>).input_tokens === "number" ||
                typeof (body.usage as Record<string, unknown>).output_tokens === "number"
                  ? Number((body.usage as Record<string, unknown>).input_tokens ?? 0) +
                    Number((body.usage as Record<string, unknown>).output_tokens ?? 0)
                  : undefined,
            }
          : undefined,
    };
  }

  throw new AgentToolError("llm.respond", "llm_model_unavailable", `Model ${input.model} is not configured locally`);
}

export function createLocalLlmTransport(
  options: LocalLlmTransportOptions = {},
): ToolTransport {
  return {
    async invoke<TName extends ToolName>(
      toolName: TName,
      toolInput: ToolInputByName[TName],
    ): Promise<ToolOutputByName[TName]> {
      if (toolName !== "llm.respond") {
        throw new UnsupportedToolError(toolName, `${toolName} is not available in the local llm helper`);
      }

      return invokeLocalLlm(
        toolInput as ToolInputByName["llm.respond"],
        options,
      ) as Promise<ToolOutputByName[TName]>;
    },
  };
}

export async function serveAgent(
  agent: RedAgentDefinition,
  options?: {
    rpcUrl?: string;
    runContext?: string;
    logger?: Partial<RedAgentLogger>;
  },
): Promise<void> {
  const rpcUrl = options?.rpcUrl ?? process.env.FRIENDLYFIRE_RPC_URL;
  if (!rpcUrl) {
    throw new Error("FRIENDLYFIRE_RPC_URL environment variable is not set");
  }

  const ready = await waitForReady(rpcUrl);
  const transport = createRpcTransport(rpcUrl);
  const ctx = mapReadyToContext(ready, transport, options?.logger);

  let result: Parameters<typeof reportDone>[1];
  try {
    const summary = await agent.run(ctx);
    result = { status: "completed", summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof AgentToolError ? error.code : "agent_run_failed";
    result = { status: "failed", error: { code, message } };
  }

  await reportDone(rpcUrl, result);
}
