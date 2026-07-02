export type DownloadPlatform = "windows" | "macos";

export interface ProductDownloadLink {
  platform: DownloadPlatform;
  url: string;
}

export interface ProductDownloadConfig {
  id: string;
  name: string;
  descriptionKey: string;
  repositoryUrl: string;
  releaseNotesBaseUrl: string;
  downloads: ProductDownloadLink[];
}

const wellauSwitchRepositoryUrl =
  import.meta.env.VITE_WELLAU_SWITCH_REPOSITORY_URL ||
  "https://github.com/butcher-x/wellau-switch.git";

const wellauSwitchDownloadUrl =
  import.meta.env.VITE_WELLAU_SWITCH_DOWNLOAD_URL ||
  "https://juejin.cn/post/7355448283227684890";

export const wellauSwitchDownloadConfig: ProductDownloadConfig = {
  id: "wellau-switch",
  name: "Wellau Switch",
  descriptionKey: "settings.wellauSwitchDownloadDescription",
  repositoryUrl: wellauSwitchRepositoryUrl,
  releaseNotesBaseUrl:
    import.meta.env.VITE_WELLAU_SWITCH_RELEASES_URL ||
    wellauSwitchRepositoryUrl.replace(/\.git$/, "/releases"),
  downloads: [
    {
      platform: "windows",
      url:
        import.meta.env.VITE_WELLAU_SWITCH_WINDOWS_DOWNLOAD_URL ||
        wellauSwitchDownloadUrl,
    },
    {
      platform: "macos",
      url:
        import.meta.env.VITE_WELLAU_SWITCH_MACOS_DOWNLOAD_URL ||
        wellauSwitchDownloadUrl,
    },
  ],
};

export const downloadProducts: ProductDownloadConfig[] = [
  wellauSwitchDownloadConfig,
];
