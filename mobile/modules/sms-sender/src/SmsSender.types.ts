/** Per-recipient outcome of a silent SMS dispatch. */
export interface SmsSendResult {
  /** The number the message was addressed to. */
  address: string;
  /** True when the OS accepted the message for sending. */
  ok: boolean;
  /** How many SMS segments the message was split into. */
  parts: number;
  /** Failure reason when `ok` is false (e.g. "permission_denied"). */
  error: string | null;
}
