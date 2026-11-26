import type { MetadataRoute } from "next";

// Lets employees "install" the HRIS on their phone (PWA).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Surepay HRIS",
    short_name: "HRIS",
    description: "Surepay Technologies Inc. employee self-service",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f7f8fa",
    theme_color: "#0f5fd7",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
