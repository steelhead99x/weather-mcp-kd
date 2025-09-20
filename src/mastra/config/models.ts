// Centralized model configuration for Anthropic

export const DEFAULT_ANTHROPIC_MODEL = "claude-3-haiku-20240307";

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
}
