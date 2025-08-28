// src/pages/Employees.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Grid,
  Card,
  CardContent,
  Typography,
  TextField,
  Select,
  MenuItem,
  Chip,
  Button,
  IconButton,
  Divider,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  Collapse,
  Avatar,
  Menu,
} from "@mui/material";
import {
  KeyboardArrowDown,
  KeyboardArrowUp,
  AccessTime,
  Download as DownloadIcon,
} from "@mui/icons-material";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import axios from "axios";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
// prettier-ignore
import * as XLSX from "xlsx-js-style";
dayjs.extend(isBetween);

// 🔧 Base API URL (set REACT_APP_API_URL in Vercel/Netlify; falls back to local)
const API = process.env.REACT_APP_API_URL || "http://localhost:3000";

// ---------- helpers ----------
const GENERAL_DAILY_LIMIT = 60; // minutes
const NAMAZ_DAILY_LIMIT = 50;   // minutes

function sameOrBetween(dateISO, start, end) {
  // dateISO = 'YYYY-MM-DD' (from backend shiftDate)
  const d = dayjs(dateISO, "YYYY-MM-DD");
  return d.isBetween(start, end, "day", "[]");
}

function groupByShift(sessions) {
  const groups = {};
  sessions.forEach((s) => {
    const key = `${s.shiftDate} — ${s.shiftLabel}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });
  return groups;
}

function sumByCategory(sessions) {
  let total = 0,
    general = 0,
    namaz = 0,
    official = 0,
    autobreak = 0;

  sessions.forEach((s) => {
    const dur = Number(s.duration) || 0;
    total += dur;
    if (s.category === "General") general += dur;
    else if (s.category === "Namaz") namaz += dur;
    else if (s.category === "Official") official += dur;
    else if (s.category === "AutoBreak") autobreak += dur;
  });

  return { total, general, namaz, official, autobreak };
}

function perDayExceedances(sessions) {
  // compute exceeded(min) per calendar day, then sum across range
  const byDay = new Map();
  sessions.forEach((s) => {
    if (!s.shiftDate) return;
    const dur = Number(s.duration) || 0;
    const rec = byDay.get(s.shiftDate) || { general: 0, namaz: 0 };
    if (s.category === "General") rec.general += dur;
    if (s.category === "Namaz") rec.namaz += dur;
    byDay.set(s.shiftDate, rec);
  });
  let generalExceeded = 0;
  let namazExceeded = 0;
  for (const [, rec] of byDay) {
    generalExceeded += Math.max(0, rec.general - GENERAL_DAILY_LIMIT);
    namazExceeded += Math.max(0, rec.namaz - NAMAZ_DAILY_LIMIT);
  }
  return { generalExceeded, namazExceeded };
}

// ---------- Employee sessions row ----------
function EmployeeRow({ emp, sessions, generalLimit = 60, configColors = {} }) {
  const [open, setOpen] = useState(false);
  const colors = {
    Official: "#3b82f6",
    General: "#f59e0b",
    Namaz: "#10b981",
    AutoBreak: "#ef4444",
    Uncategorized: "#9ca3af",
    ...configColors,
  };

  const grouped = useMemo(() => groupByShift(sessions), [sessions]);

  return (
    <>
      <TableRow hover>
        <TableCell>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: "#6366F1", fontWeight: 600 }}>
              {emp.name?.charAt(0) || "U"}
            </Avatar>
            <Box>
              <Typography fontWeight={600}>{emp.name}</Typography>
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
        <TableCell colSpan={5} sx={{ p: 0, bgcolor: "background.default" }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box m={2}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                Idle Sessions & AutoBreaks
              </Typography>

              {Object.keys(grouped).length === 0 && (
                <Typography>No sessions found</Typography>
              )}

              {Object.entries(grouped).map(([key, items]) => {
                const totals = sumByCategory(items);

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
                            <TableCell>Start</TableCell>
                            <TableCell>End</TableCell>
                            <TableCell>Reason</TableCell>
                            <TableCell>Duration (min)</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {items.map((s, idx) => (
                            <TableRow key={idx}>
                              <TableCell>
                                <Chip
                                  label={s.category || "Uncategorized"}
                                  size="small"
                                  sx={{
                                    fontWeight: 600,
                                    color: "#fff",
                                    bgcolor:
                                      colors[s.category] || colors.Uncategorized,
                                  }}
                                />
                              </TableCell>
                              <TableCell>{s.start_time_local || "N/A"}</TableCell>
                              <TableCell>{s.end_time_local || "Ongoing"}</TableCell>
                              <TableCell>{s.reason || "-"}</TableCell>
                              <TableCell>{s.duration || 0} min</TableCell>
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
                                {totals.total} min
                              </Typography>
                            </Card>
                          </Grid>

                          <Grid item xs={12} md={3}>
                            <Card sx={{ p: 2, borderRadius: 3, bgcolor: "#eff6ff" }}>
                              <Typography fontWeight={700} color="primary.main">
                                Official Break
                              </Typography>
                              <Typography variant="h6" fontWeight={800}>
                                {totals.official} min
                              </Typography>
                            </Card>
                          </Grid>

                          <Grid item xs={12} md={3}>
                            <Card sx={{ p: 2, borderRadius: 3, bgcolor: "#ecfdf5" }}>
                              <Typography fontWeight={700} color="success.main">
                                Namaz Break
                              </Typography>
                              <Typography variant="h6" fontWeight={800}>
                                {totals.namaz} min
                              </Typography>
                            </Card>
                          </Grid>

                          <Grid item xs={12} md={3}>
                            <Card
                              sx={{
                                p: 2,
                                borderRadius: 3,
                                bgcolor:
                                  totals.general > generalLimit
                                    ? "error.light"
                                    : "success.light",
                                color:
                                  totals.general > generalLimit
                                    ? "error.contrastText"
                                    : "success.contrastText",
                              }}
                            >
                              <Typography fontWeight={700}>General Break</Typography>
                              <Typography variant="h6" fontWeight={800}>
                                {totals.general} min
                              </Typography>
                            </Card>
                          </Grid>

                          <Grid item xs={12} md={3}>
                            <Card sx={{ p: 2, borderRadius: 3, bgcolor: "#fee2e2" }}>
                              <Typography fontWeight={700} color="error.main">
                                AutoBreak
                              </Typography>
                              <Typography variant="h6" fontWeight={800}>
                                {totals.autobreak} min
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

// ---------- Main screen ----------
export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [config, setConfig] = useState({ generalIdleLimit: 60, categoryColors: {} });

  // filters
  const [search, setSearch] = useState("");
  const [empFilter, setEmpFilter] = useState("all");
  const [startDate, setStartDate] = useState(dayjs().startOf("day"));
  const [endDate, setEndDate] = useState(dayjs().endOf("day"));

  // download menu
  const [anchorEl, setAnchorEl] = useState(null);
  const openMenu = Boolean(anchorEl);

  // fetch
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const res = await axios.get(`${API}/employees`, { timeout: 15000 });
        const list = Array.isArray(res.data) ? res.data : res.data.employees || [];
        setEmployees(list);
      } catch (e) {
        console.error("Error fetching employees:", e);
      }
    };
    const fetchConfig = async () => {
      try {
        const res = await axios.get(`${API}/config`, { timeout: 15000 });
        setConfig(res.data || {});
      } catch (e) {
        console.error("Error fetching config:", e);
      }
    };
    fetchEmployees();
    fetchConfig();
    const id = setInterval(fetchEmployees, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // filtered list & per-employee filtered sessions
  const visibleEmployees = useMemo(() => {
    const q = search.toLowerCase();
    return employees
      .filter((e) => (empFilter === "all" ? true : e.id === empFilter))
      .filter((e) => e.name?.toLowerCase().includes(q));
  }, [employees, empFilter, search]);

  const sessionsByEmployee = useMemo(() => {
    const map = new Map();
    visibleEmployees.forEach((emp) => {
      const all = Array.isArray(emp.idle_sessions) ? emp.idle_sessions : [];
      const inRange = all.filter(
        (s) => s.shiftDate && sameOrBetween(s.shiftDate, startDate, endDate)
      );
      map.set(emp.id, inRange);
    });
    return map;
  }, [visibleEmployees, startDate, endDate]);

  // aggregates for export
  function makeRow(emp) {
    const sessions = sessionsByEmployee.get(emp.id) || [];
    const totals = sumByCategory(sessions);
    const { generalExceeded, namazExceeded } = perDayExceedances(sessions);
    return {
      id: emp.emp_id || emp.id,
      name: emp.name || "",
      dept: emp.department || "",
      total: +totals.total.toFixed(1),
      general: +totals.general.toFixed(1),
      namaz: +totals.namaz.toFixed(1),
      official: +totals.official.toFixed(1),
      autobreak: +totals.autobreak.toFixed(1),
      generalExceeded: +generalExceeded.toFixed(1),
      namazExceeded: +namazExceeded.toFixed(1),
    };
  }

  const exportRows = useMemo(() => visibleEmployees.map(makeRow), [
    visibleEmployees,
    sessionsByEmployee,
  ]);

  // quick ranges
  const setToday = () => {
    setStartDate(dayjs().startOf("day"));
    setEndDate(dayjs().endOf("day"));
  };
  const setThisMonth = () => {
    setStartDate(dayjs().startOf("month"));
    setEndDate(dayjs().endOf("month"));
  };

  // ---------- export: CSV / PDF / XLSX ----------
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

  function exportCSV() {
    const rows = exportRows.map((r) => [
      r.id,
      r.name,
      r.dept,
      r.total,
      r.general,
      r.namaz,
      r.official,
      r.autobreak,
      r.generalExceeded,
      r.namazExceeded,
    ]);
    const csv = [headers, ...rows].map((a) => a.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const label =
      startDate.isSame(endDate, "day")
        ? startDate.format("YYYY-MM-DD")
        : `${startDate.format("YYYY-MM-DD")}_to_${endDate.format("YYYY-MM-DD")}`;
    a.download = `employee_idle_report_${label}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const line1 = "Employee Idle Report";
    const line2 = startDate.isSame(endDate, "day")
      ? `Date: ${startDate.format("YYYY-MM-DD")}`
      : `Range: ${startDate.format("YYYY-MM-DD")} → ${endDate.format("YYYY-MM-DD")}`;

    doc.setFontSize(16);
    doc.setTextColor("#111827");
    doc.text(line1, 40, 40);

    doc.setFontSize(11);
    doc.setTextColor("#4b5563");
    doc.text(line2, 40, 60);
    doc.text("Timezone: Asia/Karachi", 40, 78);
    doc.text("Limits — General: 60 min/day, Namaz: 50 min/day", 40, 96);

    const body = exportRows.map((r) => [
      r.id,
      r.name,
      r.dept,
      r.total,
      r.general,
      r.namaz,
      r.official,
      r.autobreak,
      r.generalExceeded,
      r.namazExceeded,
    ]);

    autoTable(doc, {
      startY: 118,
      head: [headers],
      body,
      styles: { fontSize: 10, cellPadding: 6, halign: "center" },
      headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: "bold" },
      columnStyles: { 1: { halign: "left" }, 2: { halign: "left" } },
      margin: { left: 40, right: 40 },
    });

    const label =
      startDate.isSame(endDate, "day")
        ? startDate.format("YYYY-MM-DD")
        : `${startDate.format("YYYY-MM-DD")}_to_${endDate.format("YYYY-MM-DD")}`;
    doc.save(`employee_idle_report_${label}.pdf`);
  }

  // Note: CSV cannot store colors. For a **colorful** spreadsheet, export **XLSX**.
  function exportXLSX() {
    const wb = XLSX.utils.book_new();
    const data = [headers, ...exportRows.map((r) => [
      r.id,r.name,r.dept,r.total,r.general,r.namaz,r.official,r.autobreak,r.generalExceeded,r.namazExceeded,
    ])];

    const ws = XLSX.utils.aoa_to_sheet(data);

    // style header row
    for (let c = 0; c < headers.length; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      cell.s = {
        font: { bold: true, color: { rgb: "FFFFFFFF" } },
        fill: { fgColor: { rgb: "6366F1" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "FFCBD5E1" } },
          bottom: { style: "thin", color: { rgb: "FFCBD5E1" } },
          left: { style: "thin", color: { rgb: "FFCBD5E1" } },
          right: { style: "thin", color: { rgb: "FFCBD5E1" } },
        },
      };
    }

    // column widths
    const colWidths = [15, 22, 18, 16, 14, 14, 16, 16, 22, 22].map((wch) => ({ wch }));
    ws["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, "Idle Report");
    const label =
      startDate.isSame(endDate, "day")
        ? startDate.format("YYYY-MM-DD")
        : `${startDate.format("YYYY-MM-DD")}_to_${endDate.format("YYYY-MM-DD")}`;
    XLSX.writeFile(wb, `employee_idle_report_${label}.xlsx`);
  }

  // UI
  return (
    <Box p={3}>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Employees
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        View sessions and download daily / monthly / custom reports
      </Typography>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              placeholder="🔍 Search employee..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Grid>

          <Grid item xs={12} md={3}>
            <Select
              fullWidth
              value={empFilter}
              onChange={(e) => setEmpFilter(e.target.value)}
            >
              <MenuItem value="all">All Employees</MenuItem>
              {employees.map((e) => (
                <MenuItem key={e.id} value={e.id}>
                  {e.name}
                </MenuItem>
              ))}
            </Select>
          </Grid>

          <Grid item xs={12} md="auto">
            <Button variant="outlined" onClick={setToday} sx={{ mr: 1 }}>
              TODAY / DAY
            </Button>
            <Button variant="outlined" onClick={setThisMonth}>
              THIS MONTH
            </Button>
          </Grid>

          <Grid item xs />
          <Grid item xs={12} md={5}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <Box display="flex" gap={2}>
                <DatePicker
                  label="Start"
                  value={startDate}
                  onChange={(v) => v && setStartDate(v.startOf("day"))}
                />
                <DatePicker
                  label="End"
                  value={endDate}
                  onChange={(v) => v && setEndDate(v.endOf("day"))}
                />
              </Box>
            </LocalizationProvider>
          </Grid>

          <Grid item xs={12} md="auto">
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={(e) => setAnchorEl(e.currentTarget)}
            >
              Download Report
            </Button>
            <Menu anchorEl={anchorEl} open={openMenu} onClose={() => setAnchorEl(null)}>
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  exportCSV();
                }}
              >
                CSV
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  exportPDF();
                }}
              >
                PDF
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  exportXLSX();
                }}
              >
                Excel (.xlsx)
              </MenuItem>
            </Menu>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        <Box display="flex" gap={1} flexWrap="wrap">
          <Chip
            label={`Range: ${startDate.format("YYYY-MM-DD")} → ${endDate.format(
              "YYYY-MM-DD"
            )}`}
          />
          <Chip label={`General limit: ${GENERAL_DAILY_LIMIT} min/day`} />
          <Chip label={`Namaz limit: ${NAMAZ_DAILY_LIMIT} min/day`} />
        </Box>
      </Paper>

      {/* Employees table */}
      <TableContainer component={Paper} elevation={4} sx={{ borderRadius: "20px" }}>
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
            {visibleEmployees.map((emp) => (
              <EmployeeRow
                key={emp.id}
                emp={emp}
                sessions={sessionsByEmployee.get(emp.id) || []}
                generalLimit={config.generalIdleLimit || GENERAL_DAILY_LIMIT}
                configColors={config.categoryColors || {}}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
