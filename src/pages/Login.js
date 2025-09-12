// login.js
import React, { useState } from "react";
import {
  Box, Paper, TextField, Button, Typography, Alert, CircularProgress
} from "@mui/material";
import api from "../api";

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login", { identifier, password });
      if (!data?.token || !data?.user) throw new Error("Bad response");
      // ✅ persist token + full user (role included)
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
    <Box minHeight="100dvh" display="grid" placeItems="center" sx={{ p: 2 }}>
      <Paper elevation={6} sx={{ p: 4, width: "100%", maxWidth: 420, borderRadius: 3 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Sign in
        </Typography>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <form onSubmit={onSubmit}>
          <TextField
            label="Email / Username / Emp ID"
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
            sx={{ mt: 2 }}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={18} /> : null}
          >
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Paper>
    </Box>
  );
}



