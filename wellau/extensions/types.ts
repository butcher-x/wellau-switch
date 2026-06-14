import type { ComponentType } from "react";

export interface WellauExtensionContext {
  activeApp: string;
}

export interface WellauExtension {
  id: string;
  title: string;
  description?: string;
  toolbarLabel?: string;
  Panel: ComponentType<WellauExtensionContext>;
}
