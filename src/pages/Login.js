// src/pages/Login.jsx
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
import { saveAuth } from "../auth";

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState("employee"); // "employee" | "admin"

  const isEmployeeMode = role === "employee";
  const employeeOk = /^\d{6}$/.test(identifier);
  const adminOk = identifier.trim().length > 0 && password.trim().length > 0;

  function handleIdentifierChange(e) {
    const raw = e.target.value;
    if (isEmployeeMode) {
      setIdentifier(raw.replace(/\D/g, "").slice(0, 6));
    } else {
      setIdentifier(raw);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const payload = isEmployeeMode ? { identifier } : { identifier, password };
      const { data } = await api.post("/auth/login", payload);
      if (!data?.token || !data?.user) throw new Error("Bad response");

      // central auth store
      saveAuth({ token: data.token, user: data.user });

      // landing: employees screen
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
        background: "linear-gradient(135deg, #5a67e6 0%, #22c1c3 100%)",
      }}
    >
      <Paper
        elevation={8}
        sx={{
          p: { xs: 4, sm: 5 },
          width: "100%",
          maxWidth: 520,
          borderRadius: 4,
          bgcolor: "rgba(255,255,255,0.95)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.18)",
          textAlign: "center",
        }}
      >
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

        <form onSubmit={onSubmit} noValidate>
          <TextField
            label={isEmployeeMode ? "Employee ID *" : "Email / Username / Emp ID"}
            placeholder={isEmployeeMode ? "Six digits (e.g., 123456)" : ""}
            fullWidth
            margin="normal"
            value={identifier}
            onChange={handleIdentifierChange}
            autoFocus
            inputProps={
              isEmployeeMode
                ? { inputMode: "numeric", pattern: "\\d{6}", maxLength: 6 }
                : undefined
            }
            helperText={isEmployeeMode ? "Enter your 6-digit employee ID" : " "}
          />

          {!isEmployeeMode && (
            <TextField
              label="Password"
              type="password"
              fullWidth
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}

          <Button
            variant="contained"
            type="submit"
            fullWidth
            disabled={busy || (isEmployeeMode ? !employeeOk : !adminOk)}
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


