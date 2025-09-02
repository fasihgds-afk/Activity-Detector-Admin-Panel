import React, { useEffect, useMemo, useState } from "react";
import {
  Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography,
  TextField, Box, TableContainer, Avatar, Chip, Collapse, IconButton,
  Card, CardContent, Tooltip, Grid, Button, Menu, MenuItem, Select
} from "@mui/material";
import { KeyboardArrowDown, KeyboardArrowUp, AccessTime, Download } from "@mui/icons-material";
import axios from "axios";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API = process.env.REACT_APP_API_URL || "http://localhost:3000";

/* -------- helpers -------- */
const pad = (n) => (n < 10 ? `0${n}` : `${n}`);

function ymdInAsiaFromISO(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(d); // YYYY-MM-DD
  } catch {
    return null;
  }
}

// before 06:00 local → use previous day as “shift business day”
function currentShiftYmd() {
  const fmtYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const hourFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    hourCycle: "h23",
  });

  const now = new Date();
  const ymd = fmtYmd.format(now);
  const hour = parseInt(hourFmt.format(now), 10);
  if (hour >= 6) return ymd;

  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// filter using shiftDate if present; else fall back to ISO start converted to Asia/Karachi
function inPickedRange(shiftDate, mode, day, from, to, idleStartISO) {
  let sd = shiftDate;
  if (!sd) sd = ymdInAsiaFromISO(idleStartISO);
  if (!sd) return false;

  if (mode === "day") return sd === day;
  if (mode === "month") return sd >= from && sd <= to;
  if (!from || !to) return true;
  return sd >= from && sd <= to;
}

function calcTotals(sessions) {
  const t = { total: 0, general: 0, namaz: 0, official: 0, autobreak: 0 };
  for (const s of sessions) {
    const d = Number(s.duration) || 0;
    t.total += d;
    if (s.category === "General")  t.general  += d;
    else if (s.category === "Namaz")    t.namaz    += d;
    else if (s.category === "Official") t.official += d;
    else if (s.category === "AutoBreak") t.autobreak += d;
  }
  return t;
}

/* -------- XLS maker (schema unchanged) -------- */
function downloadXls(filename, headers, rows) {
  const headerHtml = headers
    .map((h) => `<th style="background:#1f2937;color:#fff;padding:10px 8px;border:1px solid #e5e7eb;text-align:center;font-weight:700">${h}</th>`)
    .join("");

  const rowHtml = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c, i) => {
            const base = "padding:8px;border:1px solid #e5e7eb;text-align:center";
            let bg = "";
            if (i === 8) bg = "background:#fef9c3;"; // Gen Exceed
            if (i === 9) bg = "background:#fee2e2;"; // Namaz Exceed
            return `<td style="${base};${bg}">${String(c)}</td>`;
          })
          .join("")}</tr>`
    )
    .join("");

  const html = `
    <html><head><meta charset="utf-8" />
    <style>
      table{border-collapse:collapse;font-family:Segoe UI,Arial;font-size:12px}
      thead tr th{position:sticky;top:0}
    </style>
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

/* =========================
   UI Row
   ========================= */
function EmployeeRow({ emp, dayMode, pickedDay, from, to, generalLimit }) {
  const [open, setOpen] = useState(false);
  const all = Array.isArray(emp.idle_sessions) ? emp.idle_sessions : [];

  const grouped = useMemo(() => {
    const map = {};
    const sorted = [...all].sort((a, b) => {
      const at = a.idle_start ? new Date(a.idle_start).getTime() : 0;
      const bt = b.idle_start ? new Date(b.idle_start).getTime() : 0;
      return at - bt;
    });

    for (const s of sorted) {
      if (!inPickedRange(s.shiftDate, dayMode, pickedDay, from, to, s.idle_start)) continue;
      const label = `${s.shiftDate || ymdInAsiaFromISO(s.idle_start) || "Unknown"} — ${emp.shift_start} – ${emp.shift_end}`;
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
                ID: {emp.emp_id || emp.id || emp._id}
              </Typography>
            </Box>
          </Box>
        </TableCell>
        <TableCell>{emp.department || "-"}</TableCell>
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
                                      s.category === "Official"   ? "#3b82f6" :
                                      s.category === "General"    ? "#f59e0b" :
                                      s.category === "Namaz"      ? "#10b981" :
                                      s.category === "AutoBreak"  ? "#ef4444" :
                                                                    "#9ca3af",
                                  }}
                                />
                              </TableCell>
                              <TableCell>{s.start_time_local || "-"}</TableCell>
                              <TableCell>{s.end_time_local || "Ongoing"}</TableCell>
                              <TableCell>{s.reason || "-"}</TableCell>
                              <TableCell>
                                {s.category === "AutoBreak"
                                  ? `${Number(s.duration ?? 0).toFixed(1)} min`
                                  : `${s.duration ?? 0} min`}
                              </TableCell>
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
                                {Number(sums.total).toFixed(1)} min
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
                                {sums.namaz} min
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
                                {sums.general > generalLimit
                                  ? `(Exceeded by ${sums.general - generalLimit})`
                                  : ""}
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

/* =========================
   Main Screen
   ========================= */
export default function Employees() {
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState([]);
  const [config, setConfig] = useState({ generalIdleLimit: 60, namazLimit: 50 });
  const [employeeFilter, setEmployeeFilter] = useState("all");

  // Modes
  const [mode, setMode] = useState("day"); // 'day' | 'month' | 'range'
  const [day, setDay]   = useState(currentShiftYmd());
  const [month, setMonth] = useState(() => {
    const [y, m] = currentShiftYmd().split("-");
    return `${y}-${m}`;
  });
  const [from, setFrom] = useState(currentShiftYmd());
  const [to, setTo]     = useState(currentShiftYmd());
  const [autoShiftDay, setAutoShiftDay] = useState(true);

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
    } catch {}
  };

  useEffect(() => {
    fetchEmployees();
    fetchConfig();
    const interval = setInterval(fetchEmployees, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (mode !== "day" || !autoShiftDay) return;
      const sd = currentShiftYmd();
      setDay((d) => (d !== sd ? sd : d));
    }, 60_000);
    return () => clearInterval(t);
  }, [mode, autoShiftDay]);

  // Month bounds
  useEffect(() => {
    if (mode !== "month") return;
    const [yy, mm] = month.split("-").map(Number);
    const start = `${yy}-${pad(mm)}-01`;
    const endDate = new Date(yy, mm, 0).getDate(); // days in month
    const end = `${yy}-${pad(mm)}-${pad(endDate)}`;
    setFrom(start);
    setTo(end);
  }, [mode, month]);

  const filtered = useMemo(() => {
    let list = Array.isArray(employees) ? employees : [];
    if (employeeFilter !== "all") {
      list = list.filter(
        (e) =>
          e.emp_id === employeeFilter ||
          e.id === employeeFilter ||
          e._id === employeeFilter
      );
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((e) => e.name?.toLowerCase().includes(s));
    }
    return list;
  }, [employees, employeeFilter, search]);

  /* ---------- Effective limits ---------- */
  function getMonthDays() {
    if (mode !== "month") return 1;
    const [yy, mm] = month.split("-").map(Number);
    return new Date(yy, mm, 0).getDate();
  }
  function effectiveGeneralLimit() {
    const daily = (config.generalIdleLimit ?? 60);
    return mode === "month" ? daily * getMonthDays() : daily;
    // (range mode keeps daily limit as requested)
  }
  function effectiveNamazLimit() {
    const daily = (config.namazLimit ?? 50);
    return mode === "month" ? daily * getMonthDays() : daily;
  }

  /* ---------- Build rows (Exceeded uses effective limits) ---------- */
  function collectReportRows() {
    const rows = [];
    const genCap = effectiveGeneralLimit();
    const namCap = effectiveNamazLimit();
    const elist = filtered.length ? filtered : [];
    for (const emp of elist) {
      const sessions = (emp.idle_sessions || []).filter((s) =>
        inPickedRange(s.shiftDate, mode, day, from, to, s.idle_start)
      );
      const sums = calcTotals(sessions);
      const genEx = Math.max(0, sums.general - genCap);
      const namEx = Math.max(0, sums.namaz - namCap);
      rows.push([
        emp.emp_id || emp.id || emp._id,
        emp.name || "-",
        emp.department || "-",
        Number(sums.total.toFixed(1)),
        sums.general,
        sums.namaz,
        sums.official,
        Number(sums.autobreak).toFixed(1),
        genEx,
        namEx,
      ]);
    }
    return rows;
  }

  /* ---------- PDF: table-only, landscape, uses effective limits ---------- */
  function downloadPDF() {
    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });

    const pageW = doc.internal.pageSize.getWidth();
    const gray600 = "#4b5563";
    const brand = [31, 41, 55];
    const accent = [99, 102, 241];

    const label = mode === "day" ? day : `${from} → ${to}`;
    const title = mode === "day" ? "Daily Idle Report" : (mode === "month" ? "Monthly Idle Report" : "Custom Range Idle Report");

    // Limits text
    const gDaily = (config.generalIdleLimit ?? 60);
    const nDaily = (config.namazLimit ?? 50);
    const days = getMonthDays();
    const gCap = effectiveGeneralLimit();
    const nCap = effectiveNamazLimit();
    const limitsText =
      mode === "month"
        ? `Limits: General ${gDaily}m/day (cap ${gCap}m), Namaz ${nDaily}m/day (cap ${nCap}m)`
        : `Limits: General ${gDaily}m/day, Namaz ${nDaily}m/day`;

    const header = (data) => {
      doc.setFillColor(brand[0], brand[1], brand[2]);
      doc.rect(0, 0, pageW, 64, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor("#ffffff");
      doc.text("Employee Idle Report", 40, 26);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.text(title, 40, 46);

      doc.setFontSize(10);
      doc.text(`Range: ${label}   |   TZ: Asia/Karachi   |   ${limitsText}`, pageW - 40, 26, { align: "right" });
    };
    const footer = (data) => {
      doc.setFontSize(9);
      doc.setTextColor(gray600);
      doc.text(`Page ${data.pageNumber}`, pageW / 2, doc.internal.pageSize.getHeight() - 14, { align: "center" });
    };

    const raw = collectReportRows(); // includes totals and exceeded (based on effective caps)
    const body = raw.map(r => [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]]);

    const headers = ["Emp ID","Name","Dept","Total (m)","General (m)","Namaz (m)","Official (m)","Auto (m)"];

    autoTable(doc, {
      head: [headers],
      body,
      margin: { left: 40, right: 40, top: 70, bottom: 28 },
      tableWidth: "auto",
      styles: { fontSize: 10, cellPadding: 6, halign: "center", valign: "middle" },
      headStyles: { fillColor: accent, textColor: 255, halign: "center" },
      theme: "striped",
      striped: true,
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didDrawPage: (data) => {
        header(data);
        footer(data);
      },
      didParseCell: (data) => {
        // Bold numeric columns
        if (data.section === "body" && [3,4,5,6,7].includes(data.column.index)) {
          data.cell.styles.fontStyle = "bold";
        }
        // Conditional colors based on effective caps
        if (data.section === "body") {
          if (data.column.index === 4) { // General
            const v = Number(data.cell.raw || 0);
            if (v > gCap) {
              data.cell.styles.fillColor = [255, 237, 213]; // orange-100
              data.cell.styles.textColor = [194, 65, 12];   // orange-600
            }
          }
          if (data.column.index === 5) { // Namaz
            const v = Number(data.cell.raw || 0);
            if (v > nCap) {
              data.cell.styles.fillColor = [254, 226, 226]; // red-100
              data.cell.styles.textColor = [220, 38, 38];   // red-600
            }
          }
        }
      },
      columnStyles: {
        1: { halign: "left" }, // Name
        2: { halign: "left" }, // Dept
      },
      startY: 84,
    });

    const fileLabel = mode === "day" ? day : `${from.replaceAll("-","")}_${to.replaceAll("-","")}`;
    doc.save(`employee_idle_report_${fileLabel}.pdf`);
  }

  function downloadXLS() {
    const headers = [
      "Employee ID","Name","Department","Total Idle (min)","General (min)",
      "Namaz (min)","Official (min)","AutoBreak (min)",
      "General Limit Exceeded (min)","Namaz Limit Exceeded (min)",
    ];
    const rows = collectReportRows(); // exceeded already uses effective caps
    const label = mode === "day" ? day : `${from}_to_${to}`;
    downloadXls(`employee_idle_report_${label}.xls`, headers, rows);
  }

  const gDaily = (config.generalIdleLimit ?? 60);
  const nDaily = (config.namazLimit ?? 50);
  const note =
    mode === "month"
      ? `General: ${gDaily}m/day (×${new Date(Number(month.split("-")[0]), Number(month.split("-")[1]), 0).getDate()} days) • Namaz: ${nDaily}m/day`
      : `General: ${gDaily}m/day • Namaz: ${nDaily}m/day`;

  return (
    <Box p={3}>
      {/* Controls */}
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
          <MenuItem value="all">All Employees</MenuItem>
          {employees.map((e) => (
            <MenuItem key={e.emp_id || e.id || e._id} value={e.emp_id || e.id || e._id}>
              {e.name}
            </MenuItem>
          ))}
        </Select>

        <Select size="small" value={mode} onChange={(e) => setMode(e.target.value)}>
          <MenuItem value="day">DAILY</MenuItem>
          <MenuItem value="month">MONTHLY</MenuItem>
          <MenuItem value="range">CUSTOM RANGE</MenuItem>
        </Select>

        {mode === "day" && (
          <TextField
            label="Pick a day"
            type="date"
            size="small"
            value={day}
            onChange={(e) => { setAutoShiftDay(false); setDay(e.target.value); }}
            InputLabelProps={{ shrink: true }}
          />
        )}

        {mode === "month" && (
          <TextField
            label="Pick a month"
            type="month"
            size="small"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        )}

        {mode === "range" && (
          <>
            <TextField label="From" type="date" size="small" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField label="To"   type="date" size="small" value={to}   onChange={(e) => setTo(e.target.value)}   InputLabelProps={{ shrink: true }} />
          </>
        )}

        <Box flex={1} />

        <Button variant="contained" startIcon={<Download />} onClick={(e) => setAnchorEl(e.currentTarget)}>
          Download Report
        </Button>
        <Menu anchorEl={anchorEl} open={openMenu} onClose={() => setAnchorEl(null)}>
          <MenuItem onClick={() => { setAnchorEl(null); downloadPDF(); }}>PDF (table only)</MenuItem>
          <MenuItem onClick={() => { setAnchorEl(null); downloadXLS(); }}>Excel (.xls)</MenuItem>
          {/* CSV removed as requested */}
        </Menu>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        {mode === "day" ? `Range: ${day}` : `Range: ${from} → ${to}`} &nbsp; | &nbsp; {note} &nbsp; | &nbsp; TZ: Asia/Karachi
      </Typography>

      {/* Table (UI) */}
      <TableContainer component={Paper} elevation={5} sx={{ borderRadius: "18px" }}>
        <Table>
          <TableHead>
            <TableRow sx={{ background: "linear-gradient(90deg,#6366F1,#14B8A6)" }}>
              <TableCell sx={{ color: "#fff", fontWeight: 600 }}>Name</TableCell>
              <TableCell sx={{ color: "#fff", fontWeight: 600 }}>Department</TableCell>
              <TableCell sx={{ color: "#fff", fontWeight: 600 }}>Shift</TableCell>
              <TableCell sx={{ color: "#fff", fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ color: "#fff", fontWeight: 600 }} align="center">Sessions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((emp) => (
              <EmployeeRow
                key={emp.emp_id || emp.id || emp._id}
                emp={emp}
                dayMode={mode}
                pickedDay={day}
                from={from}
                to={to}
                generalLimit={effectiveGeneralLimit()}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
