export function supportsImageInput(
    modelId: string,
    _provider?: string | null,
): boolean {
    const lowerModelId = modelId.toLowerCase()

    const hasVisionIndicator =
        lowerModelId.includes("vision") || lowerModelId.includes("vl")

    if (
        (lowerModelId.includes("kimi-k2") ||
            lowerModelId.includes("kimi_k2")) &&
        !hasVisionIndicator &&
        !lowerModelId.includes("2.5") &&
        !lowerModelId.includes("k2.5")
    ) {
        return false
    }

    if (lowerModelId.includes("moonshot-v1") && !hasVisionIndicator) {
        return false
    }

    if (lowerModelId.includes("minimax") && !hasVisionIndicator) {
        return false
    }

    if (lowerModelId.includes("deepseek") && !hasVisionIndicator) {
        return false
    }

    if (
        lowerModelId.includes("qwen") &&
        !hasVisionIndicator &&
        !lowerModelId.includes("qwen3.5-plus") &&
        !lowerModelId.includes("qwen3.5-flash")
    ) {
        return false
    }

    if (lowerModelId.includes("glm") && !hasVisionIndicator) {
        if (!/[\d.]v/.test(lowerModelId)) {
            return false
        }
    }

    return true
}
