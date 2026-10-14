import { NativeModule, requireOptionalNativeModule } from "expo";
import type { SmsSendResult } from "./SmsSender.types";

declare class SmsSenderModule extends NativeModule<{}> {
  /** True when the device has a cellular radio that can send SMS. */
  isSmsCapable(): boolean;
  /** True when the restricted SEND_SMS permission has been granted. */
  hasPermission(): boolean;
  /** Sends `message` to every address, silently, and resolves per recipient. */
  send(addresses: string[], message: string): Promise<SmsSendResult[]>;
}

/** Resolves to null on platforms/builds where the native module is absent. */
export default requireOptionalNativeModule<SmsSenderModule>("SmsSender");
