/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;

  // AI Providers
  readonly VITE_OPENROUTER_API_KEY?: string;
  readonly VITE_GEMINI_API_KEY?: string;

  // Socket.io (optional)
  readonly VITE_SOCKET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

