import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, G, Path, Rect, Text as SvgText } from "react-native-svg";

interface RouteStop {
  x: number;
  y: number;
  label: string;
}

interface MapCanvasProps {
  hasRoute?: boolean;
  routeStops?: RouteStop[];
  showHotspots?: boolean;
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#E5F3D6",
  },
});

export const MapCanvas = ({
  hasRoute = false,
  routeStops,
  showHotspots = true,
}: MapCanvasProps) => (
  <View style={styles.container} pointerEvents="none">
    <Svg width="100%" height="100%" viewBox="0 0 400 700">
      {/* Background land */}
      <Rect x="0" y="0" width="400" height="700" fill="#E5F3D6" />

      {/* Forest / Green zones */}
      <Path
        d="M 20 50 Q 80 20 140 70 T 260 90 T 380 40 L 400 0 L 0 0 Z"
        fill="#D1EBB8"
      />
      <Path
        d="M 310 180 Q 360 140 390 190 T 400 320 L 320 300 Z"
        fill="#D6EEC0"
      />
      <Path d="M 0 450 Q 60 410 110 460 T 130 580 L 0 620 Z" fill="#D4EDBC" />

      {/* River (Little Red River) */}
      <Path
        d="M 120 0 Q 180 80 190 150 T 260 270 T 320 350 T 400 420"
        stroke="#93C5FD"
        strokeWidth="14"
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M 190 150 Q 150 180 140 220"
        stroke="#BFDBFE"
        strokeWidth="6"
        fill="none"
      />

      {/* Secondary roads grid */}
      <Path
        d="M 0 160 L 400 160 M 0 260 L 400 260 M 0 380 L 400 380 M 0 520 L 400 520"
        stroke="#CBD5E1"
        strokeWidth="2.5"
        fill="none"
      />
      <Path
        d="M 70 0 L 70 700 M 160 0 L 160 700 M 250 0 L 250 700 M 340 0 L 340 700"
        stroke="#CBD5E1"
        strokeWidth="2.5"
        fill="none"
      />

      {/* Highway 367 / Diagonal main thoroughfare */}
      <Path
        d="M 40 700 L 380 180"
        stroke="#94A3B8"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M 40 700 L 380 180"
        stroke="#F8FAFC"
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Interstate 67 */}
      <Path
        d="M 130 0 L 230 700"
        stroke="#94A3B8"
        strokeWidth="7"
        fill="none"
      />
      <Path
        d="M 130 0 L 230 700"
        stroke="#FEF08A"
        strokeWidth="4"
        fill="none"
      />

      {/* Hotspot Hubs */}
      {showHotspots && (
        <G>
          {/* CastleCare Dispatch Hub 1 (East) */}
          <Circle cx="350" cy="220" r="28" fill="#EF4444" opacity="0.25" />
          <Circle cx="350" cy="220" r="18" fill="#EF4444" opacity="0.5" />
          <Circle cx="350" cy="220" r="12" fill="#0058B8" />
          <SvgText
            x="350"
            y="224"
            fontSize="10"
            fontWeight="bold"
            fill="#FFFFFF"
            textAnchor="middle"
          >
            ★
          </SvgText>

          {/* CastleCare Dispatch Hub 2 (West) */}
          <Circle cx="60" cy="280" r="24" fill="#F59E0B" opacity="0.25" />
          <Circle cx="60" cy="280" r="14" fill="#F59E0B" opacity="0.5" />
          <Circle cx="60" cy="280" r="10" fill="#0058B8" />
          <SvgText
            x="60"
            y="283"
            fontSize="9"
            fontWeight="bold"
            fill="#FFFFFF"
            textAnchor="middle"
          >
            ★
          </SvgText>
        </G>
      )}

      {/* Driver Current Location Pin */}
      <G>
        <Circle cx="260" cy="320" r="20" fill="#3B82F6" opacity="0.2" />
        <Circle
          cx="260"
          cy="320"
          r="10"
          fill="#2563EB"
          stroke="#FFFFFF"
          strokeWidth="3"
        />
      </G>

      {/* Route line if active job */}
      {hasRoute && (
        <G>
          <Path
            d="M 260 320 Q 300 280 340 240 L 290 170"
            stroke="#1D4ED8"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            strokeDasharray="8 4"
          />
          {/* Destination Pin */}
          <Circle
            cx="290"
            cy="170"
            r="14"
            fill="#10B981"
            stroke="#FFFFFF"
            strokeWidth="2.5"
          />
          <SvgText
            x="290"
            y="174"
            fontSize="10"
            fontWeight="bold"
            fill="#FFFFFF"
            textAnchor="middle"
          >
            1
          </SvgText>
        </G>
      )}

      {/* Custom route stops if provided */}
      {routeStops?.map((stop) => (
        <G key={`stop-${stop.x}-${stop.y}-${stop.label}`}>
          <Circle
            cx={stop.x}
            cy={stop.y}
            r="12"
            fill="#0058B8"
            stroke="#FFFFFF"
            strokeWidth="2"
          />
          <SvgText
            x={stop.x}
            y={stop.y + 4}
            fontSize="9"
            fontWeight="bold"
            fill="#FFFFFF"
            textAnchor="middle"
          >
            {stop.label}
          </SvgText>
        </G>
      ))}
    </Svg>
  </View>
);
