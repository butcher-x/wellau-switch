/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_WELLAU_SWITCH_REPOSITORY_URL?: string;
    readonly VITE_WELLAU_SWITCH_DOWNLOAD_URL?: string;
    readonly VITE_WELLAU_SWITCH_WINDOWS_DOWNLOAD_URL?: string;
    readonly VITE_WELLAU_SWITCH_MACOS_DOWNLOAD_URL?: string;
    readonly VITE_WELLAU_SWITCH_RELEASES_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
