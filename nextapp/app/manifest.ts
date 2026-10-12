import type { MetadataRoute } from "next";

// For a phone's home screen and share sheet: the name, the dark
// background (the sidebar's, as viewport.themeColor in layout.tsx) and the
// icon big enough to fill a tile.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jellylens",
    short_name: "Jellylens",
    start_url: "/",
    display: "standalone",
    background_color: "#13101c",
    theme_color: "#13101c",
    icons: [{ src: "/apple-icon.png", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
