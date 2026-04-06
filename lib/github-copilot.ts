import type { NextResponse } from "next/server"

const COPILOT_CLIENT_ID = "Ov23li8tweQw6odWQebz"
const COPILOT_DEFAULT_BASE_URL = "https://api.githubcopilot.com"
const COOKIE_AUTH = "next-ai-draw-io-copilot-auth"
const COOKIE_DEVICE = "next-ai-draw-io-copilot-device"
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30
const DEVICE_COOKIE_MAX_AGE = 60 * 15
const USER_AGENT = "next-ai-draw-io/github-copilot"
const GITHUB_PUBLIC_HOST = "github.com"
const DEFAULT_ALLOWED_GITHUB_ENTERPRISE_HOST_PATTERNS = ["*.ghe.com"]
const COPILOT_MODELS_CACHE_TTL_MS = 5 * 60 * 1000

type GitHubCopilotModelCatalogEntry = {
    id?: string
    supported_endpoints?: string[]
    capabilities?: {
        supports?: {
            vision?: boolean
        }
    }
}

type GitHubCopilotModelsCacheEntry = {
    expiresAt: number
    models: GitHubCopilotModelMetadata[]
}

const gitHubCopilotModelsCache = new Map<
    string,
    GitHubCopilotModelsCacheEntry
>()

export interface GitHubCopilotAuthSession {
    accessToken: string
    login?: string
    name?: string
    enterpriseUrl?: string
    expiresAt?: number
}

export interface GitHubCopilotDeviceSession {
    deviceCode: string
    userCode: string
    verificationUri: string
    interval: number
    enterpriseUrl?: string
}

export interface GitHubCopilotModelMetadata {
    modelId: string
    supportedEndpoints: string[]
    supportsVision: boolean
}

function getAllowedGitHubEnterpriseHosts(): string[] {
    const configuredHosts = process.env.GITHUB_COPILOT_ENTERPRISE_HOSTS

    return [
        ...DEFAULT_ALLOWED_GITHUB_ENTERPRISE_HOST_PATTERNS,
        ...(configuredHosts ? configuredHosts.split(",") : []),
    ]
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean)
}

function isAllowedGitHubEnterpriseHost(hostname: string): boolean {
    return getAllowedGitHubEnterpriseHosts().some((pattern) => {
        if (pattern.startsWith("*.")) {
            const suffix = pattern.slice(1)
            return hostname.endsWith(suffix) && hostname.length > suffix.length
        }

        if (pattern.startsWith(".")) {
            return hostname.endsWith(pattern)
        }

        return hostname === pattern
    })
}

export function normalizeGitHubEnterpriseHost(
    enterpriseUrl?: string | null,
): string | undefined {
    if (!enterpriseUrl?.trim()) {
        return undefined
    }

    const rawValue = enterpriseUrl.trim()
    const parsed = new URL(
        rawValue.includes("://") ? rawValue : `https://${rawValue}`,
    )

    if (parsed.protocol !== "https:") {
        throw new Error("GitHub Enterprise host must use HTTPS")
    }

    if (
        parsed.username ||
        parsed.password ||
        parsed.port ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash
    ) {
        throw new Error("Invalid GitHub Enterprise host")
    }

    const hostname = parsed.hostname.trim().toLowerCase()
    if (!hostname) {
        throw new Error("Invalid GitHub Enterprise host")
    }

    if (hostname === GITHUB_PUBLIC_HOST) {
        return undefined
    }

    if (!isAllowedGitHubEnterpriseHost(hostname)) {
        throw new Error(
            "Unsupported GitHub Enterprise host. Set GITHUB_COPILOT_ENTERPRISE_HOSTS to allow it.",
        )
    }

    return hostname
}

function normalizeSessionEnterpriseUrl<T extends { enterpriseUrl?: string }>(
    session: T,
): T | null {
    try {
        const enterpriseUrl = normalizeGitHubEnterpriseHost(
            session.enterpriseUrl,
        )
        return {
            ...session,
            enterpriseUrl,
        }
    } catch {
        return null
    }
}

function encodeCookieValue(value: unknown): string {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
}

function decodeCookieValue<T>(value: string | undefined): T | null {
    if (!value) return null

    try {
        const decoded = Buffer.from(value, "base64url").toString("utf8")
        return JSON.parse(decoded) as T
    } catch {
        return null
    }
}

function readCookie(req: Request, name: string): string | undefined {
    const cookieHeader = req.headers.get("cookie")
    if (!cookieHeader) return undefined

    const prefix = `${name}=`
    return cookieHeader
        .split(";")
        .map((item) => item.trim())
        .find((item) => item.startsWith(prefix))
        ?.slice(prefix.length)
}

function applyCookie(
    response: NextResponse,
    name: string,
    value: string,
    maxAge: number,
) {
    response.cookies.set(name, value, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge,
    })
}

export function getGitHubCopilotApiBaseUrl(
    enterpriseUrl?: string | null,
): string {
    const enterpriseHost = normalizeGitHubEnterpriseHost(enterpriseUrl)
    if (!enterpriseHost) return COPILOT_DEFAULT_BASE_URL
    return `https://copilot-api.${enterpriseHost}`
}

export function getGitHubApiBaseUrl(enterpriseUrl?: string): string {
    const enterpriseHost = normalizeGitHubEnterpriseHost(enterpriseUrl)
    if (!enterpriseHost) return "https://api.github.com"
    return `https://${enterpriseHost}/api/v3`
}

export function getGitHubCopilotAuthSession(
    req: Request,
): GitHubCopilotAuthSession | null {
    const session = decodeCookieValue<GitHubCopilotAuthSession>(
        readCookie(req, COOKIE_AUTH),
    )

    if (!session) {
        return null
    }

    return normalizeSessionEnterpriseUrl(session)
}

export function getGitHubCopilotDeviceSession(
    req: Request,
): GitHubCopilotDeviceSession | null {
    const session = decodeCookieValue<GitHubCopilotDeviceSession>(
        readCookie(req, COOKIE_DEVICE),
    )

    if (!session) {
        return null
    }

    return normalizeSessionEnterpriseUrl(session)
}

export function setGitHubCopilotAuthSession(
    response: NextResponse,
    session: GitHubCopilotAuthSession,
) {
    const normalizedSession = {
        ...session,
        enterpriseUrl: normalizeGitHubEnterpriseHost(session.enterpriseUrl),
    }

    applyCookie(
        response,
        COOKIE_AUTH,
        encodeCookieValue(normalizedSession),
        AUTH_COOKIE_MAX_AGE,
    )
}

export function clearGitHubCopilotAuthSession(response: NextResponse) {
    response.cookies.set(COOKIE_AUTH, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
    })
}

export function setGitHubCopilotDeviceSession(
    response: NextResponse,
    session: GitHubCopilotDeviceSession,
) {
    const normalizedSession = {
        ...session,
        enterpriseUrl: normalizeGitHubEnterpriseHost(session.enterpriseUrl),
    }

    applyCookie(
        response,
        COOKIE_DEVICE,
        encodeCookieValue(normalizedSession),
        DEVICE_COOKIE_MAX_AGE,
    )
}

export function clearGitHubCopilotDeviceSession(response: NextResponse) {
    response.cookies.set(COOKIE_DEVICE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
    })
}

export async function startGitHubCopilotDeviceAuthorization(input?: {
    enterpriseUrl?: string
}) {
    const enterpriseHost = normalizeGitHubEnterpriseHost(input?.enterpriseUrl)
    const githubBaseUrl = enterpriseHost
        ? `https://${enterpriseHost}`
        : "https://github.com"

    const response = await fetch(`${githubBaseUrl}/login/device/code`, {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({
            client_id: COPILOT_CLIENT_ID,
            scope: "read:user",
        }),
    })

    if (!response.ok) {
        throw new Error("Failed to start GitHub Copilot device login")
    }

    const data = (await response.json()) as {
        device_code: string
        user_code: string
        verification_uri: string
        interval?: number
    }

    return {
        deviceCode: data.device_code,
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        interval: Math.max(data.interval || 5, 1),
        enterpriseUrl: enterpriseHost,
    } satisfies GitHubCopilotDeviceSession
}

export async function pollGitHubCopilotDeviceAuthorization(
    session: GitHubCopilotDeviceSession,
): Promise<
    | { type: "pending"; interval: number }
    | { type: "success"; accessToken: string; enterpriseUrl?: string }
    | { type: "failed"; error: string }
> {
    const enterpriseHost = normalizeGitHubEnterpriseHost(session.enterpriseUrl)
    const githubBaseUrl = enterpriseHost
        ? `https://${enterpriseHost}`
        : "https://github.com"

    const response = await fetch(`${githubBaseUrl}/login/oauth/access_token`, {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({
            client_id: COPILOT_CLIENT_ID,
            device_code: session.deviceCode,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
    })

    if (!response.ok) {
        return {
            type: "failed",
            error: "Failed to complete GitHub Copilot authorization",
        }
    }

    const data = (await response.json()) as {
        access_token?: string
        error?: string
        interval?: number
    }

    if (data.access_token) {
        return {
            type: "success",
            accessToken: data.access_token,
            enterpriseUrl: enterpriseHost,
        }
    }

    if (data.error === "authorization_pending") {
        return {
            type: "pending",
            interval: Math.max(data.interval || session.interval || 5, 1),
        }
    }

    if (data.error === "slow_down") {
        return {
            type: "pending",
            interval: Math.max(data.interval || session.interval + 5 || 10, 1),
        }
    }

    return {
        type: "failed",
        error: data.error || "GitHub Copilot authorization failed",
    }
}

export async function fetchGitHubCopilotViewer(
    accessToken: string,
    enterpriseUrl?: string,
) {
    const response = await fetch(`${getGitHubApiBaseUrl(enterpriseUrl)}/user`, {
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": USER_AGENT,
        },
        cache: "no-store",
    })

    if (!response.ok) {
        return null
    }

    const data = (await response.json()) as {
        login?: string
        name?: string
    }

    return {
        login: data.login,
        name: data.name,
    }
}

export function buildGitHubCopilotHeaders(input: {
    token: string
    isVision?: boolean
    initiator?: "agent" | "user"
    extraHeaders?: Record<string, string>
}): Record<string, string> {
    return {
        Authorization: `Bearer ${input.token}`,
        "Openai-Intent": "conversation-edits",
        "User-Agent": USER_AGENT,
        "x-initiator": input.initiator || "agent",
        ...(input.isVision ? { "Copilot-Vision-Request": "true" } : {}),
        ...(input.extraHeaders || {}),
    }
}

export function isGitHubCopilotResponsesOnlyModel(
    model:
        | Pick<GitHubCopilotModelMetadata, "supportedEndpoints">
        | null
        | undefined,
): boolean {
    if (!model) {
        return false
    }

    const supportedEndpoints = new Set(model.supportedEndpoints)
    return (
        supportedEndpoints.has("/responses") &&
        !supportedEndpoints.has("/chat/completions")
    )
}

function getGitHubCopilotModelsCacheKey(input: {
    token: string
    enterpriseUrl?: string
}): string {
    const enterpriseHost = normalizeGitHubEnterpriseHost(input.enterpriseUrl)
    return `${enterpriseHost || GITHUB_PUBLIC_HOST}:${input.token}`
}

export async function fetchGitHubCopilotModelMetadata(input: {
    token: string
    enterpriseUrl?: string
    fetchImpl?: typeof fetch
}): Promise<GitHubCopilotModelMetadata[]> {
    const cacheKey = getGitHubCopilotModelsCacheKey(input)
    const cached = gitHubCopilotModelsCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
        return cached.models
    }

    const fetchImpl = input.fetchImpl || fetch
    const response = await fetchImpl(
        `${getGitHubCopilotApiBaseUrl(input.enterpriseUrl)}/models`,
        {
            headers: {
                ...buildGitHubCopilotHeaders({
                    token: input.token,
                    initiator: "user",
                }),
                "X-Github-Api-Version": "2025-10-01",
            },
            cache: "no-store",
        },
    )

    if (!response.ok) {
        throw new Error(
            `Failed to fetch GitHub Copilot models: ${response.status}`,
        )
    }

    const payload = (await response.json()) as {
        data?: GitHubCopilotModelCatalogEntry[]
    }

    const models = Array.isArray(payload.data)
        ? payload.data
              .filter(
                  (
                      item,
                  ): item is GitHubCopilotModelCatalogEntry & { id: string } =>
                      typeof item.id === "string" && item.id.length > 0,
              )
              .map((item) => ({
                  modelId: item.id,
                  supportedEndpoints: Array.isArray(item.supported_endpoints)
                      ? item.supported_endpoints.filter(
                            (endpoint): endpoint is string =>
                                typeof endpoint === "string" &&
                                endpoint.length > 0,
                        )
                      : [],
                  supportsVision: item.capabilities?.supports?.vision === true,
              }))
        : []

    gitHubCopilotModelsCache.set(cacheKey, {
        expiresAt: Date.now() + COPILOT_MODELS_CACHE_TTL_MS,
        models,
    })

    return models
}

export async function getGitHubCopilotModelMetadataById(input: {
    token: string
    modelId: string
    enterpriseUrl?: string
    fetchImpl?: typeof fetch
}): Promise<GitHubCopilotModelMetadata | null> {
    const models = await fetchGitHubCopilotModelMetadata(input)
    return models.find((model) => model.modelId === input.modelId) || null
}

export function isGitHubCopilotResponsesNotFoundError(error: unknown): boolean {
    const errorObject = error as {
        url?: string
        statusCode?: number
        responseBody?: string
        cause?: {
            url?: string
            statusCode?: number
            responseBody?: string
        }
    }

    const url = errorObject?.url || errorObject?.cause?.url || ""
    const statusCode =
        errorObject?.statusCode || errorObject?.cause?.statusCode || undefined
    const responseBody =
        errorObject?.responseBody || errorObject?.cause?.responseBody || ""

    if (statusCode !== 404 || !url.includes("/responses") || !responseBody) {
        return false
    }

    try {
        const parsed = JSON.parse(responseBody) as {
            error?: {
                code?: string
            }
        }

        return parsed?.error?.code === "not_found"
    } catch {
        return responseBody.toLowerCase().includes("not_found")
    }
}

function inferGitHubCopilotRequestContext(
    url: string,
    init?: RequestInit,
): {
    initiator: "agent" | "user"
    isVision: boolean
} {
    try {
        const body =
            typeof init?.body === "string" ? JSON.parse(init.body) : undefined

        if (Array.isArray(body?.input)) {
            const lastInput = body.input[body.input.length - 1]
            return {
                initiator: lastInput?.role === "user" ? "user" : "agent",
                isVision: body.input.some(
                    (item: any) =>
                        Array.isArray(item?.content) &&
                        item.content.some(
                            (part: any) => part?.type === "input_image",
                        ),
                ),
            }
        }

        if (Array.isArray(body?.messages) && url.includes("completions")) {
            const lastMessage = body.messages[body.messages.length - 1]
            return {
                initiator: lastMessage?.role === "user" ? "user" : "agent",
                isVision: body.messages.some(
                    (message: any) =>
                        Array.isArray(message?.content) &&
                        message.content.some(
                            (part: any) => part?.type === "image_url",
                        ),
                ),
            }
        }
    } catch {
        // Ignore malformed bodies and fall back to default Copilot headers.
    }

    return {
        initiator: "agent",
        isVision: false,
    }
}

function extractRequestedModelId(init?: RequestInit): string | undefined {
    try {
        const body =
            typeof init?.body === "string" ? JSON.parse(init.body) : undefined

        return typeof body?.model === "string" ? body.model : undefined
    } catch {
        return undefined
    }
}

async function normalizeGitHubCopilotJsonResponse(input: {
    response: Response
    url: string
    init?: RequestInit
}): Promise<Response> {
    const { response, url, init } = input

    if (!response.ok || url.includes("/responses")) {
        return response
    }

    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
        return response
    }

    const text = await response.clone().text()
    if (!text.trim()) {
        return response
    }

    try {
        const data = JSON.parse(text) as {
            id?: string
            object?: string
            model?: string
            choices?: unknown[]
            created?: number
        }

        if (!Array.isArray(data.choices)) {
            return response
        }

        const requestedModelId = extractRequestedModelId(init)
        const normalized = {
            ...data,
            object: data.object || "chat.completion",
            model: data.model || requestedModelId || "github-copilot",
            created:
                typeof data.created === "number"
                    ? data.created
                    : Math.floor(Date.now() / 1000),
        }

        if (
            normalized.object === data.object &&
            normalized.model === data.model &&
            normalized.created === data.created
        ) {
            return response
        }

        const headers = new Headers(response.headers)
        headers.delete("content-length")

        return new Response(JSON.stringify(normalized), {
            status: response.status,
            statusText: response.statusText,
            headers,
        })
    } catch {
        return response
    }
}

export function createGitHubCopilotFetch(input: {
    token: string
    extraHeaders?: Record<string, string>
    fetchImpl?: typeof fetch
}): typeof fetch {
    const fetchImpl = input.fetchImpl || fetch

    return async (request, init) => {
        const url =
            request instanceof URL
                ? request.toString()
                : request instanceof Request
                  ? request.url
                  : String(request)

        const { initiator, isVision } = inferGitHubCopilotRequestContext(
            url,
            init,
        )
        const headers = new Headers(init?.headers)
        const copilotHeaders = buildGitHubCopilotHeaders({
            token: input.token,
            initiator,
            isVision,
            extraHeaders: input.extraHeaders,
        })

        for (const [key, value] of Object.entries(copilotHeaders)) {
            headers.set(key, value)
        }

        headers.delete("x-api-key")

        const response = await fetchImpl(request, {
            ...init,
            headers,
        })

        return normalizeGitHubCopilotJsonResponse({
            response,
            url,
            init,
        })
    }
}
