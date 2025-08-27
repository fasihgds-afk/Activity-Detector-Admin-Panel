import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Avatar,
  Snackbar,
  Alert,
  CircularProgress,
} from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ open: false, type: "success", msg: "" });
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    setLoading(true);

    // Fake delay for realism (like API request)
    setTimeout(() => {
      if (username === "admin" && password === "admin") {
        setAlert({ open: true, type: "success", msg: "✅ Login Successful!" });
        localStorage.setItem("auth", "true");

        // Redirect after short success animation
        setTimeout(() => {
          navigate("/");
        }, 1500);
      } else {
        setAlert({ open: true, type: "error", msg: "❌ Invalid credentials!" });
      }
      setLoading(false);
    }, 1200);
  };

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg,#6366F1,#14B8A6)",
      }}
    >
      <Paper
        elevation={12}
        sx={{
          p: 6,
          width: 380,
          borderRadius: "20px",
          textAlign: "center",
          backdropFilter: "blur(10px)",
          background: "rgba(255,255,255,0.9)",
        }}
      >
        {/* 🔐 Logo Circle */}
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

        {/* Title */}
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          Admin Panel Login
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          Sign in with your admin credentials
        </Typography>

        {/* Form */}
        <form onSubmit={handleLogin}>
          <TextField
            fullWidth
            label="Username"
            variant="outlined"
            margin="normal"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            variant="outlined"
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

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
              transition: "0.3s",
              "&:hover": {
                background: "linear-gradient(90deg,#4f46e5,#0d9488)",
                transform: !loading ? "scale(1.05)" : "none",
              },
            }}
          >
            {loading ? <CircularProgress size={26} color="inherit" /> : "Login"}
          </Button>
        </form>

        {/* Footer */}
        <Typography
          variant="caption"
          display="block"
          mt={3}
          color="text.secondary"
        >
          © {new Date().getFullYear()} Employee Monitor
        </Typography>
      </Paper>

      {/* ✅ Snackbar Notification */}
      <Snackbar
        open={alert.open}
        autoHideDuration={2000}
        onClose={() => setAlert({ ...alert, open: false })}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          severity={alert.type}
          sx={{ width: "100%", fontWeight: "bold" }}
        >
          {alert.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
