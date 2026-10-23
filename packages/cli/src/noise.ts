const NOISE = [
  /(^|\/)(node_modules|vendor|dist|build|coverage|target|generated|third_party|__pycache__|\.next|\.nuxt|\.output|venv|\.venv)(\/|$)/,
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock|Cargo\.lock|go\.sum|composer\.lock|Gemfile\.lock|poetry\.lock)$/i,
  /\.(min\.js|min\.css|map|snap|wasm|png|jpe?g|gif|webp|ico|pdf|zip|jar|woff2?)$/i,
]

export function isNoise(path: string): boolean {
  const posix = path.replaceAll('\\', '/')
  return NOISE.some((pattern) => pattern.test(posix))
}
