import { alpha, createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#7c88f6",
      light: "#a8b2ff",
      dark: "#5f6cd8",
    },
    secondary: {
      main: "#66b7ff",
      light: "#92ccff",
      dark: "#418fda",
    },
    success: {
      main: "#34c77b",
    },
    warning: {
      main: "#f0b14f",
    },
    error: {
      main: "#ef7676",
    },
    background: {
      default: "#0f141c",
      paper: "#151b24",
    },
    text: {
      primary: "#edf2fb",
      secondary: "#98a3b6",
    },
    divider: "rgba(255,255,255,0.07)",
  },
  shape: {
    borderRadius: 16,
  },
  spacing: 8,
  typography: {
    fontFamily: '"Inter", "Segoe UI Variable", "Segoe UI", sans-serif',
    h1: {
      fontSize: "2.3rem",
      fontWeight: 700,
      letterSpacing: "-0.04em",
    },
    h2: {
      fontSize: "1.55rem",
      fontWeight: 700,
      letterSpacing: "-0.035em",
    },
    h3: {
      fontSize: "1.1rem",
      fontWeight: 700,
      letterSpacing: "-0.025em",
    },
    h4: {
      fontSize: "1rem",
      fontWeight: 700,
    },
    subtitle1: {
      fontSize: "0.95rem",
      fontWeight: 600,
    },
    subtitle2: {
      fontSize: "0.82rem",
      fontWeight: 700,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
    },
    body1: {
      fontSize: "0.95rem",
      lineHeight: 1.6,
    },
    body2: {
      fontSize: "0.86rem",
      lineHeight: 1.55,
    },
    button: {
      fontWeight: 700,
      letterSpacing: "0.01em",
      textTransform: "none",
    },
    caption: {
      fontSize: "0.75rem",
      letterSpacing: "0.02em",
    },
    overline: {
      fontSize: "0.73rem",
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background:
            "radial-gradient(circle at top right, rgba(82, 101, 214, 0.18), transparent 24rem), radial-gradient(circle at top left, rgba(59, 106, 159, 0.12), transparent 22rem), #0f141c",
        },
        "::selection": {
          background: "rgba(102, 200, 255, 0.3)",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha("#10161f", 0.9),
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 10px 24px rgba(0,0,0,0.22)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
        rounded: {
          borderRadius: 18,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(255,255,255,0.08)",
          backgroundColor: alpha("#151b24", 0.94),
          boxShadow: "0 12px 28px rgba(4, 8, 20, 0.2)",
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      variants: [
        {
          props: { variant: "contained", color: "primary" },
          style: {
            background: "linear-gradient(135deg, #6674df, #8392ff)",
            color: "#f8fbff",
            "&:hover": {
              background: "linear-gradient(135deg, #7180ec, #95a2ff)",
            },
          },
        },
      ],
      styleOverrides: {
        root: {
          borderRadius: 12,
          paddingInline: 16,
        },
        outlined: {
          borderColor: "rgba(255,255,255,0.1)",
        },
        text: {
          color: "#c7d0e0",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontWeight: 700,
        },
        outlined: {
          borderColor: "rgba(255,255,255,0.1)",
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 40,
        },
        indicator: {
          height: 3,
          borderRadius: 999,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 40,
          minWidth: 0,
          textTransform: "none",
          fontWeight: 700,
          color: "#aeb7c8",
          "&.Mui-selected": {
            color: "#f4f7fb",
          },
        },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          fontWeight: 800,
          borderRadius: 999,
          minWidth: 18,
          height: 18,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          border: "1px solid rgba(255,255,255,0.08)",
          backgroundColor: alpha("#171a21", 0.98),
          backgroundImage:
            "radial-gradient(circle at top left, rgba(120, 58, 150, 0.14), transparent 24rem)",
          boxShadow: "0 28px 64px rgba(2, 6, 16, 0.42)",
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          paddingBlock: 10,
          paddingInline: 12,
          border: "1px solid transparent",
          "&:hover": {
            backgroundColor: alpha("#ffffff", 0.035),
          },
          "&.Mui-selected": {
            backgroundColor: alpha("#7c88f6", 0.16),
            borderColor: alpha("#7c88f6", 0.26),
            "&:hover": {
              backgroundColor: alpha("#7c88f6", 0.22),
            },
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          backgroundColor: alpha("#ffffff", 0.028),
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255,255,255,0.08)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255,255,255,0.14)",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#7c88f6",
            boxShadow: "0 0 0 3px rgba(124, 136, 246, 0.14)",
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "#0c1018",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 12px 24px rgba(0,0,0,0.35)",
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: "rgba(255,255,255,0.08)",
        },
      },
    },
  },
});
