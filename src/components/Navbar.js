import React from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  useTheme,
} from "@mui/material";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import LogoutIcon from "@mui/icons-material/Logout";
import { useNavigate } from "react-router-dom";

export default function Navbar({ darkMode, setDarkMode, sidebarOpen }) {
  const theme = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("auth");
    navigate("/login");
  };

  return (
    <AppBar
      position="fixed" // 👈 fixed top bar
      elevation={3} // lighter shadow
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1, // always above sidebar
        height: "64px",
        ml: sidebarOpen ? "220px" : "70px",
        width: `calc(100% - ${sidebarOpen ? 220 : 70}px)`,
        transition: "all 0.3s ease",
        background:
          theme.palette.mode === "light"
            ? "linear-gradient(90deg,#6366F1,#14B8A6)"
            : "linear-gradient(90deg,#0f172a,#1e293b)",
        color: "#fff",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <Toolbar sx={{ display: "flex", justifyContent: "space-between", px: 3 }}>
        {/* Branding */}
        <Box display="flex" alignItems="center">
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "linear-gradient(135deg,#6366F1,#14B8A6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mr: 2,
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            <Typography
              variant="body2"
              fontWeight={700}
              sx={{ color: "#fff", letterSpacing: 1 }}
            >
              EM
            </Typography>
          </Box>
          <Typography
            variant="h6"
            fontWeight={700}
            sx={{
              background: "linear-gradient(90deg,#38bdf8,#818cf8)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: 1,
            }}
          >
            Employee Monitor
          </Typography>
        </Box>

        {/* Right side buttons */}
        <Box display="flex" alignItems="center" gap={1}>
          <IconButton
            onClick={() => setDarkMode(!darkMode)}
            sx={{
              color: "white",
              bgcolor: "rgba(255,255,255,0.15)",
              "&:hover": { bgcolor: "rgba(255,255,255,0.25)" },
            }}
          >
            {darkMode ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>
          <IconButton
            onClick={handleLogout}
            sx={{
              color: "white",
              bgcolor: "rgba(255,255,255,0.15)",
              "&:hover": { bgcolor: "rgba(255,255,255,0.25)" },
            }}
          >
            <LogoutIcon />
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
