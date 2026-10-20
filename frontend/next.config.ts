import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Don't generate an AGENTS.md file when running the dev server
  agentRules: false,
}

export default nextConfig
