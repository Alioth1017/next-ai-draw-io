const GITHUB_COPILOT_CONFIRMED_MODEL_CANDIDATES = [
    "gpt-4o",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.3-codex",
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
] as const

// Keep Claude probing conservative: retain only the most likely public ids plus
// a few protocol-compatibility aliases that have shown up in Copilot ecosystems.
const GITHUB_COPILOT_CLAUDE_DOC_STYLE_CANDIDATES = [
    "claude-haiku-4.5",
    "claude-sonnet-4",
    "claude-sonnet-4.6",
    "claude-opus-4.6",
] as const

const GITHUB_COPILOT_CLAUDE_ALIAS_CANDIDATES = [
    "claude-4-sonnet",
    "claude-4.6-sonnet",
    "claude-4.6-opus",
    "claude-4.5-haiku",
] as const

const GITHUB_COPILOT_CLAUDE_PROVIDER_STYLE_CANDIDATES = [
    "anthropic/claude-haiku-4.5",
    "anthropic/claude-sonnet-4",
    "anthropic/claude-sonnet-4.6",
    "anthropic/claude-opus-4.6",
    "anthropic.claude-sonnet-4-v1:0",
    "anthropic.claude-sonnet-4-6-v1:0",
    "anthropic.claude-opus-4-6-v1:0",
] as const

export const GITHUB_COPILOT_MODEL_CANDIDATES = Array.from(
    new Set([
        ...GITHUB_COPILOT_CONFIRMED_MODEL_CANDIDATES,
        ...GITHUB_COPILOT_CLAUDE_DOC_STYLE_CANDIDATES,
        ...GITHUB_COPILOT_CLAUDE_ALIAS_CANDIDATES,
        ...GITHUB_COPILOT_CLAUDE_PROVIDER_STYLE_CANDIDATES,
    ]),
)

export type GitHubCopilotDiscoveryErrorType =
    | "unsupported"
    | "invalid-json"
    | "rate-limit"
    | "auth"
    | "server-error"
    | "unknown"

export type GitHubCopilotDiscoveredModel = {
    modelId: string
    valid: boolean
    error?: string
    errorType?: GitHubCopilotDiscoveryErrorType
    statusCode?: number
    responseSnippet?: string
}
