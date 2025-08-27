import React, { useEffect, useState } from "react";
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  TextField,
  Box,
  TableContainer,
  Avatar,
  Chip,
  Collapse,
  IconButton,
  Card,
  CardContent,
  Tooltip,
  Grid,
  useTheme,
} from "@mui/material";
import {
  KeyboardArrowDown,
  KeyboardArrowUp,
  AccessTime,
} from "@mui/icons-material";
import axios from "axios";

// 🔧 Base API URL (set REACT_APP_API_URL in Netlify; falls back to local dev)
const API = process.env.REACT_APP_API_URL || "http://localhost:3000";

// -------------------------
// Group by Shift
// -------------------------
function groupByShift(sessions) {
  const groups = {};
  sessions.forEach((s) => {
    const key = `${s.shiftDate} — ${s.shiftLabel}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });
  return groups;
}

// -------------------------
// Employee Row Component
// -------------------------
function EmployeeRow({ emp, config }) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();

  // 🔹 Merge idle + auto breaks into one array
  const allSessions = [
    ...(emp.idle_sessions || []),
    ...(emp.auto_breaks || []).map((ab) => ({
      category: "AutoBreak",
      reason: "System Power Off / Startup",
      start_time_local: ab.break_start_local,
      end_time_local: ab.break_end_local,
      duration: ab.duration_minutes,
      shiftDate: ab.shiftDate,
      shiftLabel: ab.shiftLabel,
    })),
  ];

  // 🔹 Group ALL sessions by shift
  const groupedSessions = groupByShift(allSessions);

  const generalLimit = config?.generalIdleLimit || 60;

  // --- Category colors
  const categoryColors = {
    Official: "#3b82f6",
    General: "#f59e0b",
    Namaz: "#10b981",
    AutoBreak: "#ef4444",
    Uncategorized: "#9ca3af",
    ...(config?.categoryColors || {}),
  };

  // --- Card styles
  const cardStyle = (bgLight, textColor) => ({
    p: 2,
    borderRadius: 3,
    bgcolor: theme.palette.mode === "dark" ? "background.paper" : bgLight,
    color:
      theme.palette.mode === "dark"
        ? theme.palette.text.primary
        : textColor,
  });

  return (
    <>
      <TableRow hover>
        <TableCell>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: "#6366F1", fontWeight: 600 }}>
              {emp.name.charAt(0)}
            </Avatar>
            <Typography fontWeight={600}>{emp.name}</Typography>
          </Box>
        </TableCell>
        <TableCell>{emp.department}</TableCell>
        <TableCell>
          <Chip
            icon={<AccessTime />}
            label={`${emp.shift_start} - ${emp.shift_end}`}
            color="primary"
            variant="outlined"
          />
        </TableCell>
        <TableCell>
          <Chip
            label={emp.latest_status}
            color={emp.latest_status === "Active" ? "success" : "warning"}
            variant="filled"
            sx={{ fontWeight: 600 }}
          />
        </TableCell>
        <TableCell align="center">
          <Tooltip title="Show Sessions">
            <IconButton onClick={() => setOpen(!open)}>
              {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
            </IconButton>
          </Tooltip>
        </TableCell>
      </TableRow>

      {/* Expanded Details */}
      <TableRow>
        <TableCell colSpan={5} sx={{ p: 0, bgcolor: theme.palette.background.default }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box m={2}>
              {/* Idle + AutoBreak Sessions */}
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                Idle Sessions & AutoBreaks
              </Typography>
              {Object.keys(groupedSessions).length > 0 ? (
                Object.entries(groupedSessions).map(([shiftKey, sessions]) => {
                  // Totals
                  const shiftTotals = sessions.reduce(
                    (acc, s) => {
                      acc.total += Number(s.duration) || 0;
                      if (s.category === "Official") acc.official += Number(s.duration) || 0;
                      if (s.category === "General") acc.general += Number(s.duration) || 0;
                      if (s.category === "Namaz") acc.namaz += Number(s.duration) || 0;
                      if (s.category === "AutoBreak") acc.autobreak += Number(s.duration) || 0;
                      return acc;
                    },
                    { total: 0, official: 0, general: 0, namaz: 0, autobreak: 0 }
                  );

                  return (
                    <Card key={shiftKey} sx={{ mb: 3, borderRadius: 3, boxShadow: 3 }}>
                      <CardContent>
                        <Typography
                          variant="subtitle1"
                          fontWeight={700}
                          sx={{
                            mb: 2,
                            color: "#fff",
                            bgcolor: "#6366F1",
                            p: 1,
                            borderRadius: 2,
                            display: "inline-block",
                          }}
                        >
                          {shiftKey}
                        </Typography>

                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Category</TableCell>
                              <TableCell>Start Time</TableCell>
                              <TableCell>End Time</TableCell>
                              <TableCell>Reason</TableCell>
                              <TableCell>Duration (min)</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {sessions.map((s, idx) => {
                              const color = categoryColors[s.category] || categoryColors.Uncategorized;
                              return (
                                <TableRow key={idx}>
                                  <TableCell>
                                    <Chip
                                      label={s.category || "Uncategorized"}
                                      size="small"
                                      sx={{
                                        fontWeight: 600,
                                        color: "#fff",
                                        bgcolor: color,
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>{s.start_time_local || "N/A"}</TableCell>
                                  <TableCell>{s.end_time_local || "Ongoing"}</TableCell>
                                  <TableCell>{s.reason || "-"}</TableCell>
                                  <TableCell>{s.duration} min</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>

                        {/* Totals */}
                        <Box mt={2}>
                          <Grid container spacing={2}>
                            <Grid item xs={12} md={3}>
                              <Card sx={cardStyle("#fff7ed", "warning.main")}>
                                <Typography fontWeight={700} color="warning.main">
                                  Total Time
                                </Typography>
                                <Typography variant="h6" fontWeight={800}>
                                  {shiftTotals.total} min
                                </Typography>
                              </Card>
                            </Grid>
                            <Grid item xs={12} md={3}>
                              <Card sx={cardStyle("#eff6ff", "primary.main")}>
                                <Typography fontWeight={700} color="primary.main">
                                  Official Break Time
                                </Typography>
                                <Typography variant="h6" fontWeight={800}>
                                  {shiftTotals.official} min
                                </Typography>
                              </Card>
                            </Grid>
                            <Grid item xs={12} md={3}>
                              <Card sx={cardStyle("#ecfdf5", "success.main")}>
                                <Typography fontWeight={700} color="success.main">
                                  Namaz Break Time
                                </Typography>
                                <Typography variant="h6" fontWeight={800}>
                                  {shiftTotals.namaz} min
                                </Typography>
                              </Card>
                            </Grid>
                            <Grid item xs={12} md={3}>
                              <Card
                                sx={{
                                  p: 2,
                                  borderRadius: 3,
                                  bgcolor:
                                    shiftTotals.general > generalLimit
                                      ? theme.palette.error.light
                                      : theme.palette.success.light,
                                  color: theme.palette.getContrastText(
                                    shiftTotals.general > generalLimit
                                      ? theme.palette.error.light
                                      : theme.palette.success.light
                                  ),
                                }}
                              >
                                <Typography fontWeight={700}>General Break Time</Typography>
                                <Typography variant="h6" fontWeight={800}>
                                  {shiftTotals.general} min
                                </Typography>
                              </Card>
                            </Grid>
                            <Grid item xs={12} md={3}>
                              <Card sx={cardStyle("#fee2e2", "error.main")}>
                                <Typography fontWeight={700} color="error.main">
                                  AutoBreak Time
                                </Typography>
                                <Typography variant="h6" fontWeight={800}>
                                  {shiftTotals.autobreak} min
                                </Typography>
                              </Card>
                            </Grid>
                          </Grid>
                        </Box>
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <Typography>No sessions found</Typography>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

// -------------------------
// Main Component
// -------------------------
export default function Employees() {
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState([]);
  const [config, setConfig] = useState({});

  const fetchEmployees = () => {
    axios
      .get(`${API}/employees`, { timeout: 15000 })
      .then((res) => {
        setEmployees(Array.isArray(res.data) ? res.data : res.data.employees || []);
      })
      .catch((err) => console.error("Error fetching employees:", err));
  };

  const fetchConfig = () => {
    axios
      .get(`${API}/config`, { timeout: 15000 })
      .then((res) => setConfig(res.data))
      .catch((err) => console.error("Error fetching config:", err));
  };

  useEffect(() => {
    fetchEmployees();
    fetchConfig();
    const interval = setInterval(fetchEmployees, 60000);
    return () => clearInterval(interval);
  }, []);

  const filtered = Array.isArray(employees)
    ? employees.filter((emp) =>
        emp.name?.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  return (
    <Box p={4}>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Employees
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Manage employee details, idle sessions & auto breaks grouped by shift
      </Typography>

      <TextField
        placeholder="🔍 Search Employee..."
        variant="outlined"
        fullWidth
        sx={{ mb: 3, bgcolor: "background.paper", borderRadius: 2 }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <TableContainer component={Paper} elevation={5} sx={{ borderRadius: "20px" }}>
        <Table>
          <TableHead>
            <TableRow sx={{ background: "linear-gradient(90deg,#6366F1,#14B8A6)" }}>
              <TableCell sx={{ color: "#fff", fontWeight: 600 }}>Name</TableCell>
              <TableCell sx={{ color: "#fff", fontWeight: 600 }}>Department</TableCell>
              <TableCell sx={{ color: "#fff", fontWeight: 600 }}>Shift</TableCell>
              <TableCell sx={{ color: "#fff", fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ color: "#fff", fontWeight: 600 }} align="center">
                Sessions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((emp) => (
              <EmployeeRow key={emp.id} emp={emp} config={config} />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
