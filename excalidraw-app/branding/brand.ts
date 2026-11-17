// Also imported by vite.config.mts (page title, meta tags, PWA manifest), so
// this module must stay free of browser-only code.

const productName = "Draw";

export const BRAND = {
  productName,
  name: `Deloitte ${productName}`,
  description: `Deloitte ${productName} is a collaborative whiteboard for sketching diagrams that have a hand-drawn feel to them.`,
  issuesUrl: "https://github.com/arnavverma2001/cursormystery/issues",
  themeColor: "#26890d",
} as const;
