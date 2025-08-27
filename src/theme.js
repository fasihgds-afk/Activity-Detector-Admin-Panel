// src/theme.js
import { createTheme } from "@mui/material/styles";

export const getDesignTokens = (mode) => ({
  typography: {
    fontFamily: "Poppins, sans-serif",
  },
  palette: {
    mode,
    ...(mode === "light"
      ? {
          // 🎨 Light mode
          primary: { main: "#6366F1" },      // Indigo
          secondary: { main: "#14B8A6" },    // Teal
          background: {
            default: "#F8FAFC",  // slate-50
            paper: "#FFFFFF",
          },
          text: {
            primary: "#111827",  // slate-900
            secondary: "#475569" // slate-600
          },
        }
      : {
          // 🌙 Dark mode
          primary: { main: "#818CF8" },      // lighter indigo
          secondary: { main: "#2DD4BF" },    // teal glow
          background: {
            default: "#0F172A",  // slate-900
            paper: "#1E293B",    // slate-800
          },
          text: {
            primary: "#F8FAFC",  // slate-50
            secondary: "#94A3B8" // slate-400
          },
        }),
  },
});

export const createAppTheme = (mode) => createTheme(getDesignTokens(mode));
