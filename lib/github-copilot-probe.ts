import {
    buildGitHubCopilotHeaders,
    getGitHubCopilotApiBaseUrl,
} from "@/lib/github-copilot"

function compactSnippet(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined
    }

    const compacted = value.replace(/\s+/g, " ").trim()
    return compacted ? compacted.slice(0, 200) : undefined
}

export interface GitHubCopilotRawProbeResult {
    ok: boolean
    statusCode: number
    responseSnippet?: string
    error?: string
}

export async function probeGitHubCopilotChatCompletions(input: {
    accessToken: string
    modelId: string
    enterpriseUrl?: string
}): Promise<GitHubCopilotRawProbeResult> {
    const baseUrl = getGitHubCopilotApiBaseUrl(input.enterpriseUrl)
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...buildGitHubCopilotHeaders({
                token: input.accessToken,
                initiator: "user",
            }),
        },
        body: JSON.stringify({
            model: input.modelId,
            stream: false,
            max_tokens: 16,
            messages: [{ role: "user", content: "Reply with exactly OK." }],
        }),
    })

    const text = await response.text()
    const responseSnippet = compactSnippet(text)

    if (!response.ok) {
        return {
            ok: false,
            statusCode: response.status,
            responseSnippet,
            error: responseSnippet || `HTTP ${response.status}`,
        }
    }

    try {
        const data = JSON.parse(text) as {
            choices?: Array<{
                message?: { content?: string | Array<{ text?: string }> }
            }>
        }

        const content = data.choices?.[0]?.message?.content
        const normalizedContent = Array.isArray(content)
            ? content.map((part) => part?.text || "").join("")
            : content

        if (typeof normalizedContent === "string" && normalizedContent) {
            return {
                ok: true,
                statusCode: response.status,
                responseSnippet,
            }
        }

        return {
            ok: false,
            statusCode: response.status,
            responseSnippet,
            error: "Missing assistant content in raw chat completion response",
        }
    } catch {
        return {
            ok: false,
            statusCode: response.status,
            responseSnippet,
            error: "Raw chat completion response was not valid JSON",
        }
    }
}
