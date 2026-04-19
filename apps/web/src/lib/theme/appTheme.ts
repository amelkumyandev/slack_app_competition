import { alpha, createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#66c8ff",
      light: "#9cdbff",
      dark: "#2e8bd6",
    },
    secondary: {
      main: "#f08ab7",
      light: "#f4b0cf",
      dark: "#b45e87",
    },
    success: {
      main: "#41d18a",
    },
    warning: {
      main: "#f6b661",
    },
    error: {
      main: "#ff7d7d",
    },
    background: {
      default: "#111318",
      paper: "#171a21",
    },
    text: {
      primary: "#f4f7fb",
      secondary: "#aeb7c8",
    },
    divider: "rgba(255,255,255,0.08)",
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
            "radial-gradient(circle at top right, rgba(117, 55, 133, 0.24), transparent 26rem), radial-gradient(circle at top left, rgba(47, 130, 196, 0.18), transparent 22rem), #111318",
        },
        "::selection": {
          background: "rgba(102, 200, 255, 0.3)",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha("#0f1117", 0.86),
          backdropFilter: "blur(18px)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 12px 30px rgba(0,0,0,0.28)",
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
          backgroundColor: alpha("#171a21", 0.92),
          boxShadow: "0 18px 44px rgba(4, 8, 20, 0.28)",
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
            background: "linear-gradient(135deg, #2d7bd6, #5cc8ff)",
            color: "#08111b",
            "&:hover": {
              background: "linear-gradient(135deg, #3784df, #7dd6ff)",
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
          borderColor: "rgba(255,255,255,0.12)",
        },
        text: {
          color: "#c8d2e4",
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
            backgroundColor: alpha("#ffffff", 0.04),
          },
          "&.Mui-selected": {
            backgroundColor: alpha("#7f3f98", 0.22),
            borderColor: alpha("#7f3f98", 0.45),
            "&:hover": {
              backgroundColor: alpha("#7f3f98", 0.28),
            },
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          backgroundColor: alpha("#ffffff", 0.03),
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255,255,255,0.1)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255,255,255,0.18)",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#5cc8ff",
            boxShadow: "0 0 0 3px rgba(92, 200, 255, 0.14)",
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
