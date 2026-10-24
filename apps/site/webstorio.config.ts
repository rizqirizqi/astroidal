import { defineConfig } from "@webstorio/cli/config";

const TITLE = "Astroidal — AI code review map, scorer, and helper";
const DESCRIPTION =
  "Astroidal draws the blast radius of a change, hands your agent a bug map, and scores what survives: Passed, Review, or Fix first. No dependency. One npx command.";

export default defineConfig({
  name: "Astroidal",
  subdomain: "astroidal",
  description: DESCRIPTION,
  compatibilityDate: "2026-10-23",
  features: {
    header: true,
    footer: true,
    content: false,
    form_and_survey: false,
    online_store: false,
    user_authentication: false,
    app_data: false,
    webstorio_badge: true,
  },
  branding: {
    colors: {
      primary: "#00F2FE",
      secondary: "#7F00FF",
      background: "#0B0F19",
      text: "#E8EEF8",
    },
    fonts: {
      primary: "custom:IBM Plex Sans",
      secondary: "custom:JetBrains Mono",
    },
    brandInfoFile: "brand/brand-info.md",
    designSystemFile: "brand/design-system.md",
    favicon: "favicon.png",
    defaultOgImage: "og.jpg",
  },
  components: [
    { file: "components/_header.tsx", slug: "_header", title: "Header" },
    { file: "components/_footer.tsx", slug: "_footer", title: "Footer" },
  ],
  pages: [
    {
      file: "pages/home.tsx",
      slug: "/",
      title: TITLE,
      type: "system",
      seo: {
        title: TITLE,
        description: DESCRIPTION,
        keywords:
          "AI code review, blast radius, bug map, code review map, pull request review",
        ogImage: "og.jpg",
      },
    },
  ],
  dev: { dataMode: "dummy", port: 9682 },
});
