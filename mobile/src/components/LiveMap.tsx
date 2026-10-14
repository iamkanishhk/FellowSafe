import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";
import type { SosLiveLocation } from "../lib/api";

const MAPS_ENABLED =
  Platform.OS === "ios" || !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

interface LiveMapProps {
  location: SosLiveLocation | null;
  ownerName: string;
  resolved?: boolean;
}

function formatCoords(location: SosLiveLocation): string {
  return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
}

/**
 * Live view of the victim's position for the contact's lockscreen takeover.
 * Renders a real map when a Google Maps key is configured, otherwise a
 * readable coordinates panel so the feature still degrades gracefully.
 */
export default function LiveMap({ location, ownerName, resolved }: LiveMapProps) {
  const region = useMemo(
    () =>
      location
        ? {
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.008,
            longitudeDelta: 0.008,
          }
        : null,
    [location],
  );

  if (!location) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>
          {resolved ? "Location sharing ended" : "Waiting for location\u2026"}
        </Text>
        <Text style={styles.fallbackBody}>
          {resolved
            ? `${ownerName} is safe.`
            : `${ownerName}'s device is sharing its position.`}
        </Text>
      </View>
    );
  }

  if (!MAPS_ENABLED) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>
          {ownerName}&apos;s location
        </Text>
        <Text style={styles.coords}>{formatCoords(location)}</Text>
        {location.accuracy != null ? (
          <Text style={styles.fallbackBody}>
            within ~{Math.round(location.accuracy)} m
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <MapView
      style={styles.map}
      region={region ?? undefined}
      showsUserLocation={false}
      showsMyLocationButton={false}
      toolbarEnabled={false}
    >
      <Marker
        coordinate={{
          latitude: location.latitude,
          longitude: location.longitude,
        }}
        title={ownerName}
        description={formatCoords(location)}
        pinColor="#E84444"
      />
      {location.accuracy != null ? (
        <Circle
          center={{
            latitude: location.latitude,
            longitude: location.longitude,
          }}
          radius={Math.max(location.accuracy, 10)}
          strokeColor="rgba(232,68,68,0.5)"
          fillColor="rgba(232,68,68,0.15)"
        />
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
    width: "100%",
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  fallbackTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  fallbackBody: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    textAlign: "center",
  },
  coords: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.5,
    textAlign: "center",
  },
});
