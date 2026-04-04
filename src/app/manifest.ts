import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chertt",
    short_name: "Chertt",
    description: "Conversational operations workspace",
    start_url: "/auth/sign-in",
    display: "standalone",
    background_color: "#f4eadf",
    theme_color: "#bf5b31",
    icons: [
      {
        src: "/logo.png",
        sizes: "83x82",
        type: "image/png",
      },
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
