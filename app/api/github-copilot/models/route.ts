import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"
import { NextResponse } from "next/server"
import { shouldUseGitHubCopilotResponsesApi } from "@/lib/ai-providers"
import {
    createGitHubCopilotFetch,
    getGitHubCopilotApiBaseUrl,
    getGitHubCopilotAuthSession,
} from "@/lib/github-copilot"
import {
    GITHUB_COPILOT_MODEL_CANDIDATES,
    type GitHubCopilotDiscoveredModel,
    type GitHubCopilotDiscoveryErrorType,
} from "@/lib/github-copilot-models"
import { probeGitHubCopilotChatCompletions } from "@/lib/github-copilot-probe"

export const runtime = "nodejs"

function compactSnippet(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined
    }

    const compacted = value.replace(/\s+/g, " ").trim()
    return compacted ? compacted.slice(0, 180) : undefined
}

function classifyDiscoveryError(input: {
    message: string
    statusCode?: number
}): GitHubCopilotDiscoveryErrorType {
    const normalized = input.message.toLowerCase()

    if (normalized.includes("requested model is not supported")) {
        return "unsupported"
    }
    if (
        normalized.includes("invalid json response") ||
        normalized.includes("json")
    ) {
        return "invalid-json"
    }
    if (
        input.statusCode === 429 ||
        normalized.includes("too many requests") ||
        normalized.includes("rate limit")
    ) {
        return "rate-limit"
    }
    if (
        input.statusCode === 401 ||
        input.statusCode === 403 ||
        normalized.includes("unauthorized") ||
        normalized.includes("forbidden")
    ) {
        return "auth"
    }
    if ((input.statusCode || 0) >= 500) {
        return "server-error"
    }

    return "unknown"
}

function extractDiscoveryFailure(
    error: unknown,
): Omit<GitHubCopilotDiscoveredModel, "modelId" | "valid"> {
    const errorObject = error as {
        message?: string
        statusCode?: number
        responseBody?: string
        cause?: {
            message?: string
            statusCode?: number
            responseBody?: string
        }
    }

    const statusCode =
        errorObject?.statusCode || errorObject?.cause?.statusCode || undefined
    const message =
        error instanceof Error
            ? error.message
            : errorObject?.message || "Validation failed"
    const responseSnippet =
        compactSnippet(errorObject?.responseBody) ||
        compactSnippet(errorObject?.cause?.responseBody) ||
        compactSnippet(errorObject?.cause?.message)

    return {
        error: message.slice(0, 200),
        errorType: classifyDiscoveryError({ message, statusCode }),
        statusCode,
        responseSnippet,
    }
}

async function validateGitHubCopilotModel(
    accessToken: string,
    baseUrl: string,
    modelId: string,
    enterpriseUrl?: string,
): Promise<GitHubCopilotDiscoveredModel> {
    try {
        const provider = createOpenAI({
            apiKey: accessToken,
            baseURL: baseUrl,
            fetch: createGitHubCopilotFetch({ token: accessToken }),
        })

        const model = shouldUseGitHubCopilotResponsesApi(modelId)
            ? provider.responses(modelId)
            : provider.chat(modelId)

        await generateText({
            model,
            prompt: "Reply with exactly OK.",
            maxOutputTokens: 16,
        })

        return { modelId, valid: true }
    } catch (error) {
        const failure = extractDiscoveryFailure(error)

        if (failure.errorType === "invalid-json") {
            const fallback = await probeGitHubCopilotChatCompletions({
                accessToken,
                modelId,
                enterpriseUrl,
            })

            if (fallback.ok) {
                return { modelId, valid: true }
            }
        }

        return {
            modelId,
            valid: false,
            ...failure,
        }
    }
}

export async function GET(req: Request) {
    const authSession = getGitHubCopilotAuthSession(req)
    if (!authSession?.accessToken) {
        return NextResponse.json(
            { error: "GitHub Copilot login required" },
            { status: 401 },
        )
    }

    const baseUrl = getGitHubCopilotApiBaseUrl(authSession.enterpriseUrl)
    const results: GitHubCopilotDiscoveredModel[] = []

    for (const modelId of GITHUB_COPILOT_MODEL_CANDIDATES) {
        results.push(
            await validateGitHubCopilotModel(
                authSession.accessToken,
                baseUrl,
                modelId,
                authSession.enterpriseUrl,
            ),
        )
    }

    return NextResponse.json({
        models: results
            .filter((result) => result.valid)
            .map((result) => result.modelId),
        rejected: results.filter((result) => !result.valid),
        checked: results.length,
    })
}
