import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { createAppTheme } from "./theme";

import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import Reports from "./pages/Reports";
import Login from "./pages/Login";

import { getToken, getRole } from "./auth";

function PrivateRoute({ children }) {
  const hasToken = !!getToken();
  return hasToken ? children : <Navigate to="/login" replace />;
}

function RoleRoute({ roles = [], children }) {
  const hasToken = !!getToken();
  const role = getRole();
  if (!hasToken) return <Navigate to="/login" replace />;
  if (roles.length && !roles.includes(role)) return <Navigate to="/employees" replace />;
  return children;
}

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const theme = createAppTheme(darkMode ? "dark" : "light");

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout darkMode={darkMode} setDarkMode={setDarkMode}>
                  <Dashboard />
                </Layout>
              </PrivateRoute>
            }
          />

          <Route
            path="/employees"
            element={
              <PrivateRoute>
                <Layout darkMode={darkMode} setDarkMode={setDarkMode}>
                  <Employees />
                </Layout>
              </PrivateRoute>
            }
          />

          <Route
            path="/reports"
            element={
              <RoleRoute roles={["admin", "superadmin"]}>
                <Layout darkMode={darkMode} setDarkMode={setDarkMode}>
                  <Reports />
                </Layout>
              </RoleRoute>
            }
          />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}
