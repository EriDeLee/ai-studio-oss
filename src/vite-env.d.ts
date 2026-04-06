/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string
  readonly VITE_GEMINI_BASE_URL?: string
  readonly GEMINI_API_KEY?: string
  readonly GEMINI_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
