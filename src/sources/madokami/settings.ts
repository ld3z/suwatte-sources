import type { STTStore } from "@suwatte/toolchain";
import { UIForm, UITextField } from "@suwatte/toolchain";

import {
  FORM_PASSWORD,
  FORM_USERNAME,
  SECURE_PASSWORD,
  SECURE_USERNAME,
} from "./constants";

/** Provided by the app and the emulator, but not declared by the toolchain typings. */
declare const SecureStore: STTStore;

export interface Credentials {
  username: string;
  password: string;
}

export async function loadCredentials(): Promise<Credentials | null> {
  const [username, password] = await Promise.all([
    SecureStore.string(SECURE_USERNAME),
    SecureStore.string(SECURE_PASSWORD),
  ]);
  return username && password ? { username, password } : null;
}

export async function saveCredentials({ username, password }: Credentials): Promise<void> {
  await SecureStore.set(SECURE_USERNAME, username);
  await SecureStore.set(SECURE_PASSWORD, password);
}

export async function clearCredentials(): Promise<void> {
  await SecureStore.remove(SECURE_USERNAME);
  await SecureStore.remove(SECURE_PASSWORD);
}

/** Reads the submitted credentials; both fields empty means sign out. */
export function readCredentials(data: Record<string, unknown>): Credentials | null {
  const field = (key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");
  const username = field(FORM_USERNAME);
  const password = field(FORM_PASSWORD);

  if (!username && !password) return null;
  if (!username || !password) {
    throw new Error("Enter both your Madokami username and password.");
  }
  return { username, password };
}

export function buildSettingsForm(credentials: Credentials | null): UIForm {
  return {
    sections: [
      {
        header: "Account",
        footer: credentials
          ? `Signed in as ${credentials.username}. Clear both fields and save to sign out.`
          : "Madokami requires an account. Your credentials are checked against the site, then stored in the app's secure storage.",
        views: [
          UITextField({
            id: FORM_USERNAME,
            title: "Username",
            placeholder: "Username",
            defaultValue: "",
            currentValue: credentials?.username ?? "",
          }),
          UITextField({
            id: FORM_PASSWORD,
            title: "Password",
            placeholder: "Password",
            isSecure: true,
            defaultValue: "",
            currentValue: credentials?.password ?? "",
          }),
        ],
      },
    ],
  };
}
