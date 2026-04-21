export const redAgentSdkVersion = "ff-next" as const;
export const supportedRedAgentSdkVersions = [redAgentSdkVersion] as const;
export const redAgentManifestFilename = "friendlyfire.agent.json" as const;

export const redAgentCategoryValues = [
  "unauthorized_data_access",
  "auth_bypass_or_privilege_escalation",
  "destructive_state_change",
] as const;
export type RedAgentCategory = (typeof redAgentCategoryValues)[number];

export const redAgentTierValues = ["starter", "standard", "deep"] as const;
export type RedAgentTier = (typeof redAgentTierValues)[number];

export interface RedAgentCapabilities {
  http: boolean;
  memory: boolean;
  credentials: boolean;
  evidence: boolean;
  browser: boolean;
}

export type RedAgentCapabilityKey = keyof RedAgentCapabilities;

export interface RedAgentPermissionContract {
  capabilities: RedAgentCapabilities;
  scopes: RedAgentScope[];
}

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface HttpRequestToolInput {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface HttpRequestToolOutput {
  status: number;
  headers: Record<string, string>;
  bodyPreview: string;
}

export interface MemoryGetToolInput {
  key: string;
}

export interface MemoryGetToolOutput {
  value: JsonValue;
}

export interface MemorySetToolInput {
  key: string;
  value?: unknown;
}

export interface MemorySetToolOutput {
  ok: true;
}

export interface CredentialsGetToolInput {
  role?: string;
}

export interface CredentialsGetToolOutput {
  credentials: TestCredential[];
}

export interface TestCredential {
  id: string;
  role: string;
  auth: CredentialAuth;
  metadata?: Record<string, string>;
}

export type CredentialAuth =
  | { method: "password"; username: string; password: string }
  | { method: "token"; headerName: string; token: string; prefix?: string }
  | { method: "custom"; fields: Record<string, string> };

export const evidenceSeverityValues = ["critical", "high", "medium", "low", "info"] as const;
export type EvidenceSeverity = (typeof evidenceSeverityValues)[number];

export const knownEvidenceCategories = {
  UNAUTHORIZED_DATA_ACCESS: "unauthorized_data_access",
  AUTH_BYPASS: "auth_bypass",
  DATA_EXPOSURE: "data_exposure",
  PRIVILEGE_ESCALATION: "privilege_escalation",
  STATE_MUTATION: "state_mutation",
} as const;

export interface EvidenceRecordToolInput {
  label: string;
  severity: EvidenceSeverity;
  category?: string;
  target?: string;
  description?: string;
  value: JsonValue;
  metadata?: Record<string, string>;
}

export interface EvidenceRecordToolOutput {
  evidenceCount: number;
  evidenceId: string;
}

// ---------------------------------------------------------------------------
// Finding (vulnerability report) — distinct from free-form evidence.
// finding.record persists a first-class, queryable vulnerability entity with
// replay steps and structured remediation guidance. Use this when the agent
// has confirmed a vulnerability with a working PoC. For intermediate,
// free-form observations (harvested credentials, anomalies), use evidence.record.
// ---------------------------------------------------------------------------

export type FindingReplayStep =
  | {
      kind: "http_request";
      method: string;
      url: string;
      headers?: Record<string, string>;
      body?: string | null;
      expectedStatus?: number;
      notes?: string;
    }
  | {
      kind: "browser_action";
      action: string;
      url?: string;
      selector?: string;
      text?: string;
      jsCode?: string;
      notes?: string;
    }
  | {
      kind: "shell";
      command: string;
      notes?: string;
    }
  | {
      kind: "assert";
      check: string;
      description: string;
    };

export interface FindingReplay {
  kind: "http" | "browser" | "script" | "mixed";
  steps: FindingReplayStep[];
  networkLogRef?: string;
  notes?: string;
}

export interface FindingRemediation {
  summary: string;
  steps: string[];
  fixPrompt: string;
  references?: Array<{
    kind: "cve" | "cwe" | "owasp" | "url";
    id: string;
    url?: string;
  }>;
}

export interface FindingCvss {
  vector: string;
  baseScore: number;
  breakdown?: string;
}

export interface FindingRecordToolInput {
  title: string;
  severity: Exclude<EvidenceSeverity, "info">;
  category?: RedAgentCategory;
  summary: string;
  impact: string;
  technicalAnalysis: string;
  replay: FindingReplay;
  remediation: FindingRemediation;
  cvss?: FindingCvss;
  endpoint?: string;
  httpMethod?: string;
  affectedParameter?: string;
  metadata?: Record<string, string>;
}

export interface FindingRecordToolOutput {
  findingId: string;
  findingCount: number;
}

export interface BrowserGotoToolInput {
  path: string;
  label?: string;
}

export interface BrowserCurrentUrlToolOutput {
  currentUrl: string;
}

export interface BrowserClickToolInput {
  selector: string;
  label?: string;
}

export interface BrowserOkToolOutput {
  ok: true;
}

export interface BrowserFillToolInput {
  selector: string;
  value: string;
  label?: string;
}

export interface BrowserPressToolInput {
  key: string;
  selector?: string;
  label?: string;
}

export interface BrowserWaitForToolInput {
  selector?: string;
  path?: string;
  timeoutMs?: number;
  label?: string;
}

export interface BrowserArtifactRef {
  id: string;
  kind: string;
  storageKey: string;
  contentType: string | null;
  metadata: Record<string, JsonValue> | null;
}

export interface BrowserScreenshotToolInput {
  label?: string;
}

export interface BrowserScreenshotToolOutput {
  artifact: BrowserArtifactRef;
}

export interface BrowserExtractTextToolInput {
  selector: string;
  label?: string;
}

export interface BrowserExtractTextToolOutput {
  text: string;
}

export interface PreviewCommandArtifactRef {
  kind: "stdout" | "stderr" | "declared_output" | "process_events";
  path: string;
  declaredPath?: string;
  relativePath?: string;
}

export interface PreviewCommandToolInput {
  args: string[];
  timeoutMs?: number;
}

export interface PreviewCommandToolOutput {
  invocationId: string;
  exitCode: number;
  durationMs: number;
  stdoutRef: PreviewCommandArtifactRef | null;
  stderrRef: PreviewCommandArtifactRef | null;
  outputRefs: PreviewCommandArtifactRef[];
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRespondToolInput {
  model: string;
  messages: LlmMessage[];
  reasoningEffort?: "low" | "medium" | "high";
  maxOutputTokens?: number;
  temperature?: number;
}

export interface LlmRespondToolUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface LlmRespondToolOutput {
  requestId: string;
  model: string;
  outputText: string;
  stopReason: string | null;
  usage?: LlmRespondToolUsage;
}

export interface ToolInputByName {
  "http.request": HttpRequestToolInput;
  "memory.get": MemoryGetToolInput;
  "memory.set": MemorySetToolInput;
  "credentials.get": CredentialsGetToolInput;
  "evidence.record": EvidenceRecordToolInput;
  "finding.record": FindingRecordToolInput;
  "browser.goto": BrowserGotoToolInput;
  "browser.click": BrowserClickToolInput;
  "browser.fill": BrowserFillToolInput;
  "browser.press": BrowserPressToolInput;
  "browser.waitFor": BrowserWaitForToolInput;
  "browser.screenshot": BrowserScreenshotToolInput;
  "browser.extractText": BrowserExtractTextToolInput;
  "browser.currentUrl": Record<string, never>;
  "recon.subfinder": PreviewCommandToolInput;
  "recon.naabu": PreviewCommandToolInput;
  "recon.httpx": PreviewCommandToolInput;
  "recon.katana": PreviewCommandToolInput;
  "recon.ffuf": PreviewCommandToolInput;
  "web.arjun": PreviewCommandToolInput;
  "web.dirsearch": PreviewCommandToolInput;
  "web.wafw00f": PreviewCommandToolInput;
  "web.gospider": PreviewCommandToolInput;
  "llm.respond": LlmRespondToolInput;
}

export interface ToolOutputByName {
  "http.request": HttpRequestToolOutput;
  "memory.get": MemoryGetToolOutput;
  "memory.set": MemorySetToolOutput;
  "credentials.get": CredentialsGetToolOutput;
  "evidence.record": EvidenceRecordToolOutput;
  "finding.record": FindingRecordToolOutput;
  "browser.goto": BrowserCurrentUrlToolOutput;
  "browser.click": BrowserOkToolOutput;
  "browser.fill": BrowserOkToolOutput;
  "browser.press": BrowserOkToolOutput;
  "browser.waitFor": BrowserOkToolOutput;
  "browser.screenshot": BrowserScreenshotToolOutput;
  "browser.extractText": BrowserExtractTextToolOutput;
  "browser.currentUrl": BrowserCurrentUrlToolOutput;
  "recon.subfinder": PreviewCommandToolOutput;
  "recon.naabu": PreviewCommandToolOutput;
  "recon.httpx": PreviewCommandToolOutput;
  "recon.katana": PreviewCommandToolOutput;
  "recon.ffuf": PreviewCommandToolOutput;
  "web.arjun": PreviewCommandToolOutput;
  "web.dirsearch": PreviewCommandToolOutput;
  "web.wafw00f": PreviewCommandToolOutput;
  "web.gospider": PreviewCommandToolOutput;
  "llm.respond": LlmRespondToolOutput;
}

export type ToolName = keyof ToolInputByName & keyof ToolOutputByName;
export type RedAgentScope = ToolName;

export interface ToolDefinition<TName extends ToolName = ToolName> {
  name: TName;
  namespace: TName extends `${infer TNamespace}.${string}` ? TNamespace : never;
  method: TName extends `${string}.${infer TMethod}` ? TMethod : never;
  stability: "internal" | "preview" | "stable" | "deprecated";
  capability?: RedAgentCapabilityKey;
  introducedIn: string;
  docsSlug: string;
  errorCodes: readonly string[];
}

function defineTool<const TName extends ToolName>(
  definition: ToolDefinition<TName>,
): ToolDefinition<TName> {
  return definition;
}

export const toolRegistry = {
  "http.request": defineTool({
    name: "http.request",
    namespace: "http",
    method: "request",
    stability: "stable",
    capability: "http",
    introducedIn: "2026-04",
    docsSlug: "tools/http-request",
    errorCodes: [
      "http_request_failed",
      "agent_tool_timeout",
      "agent_http_invalid_target",
      "agent_network_mediation_failed",
    ],
  }),
  "memory.get": defineTool({
    name: "memory.get",
    namespace: "memory",
    method: "get",
    stability: "stable",
    capability: "memory",
    introducedIn: "2026-04",
    docsSlug: "tools/memory-get",
    errorCodes: [],
  }),
  "memory.set": defineTool({
    name: "memory.set",
    namespace: "memory",
    method: "set",
    stability: "stable",
    capability: "memory",
    introducedIn: "2026-04",
    docsSlug: "tools/memory-set",
    errorCodes: [],
  }),
  "credentials.get": defineTool({
    name: "credentials.get",
    namespace: "credentials",
    method: "get",
    stability: "stable",
    capability: "credentials",
    introducedIn: "2026-04",
    docsSlug: "tools/credentials-get",
    errorCodes: [],
  }),
  "evidence.record": defineTool({
    name: "evidence.record",
    namespace: "evidence",
    method: "record",
    stability: "stable",
    capability: "evidence",
    introducedIn: "2026-04",
    docsSlug: "tools/evidence-record",
    errorCodes: [],
  }),
  "finding.record": defineTool({
    name: "finding.record",
    namespace: "finding",
    method: "record",
    stability: "stable",
    capability: "evidence",
    introducedIn: "2026-04",
    docsSlug: "tools/finding-record",
    errorCodes: ["finding_invalid_input", "finding_persist_failed"],
  }),
  "browser.goto": defineTool({
    name: "browser.goto",
    namespace: "browser",
    method: "goto",
    stability: "stable",
    capability: "browser",
    introducedIn: "2026-04",
    docsSlug: "tools/browser-goto",
    errorCodes: ["browser_invalid_input", "browser_invalid_target", "agent_tool_timeout"],
  }),
  "browser.click": defineTool({
    name: "browser.click",
    namespace: "browser",
    method: "click",
    stability: "stable",
    capability: "browser",
    introducedIn: "2026-04",
    docsSlug: "tools/browser-click",
    errorCodes: ["browser_invalid_input", "agent_tool_timeout"],
  }),
  "browser.fill": defineTool({
    name: "browser.fill",
    namespace: "browser",
    method: "fill",
    stability: "stable",
    capability: "browser",
    introducedIn: "2026-04",
    docsSlug: "tools/browser-fill",
    errorCodes: ["browser_invalid_input", "agent_tool_timeout"],
  }),
  "browser.press": defineTool({
    name: "browser.press",
    namespace: "browser",
    method: "press",
    stability: "stable",
    capability: "browser",
    introducedIn: "2026-04",
    docsSlug: "tools/browser-press",
    errorCodes: ["browser_invalid_input", "agent_tool_timeout"],
  }),
  "browser.waitFor": defineTool({
    name: "browser.waitFor",
    namespace: "browser",
    method: "waitFor",
    stability: "stable",
    capability: "browser",
    introducedIn: "2026-04",
    docsSlug: "tools/browser-wait-for",
    errorCodes: ["browser_invalid_input", "browser_invalid_target", "agent_tool_timeout"],
  }),
  "browser.screenshot": defineTool({
    name: "browser.screenshot",
    namespace: "browser",
    method: "screenshot",
    stability: "stable",
    capability: "browser",
    introducedIn: "2026-04",
    docsSlug: "tools/browser-screenshot",
    errorCodes: ["browser_invalid_input", "agent_tool_timeout"],
  }),
  "browser.extractText": defineTool({
    name: "browser.extractText",
    namespace: "browser",
    method: "extractText",
    stability: "stable",
    capability: "browser",
    introducedIn: "2026-04",
    docsSlug: "tools/browser-extract-text",
    errorCodes: ["browser_invalid_input", "agent_tool_timeout"],
  }),
  "browser.currentUrl": defineTool({
    name: "browser.currentUrl",
    namespace: "browser",
    method: "currentUrl",
    stability: "stable",
    capability: "browser",
    introducedIn: "2026-04",
    docsSlug: "tools/browser-current-url",
    errorCodes: ["agent_tool_timeout"],
  }),
  "recon.subfinder": defineTool({
    name: "recon.subfinder",
    namespace: "recon",
    method: "subfinder",
    stability: "preview",
    introducedIn: "2026-04",
    docsSlug: "tools/recon-subfinder",
    errorCodes: ["tool_policy_denied", "agent_tool_timeout", "tool_execution_failed"],
  }),
  "recon.naabu": defineTool({
    name: "recon.naabu",
    namespace: "recon",
    method: "naabu",
    stability: "preview",
    introducedIn: "2026-04",
    docsSlug: "tools/recon-naabu",
    errorCodes: ["tool_policy_denied", "agent_tool_timeout", "tool_execution_failed"],
  }),
  "recon.httpx": defineTool({
    name: "recon.httpx",
    namespace: "recon",
    method: "httpx",
    stability: "preview",
    introducedIn: "2026-04",
    docsSlug: "tools/recon-httpx",
    errorCodes: ["tool_policy_denied", "agent_tool_timeout", "tool_execution_failed"],
  }),
  "recon.katana": defineTool({
    name: "recon.katana",
    namespace: "recon",
    method: "katana",
    stability: "preview",
    introducedIn: "2026-04",
    docsSlug: "tools/recon-katana",
    errorCodes: ["tool_policy_denied", "agent_tool_timeout", "tool_execution_failed"],
  }),
  "recon.ffuf": defineTool({
    name: "recon.ffuf",
    namespace: "recon",
    method: "ffuf",
    stability: "preview",
    introducedIn: "2026-04",
    docsSlug: "tools/recon-ffuf",
    errorCodes: ["tool_policy_denied", "agent_tool_timeout", "tool_execution_failed"],
  }),
  "web.arjun": defineTool({
    name: "web.arjun",
    namespace: "web",
    method: "arjun",
    stability: "preview",
    introducedIn: "2026-04",
    docsSlug: "tools/web-arjun",
    errorCodes: ["tool_policy_denied", "agent_tool_timeout", "tool_execution_failed"],
  }),
  "web.dirsearch": defineTool({
    name: "web.dirsearch",
    namespace: "web",
    method: "dirsearch",
    stability: "preview",
    introducedIn: "2026-04",
    docsSlug: "tools/web-dirsearch",
    errorCodes: ["tool_policy_denied", "agent_tool_timeout", "tool_execution_failed"],
  }),
  "web.wafw00f": defineTool({
    name: "web.wafw00f",
    namespace: "web",
    method: "wafw00f",
    stability: "preview",
    introducedIn: "2026-04",
    docsSlug: "tools/web-wafw00f",
    errorCodes: ["tool_policy_denied", "agent_tool_timeout", "tool_execution_failed"],
  }),
  "web.gospider": defineTool({
    name: "web.gospider",
    namespace: "web",
    method: "gospider",
    stability: "preview",
    introducedIn: "2026-04",
    docsSlug: "tools/web-gospider",
    errorCodes: ["tool_policy_denied", "agent_tool_timeout", "tool_execution_failed"],
  }),
  "llm.respond": defineTool({
    name: "llm.respond",
    namespace: "llm",
    method: "respond",
    stability: "preview",
    introducedIn: "2026-04",
    docsSlug: "tools/llm-respond",
    errorCodes: ["llm_invalid_input", "llm_model_unavailable", "llm_provider_request_failed"],
  }),
} as const satisfies Record<ToolName, ToolDefinition>;

export const toolNames = Object.keys(toolRegistry) as ToolName[];

export interface ToolInvokeOptions {
  signal?: AbortSignal;
}

export interface ToolInvocationEnvelope<TName extends ToolName = ToolName> {
  toolName: TName;
  input: ToolInputByName[TName];
}

export interface ToolResultEnvelope<TName extends ToolName = ToolName> {
  toolName: TName;
  output: ToolOutputByName[TName];
}

export interface ToolTransport {
  invoke<TName extends ToolName>(
    toolName: TName,
    input: ToolInputByName[TName],
    options?: ToolInvokeOptions,
  ): Promise<ToolOutputByName[TName]>;
}

export interface RedAgentPackageManifest {
  sdkVersion: string;
  kind: "red";
  name: string;
  description: string;
  category: RedAgentCategory;
  minSupportedTier: RedAgentTier;
  entrypoint: string;
  capabilities: RedAgentCapabilities;
  scopes: RedAgentScope[];
  build?: {
    dockerfile: string;
    context?: string;
  };
}

export function getCapabilityForTool(toolName: ToolName): RedAgentCapabilityKey {
  const capability = toolRegistry[toolName].capability;

  if (!capability) {
    throw new Error(`${toolName} is scope-gated and does not map to a legacy capability`);
  }

  return capability;
}

export function isToolEnabled(
  capabilities: RedAgentCapabilities,
  toolName: ToolName,
): boolean {
  return capabilities[getCapabilityForTool(toolName)];
}

export function isScopeGatedTool(toolName: ToolName): boolean {
  return toolRegistry[toolName].capability === undefined;
}

export function getLegacyCapabilityToolScopes(
  capabilities: RedAgentCapabilities,
): RedAgentScope[] {
  return toolNames.filter((toolName) => {
    const capability = toolRegistry[toolName].capability;
    return capability ? capabilities[capability] : false;
  });
}

export function normalizeRedAgentScopes(
  scopes: readonly string[] | null | undefined,
  capabilities: RedAgentCapabilities,
): RedAgentScope[] {
  const merged = new Set<RedAgentScope>(getLegacyCapabilityToolScopes(capabilities));

  for (const scope of scopes ?? []) {
    if ((toolNames as readonly string[]).includes(scope)) {
      merged.add(scope as RedAgentScope);
    }
  }

  return [...merged];
}

export function isToolEnabledForPermissions(
  permissions: RedAgentPermissionContract,
  toolName: ToolName,
): boolean {
  if (isScopeGatedTool(toolName)) {
    return permissions.scopes.includes(toolName);
  }

  return isToolEnabled(permissions.capabilities, toolName);
}
