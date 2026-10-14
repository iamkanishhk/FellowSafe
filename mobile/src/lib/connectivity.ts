import * as Network from "expo-network";

/**
 * Answers "can we reach the server right now?" using both an active connection
 * AND confirmed internet reachability, so a captive-portal Wi-Fi (connected but
 * not validated) counts as offline. See Plan §4.
 */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected === true && state.isInternetReachable !== false;
  } catch {
    // If the OS can't tell us, assume online: the online path is primary and a
    // failed POST is recovered by the queue anyway.
    return true;
  }
}

function toOnline(state: Network.NetworkState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

/**
 * Fires `listener` whenever the online/offline verdict flips. Repeat states are
 * swallowed so a flappy network doesn't spam the flush. Returns an unsubscribe
 * function.
 */
export function subscribeToConnectivity(
  listener: (online: boolean) => void,
): () => void {
  let last: boolean | null = null;
  const subscription = Network.addNetworkStateListener((state) => {
    const online = toOnline(state);
    if (online === last) return;
    last = online;
    listener(online);
  });
  return () => subscription.remove();
}
