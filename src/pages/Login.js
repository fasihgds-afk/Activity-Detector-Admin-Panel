import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Button, TextField, Typography, Paper, Avatar, Snackbar, Alert,
  CircularProgress, ToggleButtonGroup, ToggleButton
} from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import api from "../api";              // ✅ use the shared axios instance
import { saveAuth } from "../auth";    // ✅ single source of truth for auth

export default function Login() {
  const [mode, setMode] = useState("employee"); // 'employee' | 'admin'
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ open: false, type: "success", msg: "" });
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const body =
        mode === "employee"
          ? { identifier: identifier.trim() }
          : { identifier: identifier.trim(), password };

      // ✅ same base URL and interceptors as the rest of the app
      const { data } = await api.post("/auth/login", body, { timeout: 15000 });
      if (!data?.token) throw new Error("No token from server");
      saveAuth({ token: data.token, user: data.user });

      setAlert({ open: true, type: "success", msg: "✅ Login successful" });
      setTimeout(() => navigate("/employees"), 600);
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        (err?.response?.status ? `HTTP ${err.response.status}` : err?.message) ||
        "Login failed";
      setAlert({ open: true, type: "error", msg: "❌ " + msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg,#6366F1,#14B8A6)",
        p: 2,
      }}
    >
      <Paper
        elevation={12}
        sx={{
          p: 6,
          width: 420,
          maxWidth: "95vw",
          borderRadius: "20px",
          textAlign: "center",
          backdropFilter: "blur(10px)",
          background: "rgba(255,255,255,0.9)",
        }}
      >
        <Avatar
          sx={{
            background:
              "linear-gradient(135deg, rgba(99,102,241,1) 0%, rgba(20,184,166,1) 100%)",
            width: 64,
            height: 64,
            margin: "0 auto",
            mb: 2,
          }}
        >
          <LockIcon fontSize="large" />
        </Avatar>

        <Typography variant="h5" fontWeight="bold" gutterBottom>
          Employee Monitor — Login
        </Typography>

        <ToggleButtonGroup
          color="primary"
          exclusive
          value={mode}
          onChange={(_, v) => v && setMode(v)}
          sx={{ my: 2 }}
        >
          <ToggleButton value="employee">Employee</ToggleButton>
          <ToggleButton value="admin">Admin / Super</ToggleButton>
        </ToggleButtonGroup>

        <form onSubmit={handleLogin}>
          <TextField
            fullWidth
            label={mode === "employee" ? "Employee ID" : "Username"}
            variant="outlined"
            margin="normal"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />

          {mode === "admin" && (
            <TextField
              fullWidth
              label="Password"
              type="password"
              variant="outlined"
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}

          <Button
            type="submit"
            fullWidth
            disabled={loading}
            sx={{
              mt: 3,
              py: 1.5,
              fontWeight: "bold",
              fontSize: "16px",
              borderRadius: "12px",
              background: "linear-gradient(90deg,#6366F1,#14B8A6)",
              color: "#fff",
              "&:hover": { background: "linear-gradient(90deg,#4f46e5,#0d9488)" },
            }}
          >
            {loading ? <CircularProgress size={26} color="inherit" /> : "Login"}
          </Button>
        </form>

        <Typography variant="caption" display="block" mt={3} color="text.secondary">
          © {new Date().getFullYear()} Employee Monitor
        </Typography>
      </Paper>

      <Snackbar
        open={alert.open}
        autoHideDuration={2200}
        onClose={() => setAlert({ ...alert, open: false })}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity={alert.type} sx={{ width: "100%", fontWeight: "bold" }}>
          {alert.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}


