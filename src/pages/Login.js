// login.js
import React, { useState } from "react";
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import LockOutlined from "@mui/icons-material/LockOutlined";
import api from "../api";

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState("employee"); // UI-only (for the tabs look)

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login", { identifier, password });
      if (!data?.token || !data?.user) throw new Error("Bad response");
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      window.location.replace("/employees");
    } catch (e2) {
      const msg = e2?.response?.data?.error || e2.message || "Login failed";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        p: 2,
        // full-screen gradient like the screenshot
        background: "linear-gradient(135deg, #5a67e6 0%, #22c1c3 100%)",
      }}
    >
      <Paper
        elevation={8}
        sx={{
          p: 5,
          width: "100%",
          maxWidth: 480,
          borderRadius: 4,
          bgcolor: "rgba(255,255,255,0.95)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.18)",
          textAlign: "center",
        }}
      >
        {/* Lock badge */}
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            mx: "auto",
            mb: 2,
            background: "linear-gradient(135deg, #5a67e6, #22c1c3)",
            color: "#fff",
          }}
        >
          <LockOutlined />
        </Box>

        <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>
          Employee Monitor — Login
        </Typography>

        {/* Segmented tabs for look/feel only */}
        <ToggleButtonGroup
          exclusive
          value={role}
          onChange={(_, v) => v && setRole(v)}
          fullWidth
          size="small"
          sx={{
            mb: 2,
            "& .MuiToggleButton-root": {
              flex: 1,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              borderRadius: 1,
              borderColor: "divider",
            },
            "& .Mui-selected": {
              bgcolor: "rgba(92,107,230,0.10) !important",
              borderColor: "primary.main",
            },
          }}
        >
          <ToggleButton value="employee">Employee</ToggleButton>
          <ToggleButton value="admin">Admin / Super</ToggleButton>
        </ToggleButtonGroup>

        {err && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {err}
          </Alert>
        )}

        <form onSubmit={onSubmit}>
          <TextField
            label="Employee ID *"
            placeholder="Email / Username / Emp ID"
            fullWidth
            margin="normal"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            fullWidth
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <Button
            variant="contained"
            type="submit"
            fullWidth
            disabled={busy}
            startIcon={busy ? <CircularProgress size={18} sx={{ color: "#fff" }} /> : null}
            sx={{
              mt: 2,
              py: 1.2,
              fontWeight: 700,
              letterSpacing: 0.5,
              borderRadius: 2,
              boxShadow: "none",
              background: "linear-gradient(90deg, #5a67e6 0%, #22c1c3 100%)",
              "&:hover": {
                filter: "brightness(0.95)",
                boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
                background: "linear-gradient(90deg, #5360e0 0%, #1fb6b5 100%)",
              },
            }}
          >
            {busy ? "Signing in…" : "LOGIN"}
          </Button>
        </form>

        <Typography
          variant="caption"
          sx={{ display: "block", mt: 3, color: "text.secondary" }}
        >
          © 2025 Employee Monitor
        </Typography>
      </Paper>
    </Box>
  );
}
