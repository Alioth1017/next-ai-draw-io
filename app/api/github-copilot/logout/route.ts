import { NextResponse } from "next/server"
import {
    clearGitHubCopilotAuthSession,
    clearGitHubCopilotDeviceSession,
} from "@/lib/github-copilot"

export const runtime = "nodejs"

export async function POST() {
    const response = NextResponse.json({ success: true })
    clearGitHubCopilotAuthSession(response)
    clearGitHubCopilotDeviceSession(response)
    return response
}
