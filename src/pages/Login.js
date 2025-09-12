// src/pages/Login.js
import React, { useEffect, useState } from "react";
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
  InputAdornment,
  Divider,
} from "@mui/material";
import { Visibility, VisibilityOff, LockOutlined } from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import api from "../api";

export default function Login() {
  const theme = useTheme();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  // If already logged in, go directly to Employees
  useEffect(() => {
    const t = localStorage.getItem("token");
    if (t) window.location.replace("/employees");
  }, []);

  function friendlyError(e) {
    // Network / CORS
    if (!e?.response) {
      return "Network error: server unreachable or CORS blocked.";
    }
    return e.response?.data?.error || "Login failed";
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!identifier.trim()) {
      setErr("Please enter your username or Emp ID.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login", {
        identifier: identifier.trim(),
        password, // employees can be blank; admin/superadmin must match env creds
      });

      if (!data?.token || !data?.user) throw new Error("Bad response");

      // Persist token + user and set default header for this session
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      api.defaults.headers.common.Authorization = `Bearer ${data.token}`;

      window.location.replace("/employees");
    } catch (e2) {
      setErr(friendlyError(e2));
    } finally {
      setBusy(false);
    }
  }

  const gradientBg = `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.success.main})`;

  return (
    <Box
      minHeight="100dvh"
      display="grid"
      placeItems="center"
      sx={{
        p: 2,
        background:
          "radial-gradient(1200px 600px at 10% -10%, rgba(99,102,241,0.08), transparent), radial-gradient(1200px 600px at 90% 110%, rgba(34,197,94,0.08), transparent)",
      }}
    >
      <Paper elevation={8} sx={{ width: "100%", maxWidth: 440, borderRadius: 3, overflow: "hidden" }}>
        {/* Card header */}
        <Box sx={{ p: 2, background: gradientBg, color: "#fff" }}>
          <Box display="flex" alignItems="center" gap={1}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                bgcolor: "rgba(255,255,255,0.25)",
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              EM
            </Box>
            <Typography variant="h6" fontWeight={800}>
              Sign in
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ opacity: 0.95 }}>
            Employee Monitor — Admin Panel
          </Typography>
        </Box>

        <Box component="form" onSubmit={onSubmit} sx={{ p: 3 }}>
          {err ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {err}
            </Alert>
          ) : null}

          <TextField
            label="Email / Username / Emp ID"
            placeholder="admin | super | 1001 …"
            fullWidth
            autoFocus
            margin="normal"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />

          <TextField
            label="Password"
            type={showPwd ? "text" : "password"}
            fullWidth
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockOutlined fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle password visibility"
                    onClick={() => setShowPwd((v) => !v)}
                    edge="end"
                    size="small"
                  >
                    {showPwd ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            helperText="Leave blank if signing in as employee by Emp ID."
          />

          <Button
            variant="contained"
            type="submit"
            fullWidth
            sx={{ mt: 2, py: 1.2, fontWeight: 700 }}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={18} /> : null}
          >
            {busy ? "Signing in…" : "SIGN IN"}
          </Button>

          <Divider sx={{ my: 2 }} />

          <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.6 }}>
            • <strong>superadmin</strong>: use your SUPERADMIN_USER / SUPERADMIN_PASS<br />
            • <strong>admin</strong>: use ADMIN_USER / ADMIN_PASS<br />
            • <strong>employee</strong>: enter Emp ID only (password optional)
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}




