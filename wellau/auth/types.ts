export interface WellauSession {
  email: string;
  user_id: number;
  balance: number;
  /** 过期时间戳（unix 秒）。 */
  expires_at: number;
  logged_in: boolean;
}

export interface WellauKey {
  key: string;
  name: string;
  /** "anthropic" | "claude" | "openai" 等。 */
  platform: string;
  status: string;
}

export type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; session: WellauSession };

export interface ImportSummary {
  imported: number;
  claude: number;
  codex: number;
  skipped: number;
}
