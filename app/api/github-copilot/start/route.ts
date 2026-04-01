import { NextResponse } from "next/server"
import {
    clearGitHubCopilotAuthSession,
    setGitHubCopilotDeviceSession,
    startGitHubCopilotDeviceAuthorization,
} from "@/lib/github-copilot"

export const runtime = "nodejs"

export async function POST(req: Request) {
    try {
        const body = (await req.json().catch(() => ({}))) as {
            enterpriseUrl?: string
        }

        const session = await startGitHubCopilotDeviceAuthorization({
            enterpriseUrl: body.enterpriseUrl,
        })

        const response = NextResponse.json({
            pending: true,
            verificationUri: session.verificationUri,
            userCode: session.userCode,
            interval: session.interval,
            enterpriseUrl: session.enterpriseUrl,
        })

        clearGitHubCopilotAuthSession(response)
        setGitHubCopilotDeviceSession(response, session)
        return response
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Failed to start GitHub Copilot login"

        return NextResponse.json(
            {
                error: message,
            },
            {
                status:
                    message.includes("GitHub Enterprise host") ||
                    message.includes("HTTPS")
                        ? 400
                        : 500,
            },
        )
    }
}
