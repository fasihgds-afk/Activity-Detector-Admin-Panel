// src/pages/Employees.js
import React, { useEffect, useMemo, useState } from "react";
import {
  Paper, Table, TableBody, TableCell, TableHead, TableRow,
  Typography, TextField, Box, TableContainer, Avatar, Chip,
  Collapse, IconButton, Card, CardContent, Tooltip, Grid,
  useTheme, Button, Menu, MenuItem, Select, FormControl, InputLabel,
  ToggleButtonGroup, ToggleButton, Divider
} from "@mui/material";
import { KeyboardArrowDown, KeyboardArrowUp, AccessTime, Download } from "@mui/icons-material";

import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";

import dayjs from "dayjs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import axios from "axios";

// ====== CONFIG ======
const API = process.env.REACT_APP_API_URL || "http://localhost:3000";
const ZONE_LABEL = "Asia/Karachi"; // purely cosmetic in this file
const GENERAL_LIMIT_MIN = 60;
const NAMAZ_LIMIT_MIN = 50;

// ====== GROUPING & RENDERING ======
function groupByShift(sessions, emp) {
  const label = `${emp.shift_start} – ${emp.shift_end}`;
  const groups = {};
  (sessions || []).forEach((s) => {
    const key = `${s.shiftDate} — ${label}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });
  return groups;
}

function EmployeeRow({ emp, sessions, config }) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const grouped = useMemo(() => groupByShift(sessions, emp), [sessions, emp]);

  const generalLimit = config?.generalIdleLimit ?? GENERAL_LIMIT_MIN;

  const categoryColors = {
    Official: "#3b82f6",
    General: "#f59e0b",
    Namaz: "#10b981",
    AutoBreak: "#ef4444",
    Uncategorized: "#9ca3af",
    ...(config?.categoryColors || {}),
  };

  const cardStyle = (bgLight, textColor) => ({
    p: 2,
    borderRadius: 3,
    bgcolor: theme.palette.mode === "dark" ? "background.paper" : bgLight,
    color: theme.palette.mode === "dark" ? theme.palette.text.primary : textColor,
  });

  return (
    <>
      <TableRow hover>
        <TableCell>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: "#6366F1", fontWeight: 600 }}>
              {emp.name?.charAt(0) || "?"}
            </Avatar>
            <Box>
              <Typography fontWeight={600}>{emp.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                ID: {emp.id}
              </Typography>
            </Box>
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

      <TableRow>
        <TableCell colSpan={5} sx={{ p: 0, bgcolor: theme.palette.background.default }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box m={2}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                Idle Sessions & AutoBreaks
              </Typography>

              {Object.keys(grouped).length > 0 ? (
                Object.entries(grouped).map(([shiftKey, list]) => {
                  const totals = list.reduce(
                    (acc, s) => {
                      const d = Number(s.duration) || 0;
                      acc.total += d;
                      if (s.category === "Official") acc.official += d;
                      if (s.category === "General") acc.general += d;
                      if (s.category === "Namaz") acc.namaz += d;
                      if (s.category === "AutoBreak") acc.autobreak += d;
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
                            mb: 2, color: "#fff", bgcolor: "#6366F1",
                            p: 1, borderRadius: 2, display: "inline-block",
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
                            {list.map((s, idx) => {
                              const color = categoryColors[s.category] || categoryColors.Uncategorized;
                              return (
                                <TableRow key={idx}>
                                  <TableCell>
                                    <Chip
                                      label={s.category || "Uncategorized"}
                                      size="small"
                                      sx={{ fontWeight: 600, color: "#fff", bgcolor: color }}
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

                        <Box mt={2}>
                          <Grid container spacing={2}>
                            <Grid item xs={12} md={3}>
                              <Card sx={cardStyle("#fff7ed", "warning.main")}>
                                <Typography fontWeight={700} color="warning.main">Total Time</Typography>
                                <Typography variant="h6" fontWeight={800}>{totals.total} min</Typography>
                              </Card>
                            </Grid>
                            <Grid item xs={12} md={3}>
                              <Card sx={cardStyle("#eff6ff", "primary.main")}>
                                <Typography fontWeight={700} color="primary.main">Official Break Time</Typography>
                                <Typography variant="h6" fontWeight={800}>{totals.official} min</Typography>
                              </Card>
                            </Grid>
                            <Grid item xs={12} md={3}>
                              <Card sx={cardStyle("#ecfdf5", "success.main")}>
                                <Typography fontWeight={700} color="success.main">Namaz Break Time</Typography>
                                <Typography variant="h6" fontWeight={800}>{totals.namaz} min</Typography>
                              </Card>
                            </Grid>
                            <Grid item xs={12} md={3}>
                              <Card
                                sx={{
                                  p: 2, borderRadius: 3,
                                  bgcolor: totals.general > generalLimit
                                    ? theme.palette.error.light
                                    : theme.palette.success.light,
                                  color: theme.palette.getContrastText(
                                    totals.general > generalLimit
                                      ? theme.palette.error.light
                                      : theme.palette.success.light
                                  ),
                                }}
                              >
                                <Typography fontWeight={700}>General Break Time</Typography>
                                <Typography variant="h6" fontWeight={800}>{totals.general} min</Typography>
                              </Card>
                            </Grid>
                            <Grid item xs={12} md={3}>
                              <Card sx={cardStyle("#fee2e2", "error.main")}>
                                <Typography fontWeight={700} color="error.main">AutoBreak Time</Typography>
                                <Typography variant="h6" fontWeight={800}>{totals.autobreak} min</Typography>
                              </Card>
                            </Grid>
                          </Grid>
                        </Box>
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <Typography>No sessions found for selected date range</Typography>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

// ====== MAIN SCREEN ======
export default function Employees() {
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState([]);
  const [config, setConfig] = useState({});
  const [selectedEmp, setSelectedEmp] = useState("all");

  // date mode & range
  const [mode, setMode] = useState("day"); // 'day' | 'month' | 'custom'
  const [dayDate, setDayDate] = useState(dayjs());
  const [monthDate, setMonthDate] = useState(dayjs());
  const [customStart, setCustomStart] = useState(dayjs().startOf("day"));
  const [customEnd, setCustomEnd] = useState(dayjs().endOf("day"));

  // download menu
  const [anchorEl, setAnchorEl] = useState(null);
  const menuOpen = Boolean(anchorEl);

  // Fetch data
  const fetchEmployees = () => {
    axios
      .get(`${API}/employees`, { timeout: 15000 })
      .then((res) => setEmployees(Array.isArray(res.data) ? res.data : res.data.employees || []))
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

  // Compute active date range
  const activeRange = useMemo(() => {
    if (mode === "day") {
      const start = dayDate.startOf("day");
      const end = dayDate.endOf("day");
      return [start, end];
    }
    if (mode === "month") {
      const start = monthDate.startOf("month");
      const end = monthDate.endOf("month");
      return [start, end];
    }
    // custom
    return [customStart.startOf("day"), customEnd.endOf("day")];
  }, [mode, dayDate, monthDate, customStart, customEnd]);

  // Helpers
  const inRange = (iso) => {
    if (!iso) return false;
    const t = dayjs(iso).valueOf();
    return t >= activeRange[0].valueOf() && t <= activeRange[1].valueOf();
    // (comparisons in local time are fine because both sides are unix ms)
  };

  const filteredBySearchAndPick = useMemo(() => {
    const pool = Array.isArray(employees) ? employees : [];
    const withPick = selectedEmp === "all" ? pool : pool.filter((e) => e.id === selectedEmp);
    return withPick.filter((emp) =>
      emp.name?.toLowerCase().includes(search.toLowerCase())
    );
  }, [employees, search, selectedEmp]);

  // Build sessions filtered by date range
  const sessionsForEmp = (emp) => (emp.idle_sessions || []).filter((s) => inRange(s.idle_start));

  // ====== REPORT GENERATION ======
  const computeTotals = (emp, list) => {
    const sums = list.reduce(
      (acc, s) => {
        const d = Number(s.duration) || 0;
        acc.total += d;
        if (s.category === "General") acc.general += d;
        if (s.category === "Namaz") acc.namaz += d;
        if (s.category === "Official") acc.official += d;
        if (s.category === "AutoBreak") acc.autobreak += d;
        return acc;
      },
      { total: 0, general: 0, namaz: 0, official: 0, autobreak: 0 }
    );
    return {
      id: emp.id,
      name: emp.name,
      department: emp.department,
      ...sums,
      exceedGeneral: Math.max(0, sums.general - GENERAL_LIMIT_MIN),
      exceedNamaz: Math.max(0, sums.namaz - NAMAZ_LIMIT_MIN),
    };
  };

  const buildReportRows = () => {
    const rows = filteredBySearchAndPick.map((emp) => {
      const list = sessionsForEmp(emp);
      return computeTotals(emp, list);
    });
    return rows;
  };

  const rangeLabel = useMemo(() => {
    const [s, e] = activeRange;
    const fmt = (d) => d.format("YYYY-MM-DD");
    if (mode === "day") return fmt(s);
    if (mode === "month") return s.format("YYYY-MM");
    return `${fmt(s)} → ${fmt(e)}`;
  }, [activeRange, mode]);

  // CSV
  const downloadCSV = () => {
    const rows = buildReportRows();
    const headers = [
      "Employee ID",
      "Name",
      "Department",
      "Total Idle (min)",
      "General (min)",
      "Namaz (min)",
      "Official (min)",
      "AutoBreak (min)",
      "General Limit (60) Exceeded (min)",
      "Namaz Limit (50) Exceeded (min)",
    ];
    const body = rows.map((r) => [
      r.id,
      r.name,
      r.department,
      r.total,
      r.general,
      r.namaz,
      r.official,
      r.autobreak,
      r.exceedGeneral,
      r.exceedNamaz,
    ]);

    const csv = [headers, ...body].map((arr) => arr.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `employee_report_${rangeLabel}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // PDF
  const downloadPDF = () => {
    const rows = buildReportRows();
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    doc.setFontSize(14);
    doc.text(`Employee Idle Report (${rangeLabel})`, 40, 40);
    doc.setFontSize(10);
    doc.text(`Timezone: ${ZONE_LABEL}`, 40, 58);
    doc.text(
      `Limits — General: ${GENERAL_LIMIT_MIN} min/day, Namaz: ${NAMAZ_LIMIT_MIN} min/day`,
      40, 72
    );

    const head = [[
      "Emp ID", "Name", "Department",
      "Total", "General", "Namaz", "Official", "AutoBreak",
      "Gen Exceed", "Namaz Exceed"
    ]];

    const body = rows.map((r) => [
      r.id, r.name, r.department,
      r.total, r.general, r.namaz, r.official, r.autobreak,
      r.exceedGeneral ? `${r.exceedGeneral}` : "0",
      r.exceedNamaz ? `${r.exceedNamaz}` : "0",
    ]);

    autoTable(doc, {
      startY: 90,
      head,
      body,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [99, 102, 241] }, // indigo
    });

    doc.save(`employee_report_${rangeLabel}.pdf`);
  };

  // ====== RENDER ======
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box p={4}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box>
            <Typography variant="h4" fontWeight={700}>Employees</Typography>
            <Typography variant="body2" color="text.secondary">
              View sessions and download daily / monthly / custom reports
            </Typography>
          </Box>

          <Box>
            <Button
              variant="contained"
              startIcon={<Download />}
              onClick={(e) => setAnchorEl(e.currentTarget)}
            >
              Download Report
            </Button>
            <Menu anchorEl={anchorEl} open={menuOpen} onClose={() => setAnchorEl(null)}>
              <MenuItem onClick={() => { setAnchorEl(null); downloadCSV(); }}>CSV</MenuItem>
              <MenuItem onClick={() => { setAnchorEl(null); downloadPDF(); }}>PDF</MenuItem>
            </Menu>
          </Box>
        </Box>

        {/* Controls */}
        <Card sx={{ p: 2, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <TextField
                placeholder="🔍 Search Employee..."
                variant="outlined"
                fullWidth
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Grid>

            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Employee</InputLabel>
                <Select
                  label="Employee"
                  value={selectedEmp}
                  onChange={(e) => setSelectedEmp(e.target.value)}
                >
                  <MenuItem value="all">All Employees</MenuItem>
                  {employees.map((e) => (
                    <MenuItem key={e.id} value={e.id}>
                      {e.name} — {e.department}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
                <ToggleButtonGroup
                  value={mode}
                  exclusive
                  onChange={(_, val) => val && setMode(val)}
                  size="small"
                >
                  <ToggleButton value="day">Today / Day</ToggleButton>
                  <ToggleButton value="month">This Month</ToggleButton>
                  <ToggleButton value="custom">Custom</ToggleButton>
                </ToggleButtonGroup>

                {mode === "day" && (
                  <DatePicker
                    label="Pick a day"
                    value={dayDate}
                    onChange={(v) => v && setDayDate(v)}
                  />
                )}

                {mode === "month" && (
                  <DatePicker
                    label="Pick a month"
                    views={["year", "month"]}
                    value={monthDate}
                    onChange={(v) => v && setMonthDate(v)}
                  />
                )}

                {mode === "custom" && (
                  <>
                    <DatePicker
                      label="Start date"
                      value={customStart}
                      onChange={(v) => v && setCustomStart(v)}
                    />
                    <DatePicker
                      label="End date"
                      value={customEnd}
                      onChange={(v) => v && setCustomEnd(v)}
                    />
                  </>
                )}
              </Box>
            </Grid>
          </Grid>

          <Divider sx={{ mt: 2 }} />
          <Box mt={2} display="flex" alignItems="center" gap={2} flexWrap="wrap">
            <Chip
              color="info"
              label={`Range: ${
                mode === "day"
                  ? activeRange[0].format("YYYY-MM-DD")
                  : mode === "month"
                  ? activeRange[0].format("YYYY-MM")
                  : `${activeRange[0].format("YYYY-MM-DD")} → ${activeRange[1].format("YYYY-MM-DD")}`
              }`}
            />
            <Chip label={`General limit: ${GENERAL_LIMIT_MIN} min/day`} />
            <Chip label={`Namaz limit: ${NAMAZ_LIMIT_MIN} min/day`} />
          </Box>
        </Card>

        {/* Employees table */}
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
              {filteredBySearchAndPick.map((emp) => (
                <EmployeeRow
                  key={emp.id}
                  emp={emp}
                  sessions={sessionsForEmp(emp)}
                  config={config}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </LocalizationProvider>
  );
}
