import { NextResponse } from "next/server"
import {
    clearGitHubCopilotDeviceSession,
    fetchGitHubCopilotViewer,
    getGitHubCopilotDeviceSession,
    pollGitHubCopilotDeviceAuthorization,
    setGitHubCopilotAuthSession,
    setGitHubCopilotDeviceSession,
} from "@/lib/github-copilot"

export const runtime = "nodejs"

export async function POST(req: Request) {
    const deviceSession = getGitHubCopilotDeviceSession(req)
    if (!deviceSession) {
        return NextResponse.json(
            { error: "No GitHub Copilot login is pending" },
            { status: 400 },
        )
    }

    const result = await pollGitHubCopilotDeviceAuthorization(deviceSession)

    if (result.type === "pending") {
        const response = NextResponse.json(
            {
                pending: true,
                verificationUri: deviceSession.verificationUri,
                userCode: deviceSession.userCode,
                interval: result.interval,
                enterpriseUrl: deviceSession.enterpriseUrl,
            },
            { status: 202 },
        )
        setGitHubCopilotDeviceSession(response, {
            ...deviceSession,
            interval: result.interval,
        })
        return response
    }

    if (result.type === "failed") {
        const response = NextResponse.json(
            { error: result.error },
            { status: 401 },
        )
        clearGitHubCopilotDeviceSession(response)
        return response
    }

    const viewer = await fetchGitHubCopilotViewer(
        result.accessToken,
        result.enterpriseUrl,
    )

    const response = NextResponse.json({
        connected: true,
        pending: false,
        login: viewer?.login,
        name: viewer?.name,
        accountLabel: viewer?.name || viewer?.login || "GitHub Copilot",
        enterpriseUrl: result.enterpriseUrl,
    })

    setGitHubCopilotAuthSession(response, {
        accessToken: result.accessToken,
        login: viewer?.login,
        name: viewer?.name,
        enterpriseUrl: result.enterpriseUrl,
    })
    clearGitHubCopilotDeviceSession(response)
    return response
}
