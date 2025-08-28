import React, { useEffect, useMemo, useState } from "react";
import {
  Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography,
  TextField, Box, TableContainer, Avatar, Chip, Collapse, IconButton,
  Card, CardContent, Tooltip, Grid, Button, Menu, MenuItem, Select, MenuItem as MItem
} from "@mui/material";
import { KeyboardArrowDown, KeyboardArrowUp, AccessTime, Download } from "@mui/icons-material";
import axios from "axios";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// -------- base API
const API = process.env.REACT_APP_API_URL || "http://localhost:3000";

// -------- small helpers (no deps)

// yyyy-mm-dd for today (browser local)
const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// get Karachi date "YYYY-MM-DD"
function khiYmd(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
// get Karachi hour 0..23
function khiHour(date) {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return parseInt(h, 10);
}
// previous day of a YYYY-MM-DD string
function prevYmd(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// compute the "shift day" used by your night shifts
// rule: any timestamp with Karachi hour < 6 belongs to the previous day
function shiftDayOfSession(session) {
  // prefer backend-provided shiftDate if present
  if (session.shiftDate) return session.shiftDate;

  // otherwise compute from ISO start time (idle_start / break_start etc.)
  const iso = session.idle_start || session.break_start || session.start || session.timestamp;
  if (!iso) return null;

  const d = new Date(iso);
  const ymd = khiYmd(d);
  const h = khiHour(d);
  return h < 6 ? prevYmd(ymd) : ymd;
}

// filter by day/range using the computed "shift day"
function sessionInPickedRange(session, mode, day, from, to) {
  const sd = shiftDayOfSession(session);
  if (!sd) return false;
  if (mode === "day") return sd === day;
  if (!from || !to) return true;
  return sd >= from && sd <= to;
}

function calcTotals(sessions) {
  const t = { total: 0, general: 0, namaz: 0, official: 0, autobreak: 0 };
  for (const s of sessions) {
    const d = Number(s.duration) || 0;
    t.total += d;
    if (s.category === "General") t.general += d;
    else if (s.category === "Namaz") t.namaz += d;
    else if (s.category === "Official") t.official += d;
    else if (s.category === "AutoBreak") t.autobreak += d;
  }
  return t;
}

//— build a colorful XLS (HTML table) with no extra deps
function downloadXls(filename, headers, rows) {
  const headerHtml = headers
    .map(
      (h) =>
        `<th style="background:#6366F1;color:#fff;padding:8px;border:1px solid #e5e7eb;text-align:center">${h}</th>`
    )
    .join("");

  const rowHtml = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c, i) => {
            const base = "padding:6px;border:1px solid #e5e7eb;text-align:center";
            let bg = "";
            if (i === 7) bg = "background:#FEF3C7;"; // AutoBreak col light amber
            if (i === 8 || i === 9) bg = "background:#FEE2E2;"; // exceed cols light red
            return `<td style="${base};${bg}">${String(c)}</td>`;
          })
          .join("")}</tr>`
    )
    .join("");

  const html = `
    <html><head><meta charset="utf-8" />
    <style>table{border-collapse:collapse;font-family:Segoe UI,Arial;font-size:12px}</style>
    </head><body>
      <table>
        <thead><tr>${headerHtml}</tr></thead>
        <tbody>${rowHtml}</tbody>
      </table>
    </body></html>
  `;
  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// -------------------------
// Employee Row
// -------------------------
function EmployeeRow({ emp, dayMode, pickedDay, from, to, generalLimit, namazLimit }) {
  const [open, setOpen] = useState(false);
  const all = Array.isArray(emp.idle_sessions) ? emp.idle_sessions : [];

  // group by computed shift day, but show the employee’s own shift label
  const grouped = useMemo(() => {
    const map = {};
    for (const s of all) {
      if (!sessionInPickedRange(s, dayMode, pickedDay, from, to)) continue;

      const sd = shiftDayOfSession(s); // "YYYY-MM-DD" (night-shift aware)
      const label = `${sd} — ${emp.shift_start} – ${emp.shift_end}`;
      if (!map[label]) map[label] = [];
      map[label].push(s);
    }
    return map;
  }, [all, emp.shift_start, emp.shift_end, dayMode, pickedDay, from, to]);

  return (
    <>
      <TableRow hover>
        <TableCell>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: "#6366F1", fontWeight: 600 }}>
              {emp.name?.charAt(0) || "?"}
            </Avatar>
            <Box>
              <Typography fontWeight={700}>{emp.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                ID: {emp.emp_id || emp.id}
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
            label={emp.latest_status || "Unknown"}
            color={emp.latest_status === "Active" ? "success" : "warning"}
            variant="filled"
            sx={{ fontWeight: 600 }}
          />
        </TableCell>
        <TableCell align="center">
          <Tooltip title="Show Sessions">
            <IconButton onClick={() => setOpen((x) => !x)}>
              {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
            </IconButton>
          </Tooltip>
        </TableCell>
      </TableRow>

      <TableRow>
        <TableCell colSpan={5} sx={{ p: 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box m={2}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                Idle Sessions & AutoBreaks
              </Typography>

              {Object.keys(grouped).length === 0 && (
                <Typography color="text.secondary">No sessions in this date range.</Typography>
              )}

              {Object.entries(grouped).map(([key, sessions]) => {
                const sums = calcTotals(sessions);
                return (
                  <Card key={key} sx={{ mb: 3, borderRadius: 3, boxShadow: 3 }}>
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
                        {key}
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
                          {sessions.map((s, i) => (
                            <TableRow key={i}>
                              <TableCell>
                                <Chip
                                  label={s.category || "Uncategorized"}
                                  size="small"
                                  sx={{
                                    fontWeight: 600,
                                    color: "#fff",
                                    bgcolor:
                                      s.category === "Official"
                                        ? "#3b82f6"
                                        : s.category === "General"
                                        ? "#f59e0b"
                                        : s.category === "Namaz"
                                        ? "#10b981"
                                        : s.category === "AutoBreak"
                                        ? "#ef4444"
                                        : "#9ca3af",
                                  }}
                                />
                              </TableCell>
                              <TableCell>{s.start_time_local || "-"}</TableCell>
                              <TableCell>{s.end_time_local || "Ongoing"}</TableCell>
                              <TableCell>{s.reason || "-"}</TableCell>
                              <TableCell>{s.duration ?? 0} min</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      <Box mt={2}>
                        <Grid container spacing={2}>
                          <Grid item xs={12} md={3}>
                            <Card sx={{ p: 2, borderRadius: 3, bgcolor: "#fff7ed" }}>
                              <Typography fontWeight={700} color="warning.main">
                                Total Time
                              </Typography>
                              <Typography variant="h6" fontWeight={800}>
                                {sums.total} min
                              </Typography>
                            </Card>
                          </Grid>
                          <Grid item xs={12} md={3}>
                            <Card sx={{ p: 2, borderRadius: 3, bgcolor: "#eff6ff" }}>
                              <Typography fontWeight={700} color="primary.main">
                                Official Break Time
                              </Typography>
                              <Typography variant="h6" fontWeight={800}>
                                {sums.official} min
                              </Typography>
                            </Card>
                          </Grid>
                          <Grid item xs={12} md={3}>
                            <Card sx={{ p: 2, borderRadius: 3, bgcolor: "#ecfdf5" }}>
                              <Typography fontWeight={700} color="success.main">
                                Namaz Break Time
                              </Typography>
                              <Typography variant="h6" fontWeight={800}>
                                {sums.namaz} min{" "}
                                {sums.namaz > namazLimit ? ` (Exceeded by ${sums.namaz - namazLimit})` : ""}
                              </Typography>
                            </Card>
                          </Grid>
                          <Grid item xs={12} md={3}>
                            <Card
                              sx={{
                                p: 2,
                                borderRadius: 3,
                                bgcolor: sums.general > generalLimit ? "#fecaca" : "#e9ffe9",
                              }}
                            >
                              <Typography fontWeight={700}>General Break Time</Typography>
                              <Typography variant="h6" fontWeight={800}>
                                {sums.general} min{" "}
                                {sums.general > generalLimit ? ` (Exceeded by ${sums.general - generalLimit})` : ""}
                              </Typography>
                            </Card>
                          </Grid>
                          <Grid item xs={12} md={3}>
                            <Card sx={{ p: 2, borderRadius: 3, bgcolor: "#fee2e2" }}>
                              <Typography fontWeight={700} color="error.main">
                                AutoBreak Time
                              </Typography>
                              <Typography variant="h6" fontWeight={800}>
                                {sums.autobreak} min
                              </Typography>
                            </Card>
                          </Grid>
                        </Grid>
                      </Box>
                    </CardContent>
                  </Card>
                );
              })}
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
  const [config, setConfig] = useState({ generalIdleLimit: 60 });
  const [employeeFilter, setEmployeeFilter] = useState("all");

  // date controls (no extra libs)
  const [mode, setMode] = useState("day"); // 'day' | 'range'
  const [day, setDay] = useState(todayStr());
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());

  // menu for downloads
  const [anchorEl, setAnchorEl] = useState(null);
  const openMenu = Boolean(anchorEl);

  const fetchEmployees = async () => {
    try {
      const res = await axios.get(`${API}/employees`, { timeout: 20000 });
      const arr = Array.isArray(res.data) ? res.data : res.data.employees || [];
      setEmployees(arr);
      if (res.data?.settings?.general_idle_limit) {
        setConfig((c) => ({ ...c, generalIdleLimit: res.data.settings.general_idle_limit }));
      }
    } catch (e) {
      console.error("Error fetching employees:", e);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await axios.get(`${API}/config`, { timeout: 15000 });
      setConfig((c) => ({ ...c, ...(res.data || {}) }));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchConfig();
    const interval = setInterval(fetchEmployees, 60000);
    return () => clearInterval(interval);
  }, []);

  // filtered employees
  const filtered = useMemo(() => {
    let list = Array.isArray(employees) ? employees : [];
    if (employeeFilter !== "all") list = list.filter((e) => e._id === employeeFilter || e.id === employeeFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((e) => e.name?.toLowerCase().includes(s));
    }
    return list;
  }, [employees, employeeFilter, search]);

  // ------- report rows use shift-day aware filtering
  function collectReportRows() {
    const rows = [];
    for (const emp of filtered) {
      const sessions = (emp.idle_sessions || []).filter((s) =>
        sessionInPickedRange(s, mode, day, from, to)
      );
      const sums = calcTotals(sessions);
      const genEx = Math.max(0, sums.general - (config.generalIdleLimit || 60));
      const namEx = Math.max(0, sums.namaz - (config.namazLimit || 50));
      rows.push([
        emp.emp_id || emp.id || emp._id,
        emp.name || "-",
        emp.department || "-",
        Number(sums.total.toFixed(1)),
        sums.general,
        sums.namaz,
        sums.official,
        Number(sums.autobreak.toFixed(1)),
        genEx,
        namEx,
      ]);
    }
    return rows;
  }

  function downloadCSV() {
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
    const body = collectReportRows();
    const csv = [headers, ...body]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const label = mode === "day" ? day : `${from}_to_${to}`;
    a.download = `employee_idle_report_${label}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function downloadPDF() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const label = mode === "day" ? day : `${from} → ${to}`;

    doc.setFontSize(16);
    doc.setTextColor("#111827");
    doc.text(`Employee Idle Report (${label})`, 40, 40);

    doc.setFontSize(10);
    doc.setTextColor("#374151");
    doc.text(`Timezone: Asia/Karachi`, 40, 58);
    doc.text(
      `Limits — General: ${config.generalIdleLimit || 60} min/day, Namaz: ${
        config.namazLimit || 50
      } min/day`,
      40,
      73
    );

    const headers = [
      "Emp ID",
      "Name",
      "Department",
      "Total",
      "General",
      "Namaz",
      "Official",
      "AutoBreak",
      "Gen Exceed",
      "Namaz Exceed",
    ];
    const body = collectReportRows();

    autoTable(doc, {
      head: [headers],
      body,
      startY: 90,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [99, 102, 241], textColor: 255, halign: "center" },
      columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 120 }, 2: { cellWidth: 95 } },
    });

    const file = mode === "day" ? day : `${from}_${to}`;
    doc.save(`employee_idle_report_${file}.pdf`);
  }

  function downloadXLS() {
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
    const rows = collectReportRows();
    const label = mode === "day" ? day : `${from}_to_${to}`;
    downloadXls(`employee_idle_report_${label}.xls`, headers, rows);
  }

  const limitsNote = `General limit: ${config.generalIdleLimit || 60}m/day   Namaz limit: ${
    config.namazLimit || 50
  }m/day`;

  return (
    <Box p={3}>
      <Box display="flex" alignItems="center" flexWrap="wrap" gap={2} mb={1}>
        <TextField
          placeholder="🔍 Search Employees…"
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 260 }}
        />

        <Select
          size="small"
          value={employeeFilter}
          onChange={(e) => setEmployeeFilter(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MItem value="all">All Employees</MItem>
          {employees.map((e) => (
            <MItem key={e.id || e._id} value={e.id || e._id}>
              {e.name}
            </MItem>
          ))}
        </Select>

        <Select size="small" value={mode} onChange={(e) => setMode(e.target.value)}>
          <MItem value="day">TODAY / DAY</MItem>
          <MItem value="range">CUSTOM RANGE</MItem>
        </Select>

        {mode === "day" ? (
          <TextField
            label="Pick a day"
            type="date"
            size="small"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        ) : (
          <>
            <TextField
              label="From"
              type="date"
              size="small"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="To"
              type="date"
              size="small"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </>
        )}

        <Box flex={1} />

        <Button variant="contained" startIcon={<Download />} onClick={(e) => setAnchorEl(e.currentTarget)}>
          Download Report
        </Button>
        <Menu anchorEl={anchorEl} open={openMenu} onClose={() => setAnchorEl(null)}>
          <MenuItem
            onClick={() => {
              setAnchorEl(null);
              downloadCSV();
            }}
          >
            CSV
          </MenuItem>
          <MenuItem
            onClick={() => {
              setAnchorEl(null);
              downloadPDF();
            }}
          >
            PDF
          </MenuItem>
          <MenuItem
            onClick={() => {
              setAnchorEl(null);
              downloadXLS();
            }}
          >
            Excel (.xls, colored)
          </MenuItem>
        </Menu>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        Range: {mode === "day" ? day : `${from} → ${to}`} &nbsp; | &nbsp; {limitsNote}
      </Typography>

      <TableContainer component={Paper} elevation={5} sx={{ borderRadius: "18px" }}>
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
              <EmployeeRow
                key={emp.id || emp._id}
                emp={emp}
                dayMode={mode}
                pickedDay={day}
                from={from}
                to={to}
                generalLimit={config.generalIdleLimit || 60}
                namazLimit={config.namazLimit || 50}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
