import { NextResponse } from "next/server"
import {
    getGitHubCopilotAuthSession,
    getGitHubCopilotDeviceSession,
} from "@/lib/github-copilot"

export const runtime = "nodejs"

export async function GET(req: Request) {
    const authSession = getGitHubCopilotAuthSession(req)
    const deviceSession = getGitHubCopilotDeviceSession(req)

    return NextResponse.json({
        connected: !!authSession,
        pending: !!deviceSession,
        login: authSession?.login,
        name: authSession?.name,
        accountLabel: authSession?.name || authSession?.login || undefined,
        enterpriseUrl:
            authSession?.enterpriseUrl || deviceSession?.enterpriseUrl,
        verificationUri: deviceSession?.verificationUri,
        userCode: deviceSession?.userCode,
        interval: deviceSession?.interval,
    })
}
