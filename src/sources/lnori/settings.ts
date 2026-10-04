import { UIForm, UIToggle } from "@suwatte/toolchain";

import { PREF_SHOW_ILLUSTRATIONS } from "./constants";

export async function loadShowIllustrations(): Promise<boolean> {
  return (await ObjectStore.boolean(PREF_SHOW_ILLUSTRATIONS)) ?? false;
}

export async function buildSettingsForm(): Promise<UIForm> {
  return {
    sections: [
      {
        header: "Reader",
        footer:
          "Includes color inserts and illustrations in volumes. LNORI's image server (img.lnori.com) was unreachable when this source was written; turn this off if volumes fail to load.",
        views: [
          UIToggle({
            id: PREF_SHOW_ILLUSTRATIONS,
            title: "Show Illustrations",
            defaultValue: false,
            currentValue: await loadShowIllustrations(),
          }),
        ],
      },
    ],
  };
}

export async function savePreferences(data: Record<string, unknown>): Promise<void> {
  if (typeof data[PREF_SHOW_ILLUSTRATIONS] === "boolean") {
    await ObjectStore.set(PREF_SHOW_ILLUSTRATIONS, data[PREF_SHOW_ILLUSTRATIONS]);
  }
}
