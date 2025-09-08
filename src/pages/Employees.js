/* eslint-disable no-console */
import React, { useEffect, useMemo, useState } from "react";
import {
  Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography,
  TextField, Box, TableContainer, Avatar, Chip, Collapse, IconButton,
  Card, CardContent, Tooltip, Grid, Button, Menu, MenuItem, Select,
  Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import { KeyboardArrowDown, KeyboardArrowUp, AccessTime, Download } from "@mui/icons-material";
import axios from "axios";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* =========================
   API base
   ========================= */
const API = process.env.REACT_APP_API_URL || "http://localhost:3000";
const ZONE = "Asia/Karachi";

/* =========================
   Small helpers
   ========================= */
const pad = (n) => (n < 10 ? "0" + n : "" + n);
const cleanName = (s) => (s || "").replace(/\s+/g, " ").trim();
const slugName = (s) =>
  (cleanName(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "employee");

function confirmDownload(label) {
  return window.confirm("Download " + label + "?");
}

function ymdInAsiaFromISO(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return fmt.format(d); // YYYY-MM-DD
  } catch {
    return null;
  }
}

// before 06:00 local → use previous day as “shift business day”
function currentShiftYmd() {
  const fmtYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const hourFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    hour: "2-digit",
    hourCycle: "h23"
  });

  const now = new Date();
  const ymd = fmtYmd.format(now);
  const hour = parseInt(hourFmt.format(now), 10);
  if (hour >= 6) return ymd;

  const parts = ymd.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return (
    dt.getUTCFullYear() +
    "-" +
    pad(dt.getUTCMonth() + 1) +
    "-" +
    pad(dt.getUTCDate())
  );
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
    if (s.category === "General") t.general += d;
    else if (s.category === "Namaz") t.namaz += d;
    else if (s.category === "Official") t.official += d;
    else if (s.category === "AutoBreak") t.autobreak += d;
  }
  return t;
}

const toH1 = (min) => ((min || 0) / 60).toFixed(1);

/* Parse shift strings like "6:00 PM" / "09:00" → minutes */
function parseShiftToMinutes(str) {
  if (!str) return null;
  const s = String(str).trim().toUpperCase();
  const parts = s.split(/\s+/);
  if (parts.length === 2 && (parts[1] === "AM" || parts[1] === "PM")) {
    let hm = parts[0].split(":").map(Number);
    let h = hm[0];
    const m = hm[1] || 0;
    if (parts[1] === "PM" && h < 12) h += 12;
    if (parts[1] === "AM" && h === 12) h = 0;
    return h * 60 + m;
  }
  const hm2 = s.split(":").map(Number);
  const h2 = hm2[0];
  const m2 = hm2[1];
  if (Number.isFinite(h2) && Number.isFinite(m2)) return h2 * 60 + m2;
  return null;
}
function shiftSpanMinutes(shiftStart, shiftEnd) {
  const s = parseShiftToMinutes(shiftStart);
  const e = parseShiftToMinutes(shiftEnd);
  if (s == null || e == null) return 9 * 60; // default 9h if malformed
  return e >= s ? e - s : 24 * 60 - s + e; // handle cross midnight
}

/* =========================
   Excel maker (Summary with Reasons-by-Category)
   ========================= */
function downloadXls(filename, headers, rows) {
  const headerHtml = headers
    .map(
      (h) =>
        '<th style="background:#1f2937;color:#fff;padding:10px 8px;border:1px solid #e5e7eb;text-align:center;font-weight:700">' +
        h +
        "</th>"
    )
    .join("");

  const rowHtml = rows
    .map((r) => {
      const cells = r
        .map((c, i) => {
          const base =
            "padding:8px;border:1px solid #e5e7eb;text-align:center;vertical-align:middle";
          const wrap = /reason/i.test(headers[i])
            ? "white-space:normal;max-width:520px"
            : "white-space:nowrap";
          return '<td style="' + base + ";" + wrap + '">' + String(c == null ? "" : c) + "</td>";
        })
        .join("");
      return "<tr>" + cells + "</tr>";
    })
    .join("");

  const html =
    "<html><head><meta charset=\"utf-8\" />" +
    "<style>table{border-collapse:collapse;font-family:Segoe UI,Arial;font-size:12px} thead tr th{position:sticky;top:0} td,th{word-break:break-word}</style>" +
    "</head><body><table><thead><tr>" +
    headerHtml +
    "</tr></thead><tbody>" +
    rowHtml +
    "</tbody></table></body></html>";

  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.slice(-4) === ".xls" ? filename : filename + ".xls";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* =========================
   Status helpers
   ========================= */
function karachiNowHM() {
  const fmtH = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", hourCycle: "h23" });
  const fmtM = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, minute: "2-digit" });
  return { h: parseInt(fmtH.format(new Date()), 10), m: parseInt(fmtM.format(new Date()), 10) };
}
function hmToMinutes(hhmm) {
  const parts = (hhmm || "").split(":").map(Number);
  const h = parts[0];
  const m = parts[1];
  return Number.isNaN(h) || Number.isNaN(m ? m : 0) ? null : h * 60 + (m || 0);
}
function isInShiftNow(shiftStart, shiftEnd) {
  const nowHM = karachiNowHM();
  const now = nowHM.h * 60 + nowHM.m;
  const s = hmToMinutes(shiftStart);
  const e = hmToMinutes(shiftEnd);
  if (s == null || e == null) return false;
  if (e >= s) return now >= s && now <= e;
  return now >= s || now <= e; // crosses midnight
}

function computeDbAwareStatus(emp, ctx) {
  const raw = (emp && emp.latest_status ? String(emp.latest_status) : "").trim().toLowerCase();
  const sessions = Array.isArray(emp && emp.idle_sessions) ? emp.idle_sessions : [];
  const ongoing = sessions
    .filter((s) => inPickedRange(s.shiftDate, ctx.mode, ctx.day, ctx.from, ctx.to, s.idle_start))
    .find((s) => !s.end_time_local || s.end_time_local === "Ongoing");
  const onCat = ongoing && ongoing.category;

  if (raw === "active" || raw === "online" || raw === "working") {
    return { label: "Active", color: "success" };
  }
  if (raw === "idle") {
    if (onCat) {
      const color =
        onCat === "Official" ? "info" :
        onCat === "Namaz" ? "success" :
        onCat === "AutoBreak" ? "error" :
        "warning";
      return { label: "On Break — " + onCat, color: color };
    }
    return null;
  }
  if (raw === "break" || raw === "on break" || raw === "paused") {
    return { label: onCat ? "On Break — " + onCat : "On Break", color: "warning" };
  }
  if (raw === "offline") return { label: "Offline", color: "default" };
  if (raw === "unknown" || !raw) return null;
  return { label: emp.latest_status, color: "default" };
}

function computeFallbackStatus(emp, ctx) {
  const inShift = isInShiftNow(emp && emp.shift_start, emp && emp.shift_end);
  if (!inShift) return { label: "Off Shift", color: "default" };
  const sessions = Array.isArray(emp && emp.idle_sessions) ? emp.idle_sessions : [];
  const ongoing = sessions
    .filter((s) => inPickedRange(s.shiftDate, ctx.mode, ctx.day, ctx.from, ctx.to, s.idle_start))
    .some((s) => !s.end_time_local || s.end_time_local === "Ongoing");
  if (ongoing) return { label: "On Break", color: "warning" };
  return { label: "Active", color: "success" };
}

function getStatusForEmp(emp, ctx) {
  return computeDbAwareStatus(emp, ctx) || computeFallbackStatus(emp, ctx);
}

/* =========================
   Update gate: only show update/delete if /update exists and is directly accessible (no redirect)
   ========================= */
async function checkUpdateGate() {
  try {
    const res = await fetch(`${API}/update`, {
      method: "GET",
      credentials: "include",
      redirect: "manual",
    });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

/* ---------- date+time helpers for dialog ---------- */
function toInputDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}
function toInputTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${hh}:${mi}:${ss}`;
}
function localDateTimeToISO(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const safeTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const d = new Date(`${dateStr}T${safeTime}`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/* =========================
   Row
   ========================= */
function EmployeeRow({
  emp, dayMode, pickedDay, from, to, generalLimit, categoryColors,
  defaultOpen = false, allowUpdateDelete = false, onEdit, onDelete,
  onEditSession, onCloseSession, onDeleteSession
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const all = Array.isArray(emp && emp.idle_sessions) ? emp.idle_sessions : [];

  const grouped = useMemo(() => {
    const map = {};
    const sorted = all.slice().sort((a, b) => {
      const at = a && a.idle_start ? new Date(a.idle_start).getTime() : 0;
      const bt = b && b.idle_start ? new Date(b.idle_start).getTime() : 0;
      return at - bt;
    });
    for (const s of sorted) {
      if (!inPickedRange(s.shiftDate, dayMode, pickedDay, from, to, s.idle_start)) continue;
      const label =
        (s.shiftDate || ymdInAsiaFromISO(s.idle_start) || "Unknown") +
        " — " +
        emp.shift_start +
        " – " +
        emp.shift_end;
      if (!map[label]) map[label] = [];
      map[label].push(s);
    }
    return map;
  }, [all, emp.shift_start, emp.shift_end, dayMode, pickedDay, from, to]);

  const trackBorder = alpha(theme.palette.divider, 0.4);
  const cardBase = (col, opLight = 0.12, opDark = 0.18) =>
    alpha(col, theme.palette.mode === "dark" ? opDark : opLight);

  const status = getStatusForEmp(emp, { mode: dayMode, day: pickedDay, from: from, to: to });

  return (
    <>
      <TableRow hover>
        <TableCell>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: theme.palette.primary.main, fontWeight: 600 }}>
              {(emp && emp.name ? emp.name.charAt(0) : "?")}
            </Avatar>
            <Box>
              <Typography fontWeight={700}>{emp && emp.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                ID: {emp.emp_id || emp.id || emp._id}
              </Typography>
            </Box>
          </Box>
        </TableCell>
        <TableCell>{emp && emp.department ? emp.department : "-"}</TableCell>
        <TableCell>
          <Chip
            icon={<AccessTime />}
            label={(emp && emp.shift_start) + " - " + (emp && emp.shift_end)}
            color="primary"
            variant="outlined"
          />
        </TableCell>
        <TableCell>
          <Chip label={status.label} color={status.color} variant="filled" sx={{ fontWeight: 600 }} />
        </TableCell>
        <TableCell align="center">
          <Box display="flex" alignItems="center" gap={1} justifyContent="center">
            <Tooltip title="Show Sessions">
              <IconButton onClick={() => setOpen((x) => !x)}>
                {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
              </IconButton>
            </Tooltip>

            {allowUpdateDelete && (
              <>
                <Button size="small" variant="outlined" onClick={() => onEdit(emp)}>Update</Button>
                <Button size="small" color="error" variant="contained" onClick={() => onDelete(emp)}>Delete</Button>
              </>
            )}
          </Box>
        </TableCell>
      </TableRow>

      <TableRow>
        <TableCell colSpan={5} sx={{ p: 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box m={2}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                Idle Sessions &amp; AutoBreaks
              </Typography>

              {Object.keys(grouped).length === 0 && (
                <Typography color="text.secondary">No sessions in this date range.</Typography>
              )}

              {Object.entries(grouped).map(([key, sessions]) => {
                const sums = calcTotals(sessions);
                const generalExceeded = sums.general > generalLimit;

                const totalBg = cardBase(theme.palette.warning.main);
                const officialBg = cardBase(theme.palette.info.main);
                const namazBg = cardBase(theme.palette.success.main);
                const generalBg = generalExceeded
                  ? cardBase(theme.palette.error.main, 0.14, 0.24)
                  : cardBase(theme.palette.success.main, 0.12, 0.18);

                return (
                  <Card
                    key={key}
                    sx={{
                      mb: 3,
                      borderRadius: 3,
                      boxShadow: 3,
                      backgroundColor: alpha(
                        theme.palette.background.paper,
                        theme.palette.mode === "dark" ? 0.6 : 1
                      ),
                      border: "1px solid",
                      borderColor: trackBorder
                    }}
                  >
                    <CardContent>
                      <Typography
                        variant="subtitle1"
                        fontWeight={700}
                        sx={{
                          mb: 2,
                          color: theme.palette.getContrastText(theme.palette.primary.main),
                          bgcolor: theme.palette.primary.main,
                          p: 1,
                          borderRadius: 2,
                          display: "inline-block"
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
                            <TableCell align="center">{allowUpdateDelete ? "Actions" : ""}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {sessions.map((s, i) => {
                            const ongoing = !s.end_time_local || s.end_time_local === "Ongoing";
                            const isAuto = s.kind === "AutoBreak" || s.category === "AutoBreak";
                            return (
                              <TableRow key={String(i)}>
                                <TableCell>
                                  <Chip
                                    label={s.category || (isAuto ? "AutoBreak" : "Uncategorized")}
                                    size="small"
                                    sx={{
                                      fontWeight: 600,
                                      color: "#fff",
                                      bgcolor:
                                        (s.category && categoryColors && categoryColors[s.category]) ||
                                        (s.category === "Official"
                                          ? "info.main"
                                          : s.category === "General"
                                          ? "warning.main"
                                          : s.category === "Namaz"
                                          ? "success.main"
                                          : isAuto
                                          ? "error.main"
                                          : "grey.600")
                                    }}
                                  />
                                </TableCell>
                                <TableCell>{s.start_time_local || "-"}</TableCell>
                                <TableCell>{s.end_time_local || "Ongoing"}</TableCell>

                                {/* REASON WRAPS ON MULTIPLE LINES */}
                                <TableCell
                                  sx={{
                                    whiteSpace: "normal",
                                    overflowWrap: "anywhere",
                                    wordBreak: "break-word",
                                    maxWidth: 520,
                                    lineHeight: 1.35,
                                    py: 1
                                  }}
                                >
                                  {s.reason || (isAuto ? "System Power Off / Startup" : "-")}
                                </TableCell>

                                <TableCell>
                                  {isAuto
                                    ? (Number(s.duration || 0)).toFixed(1) + " min"
                                    : (s.duration || 0) + " min"}
                                </TableCell>

                                <TableCell align="center">
                                  {allowUpdateDelete && (
                                    <Box display="flex" gap={1} justifyContent="center" flexWrap="wrap">
                                      {!isAuto && (
                                        <Button size="small" variant="outlined" onClick={() => onEditSession(emp, s)}>
                                          Edit
                                        </Button>
                                      )}
                                      {ongoing && (
                                        <Button size="small" color="warning" variant="contained" onClick={() => onCloseSession(s)}>
                                          Close Now
                                        </Button>
                                      )}
                                      {/* NEW: Delete (Idle only) */}
                                      {!isAuto && (
                                        <Button
                                          size="small"
                                          color="error"
                                          variant="contained"
                                          onClick={() => onDeleteSession(s)}
                                        >
                                          Delete
                                        </Button>
                                      )}
                                    </Box>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>

                      <Box mt={2}>
                        <Grid container spacing={2}>
                          <Grid item xs={12} md={3}>
                            <Card sx={{ p: 2, borderRadius: 3, bgcolor: totalBg, border: "1px solid", borderColor: trackBorder }}>
                              <Typography fontWeight={700} color="warning.main">Total Time</Typography>
                              <Typography variant="h6" fontWeight={800}>
                                {Number(sums.total).toFixed(1)} min
                              </Typography>
                            </Card>
                          </Grid>
                          <Grid item xs={12} md={3}>
                            <Card sx={{ p: 2, borderRadius: 3, bgcolor: officialBg, border: "1px solid", borderColor: trackBorder }}>
                              <Typography fontWeight={700} color="info.main">Official Break Time</Typography>
                              <Typography variant="h6" fontWeight={800}>{sums.official} min</Typography>
                            </Card>
                          </Grid>
                          <Grid item xs={12} md={3}>
                            <Card sx={{ p: 2, borderRadius: 3, bgcolor: namazBg, border: "1px solid", borderColor: trackBorder }}>
                              <Typography fontWeight={700} color="success.main">Namaz Break Time</Typography>
                              <Typography variant="h6" fontWeight={800}>{sums.namaz} min</Typography>
                            </Card>
                          </Grid>
                          <Grid item xs={12} md={3}>
                            <Card sx={{ p: 2, borderRadius: 3, bgcolor: generalBg, border: "1px solid", borderColor: trackBorder }}>
                              <Typography fontWeight={700}>General Break Time</Typography>
                              <Typography variant="h6" fontWeight={800}>
                                {sums.general} min {generalExceeded ? "(Exceeded by " + (sums.general - generalLimit) + ")" : ""}
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
  const theme = useTheme();

  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState([]);
  const [config, setConfig] = useState({
    generalIdleLimit: 60,
    namazLimit: 50,
    categoryColors: {}
  });
  const [employeeFilter, setEmployeeFilter] = useState("all");

  // gate for update/delete visibility
  const [allowUpdateDelete, setAllowUpdateDelete] = useState(false);

  // Update modal (Employee)
  const [editOpen, setEditOpen] = useState(false);
  const [editValues, setEditValues] = useState({ id: "", name: "", department: "", shift_start: "", shift_end: "" });

  // Update modal (Session/Activity) — with date/time
  const [editSessOpen, setEditSessOpen] = useState(false);
  const [editSessValues, setEditSessValues] = useState({
    id: "", kind: "Idle", reason: "", category: "General",
    startDate: "", startTime: "", endDate: "", endTime: ""
  });

  // Modes
  const [mode, setMode] = useState("day");
  const [day, setDay] = useState(currentShiftYmd());
  const [month, setMonth] = useState(() => {
    const parts = currentShiftYmd().split("-");
    return parts[0] + "-" + parts[1];
  });
  const [from, setFrom] = useState(currentShiftYmd());
  const [to, setTo] = useState(currentShiftYmd());
  const [autoShiftDay, setAutoShiftDay] = useState(true);

  const [anchorEl, setAnchorEl] = useState(null);
  const openMenu = Boolean(anchorEl);

  /* ----- API fetch ----- */
  const fetchEmployees = async () => {
    try {
      const res = await axios.get(API + "/employees", { timeout: 20000, withCredentials: true });
      const arr = Array.isArray(res.data) ? res.data : res.data.employees || [];
      setEmployees(arr);
      const gl = res.data && res.data.settings ? res.data.settings.general_idle_limit : undefined;
      if (typeof gl === "number") {
        setConfig((c) => ({ ...c, generalIdleLimit: gl }));
      }
    } catch (e) {
      console.error("Error fetching employees:", e);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await axios.get(API + "/config", { timeout: 15000, withCredentials: true });
      setConfig((c) => ({ ...c, ...(res.data || {}) }));
    } catch (e) {
      console.warn("Config fetch failed (using defaults).", e && e.message ? e.message : e);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchConfig();
    checkUpdateGate().then(setAllowUpdateDelete);
    const interval = setInterval(fetchEmployees, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (mode !== "day" || !autoShiftDay) return;
      const sd = currentShiftYmd();
      setDay((d0) => (d0 !== sd ? sd : d0));
    }, 60000);
    return () => clearInterval(t);
  }, [mode, autoShiftDay]);

  // Month bounds
  useEffect(() => {
    if (mode !== "month") return;
    const parts = month.split("-").map(Number);
    const yy = parts[0];
    const mm = parts[1];
    const start = yy + "-" + pad(mm) + "-01";
    const endDate = new Date(yy, mm, 0).getDate();
    const end = yy + "-" + pad(mm) + "-" + pad(endDate);
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
      list = list.filter((e) => e.name && e.name.toLowerCase().includes(s));
    }
    return list;
  }, [employees, employeeFilter, search]);

  function getMonthDays() {
    if (mode !== "month") return 1;
    const parts = month.split("-").map(Number);
    const yy = parts[0];
    const mm = parts[1];
    return new Date(yy, mm, 0).getDate();
  }
  function effectiveGeneralLimit(daysOverride) {
    const daily = config.generalIdleLimit == null ? 60 : config.generalIdleLimit;
    const mult = mode === "month" ? (daysOverride == null ? getMonthDays() : daysOverride) : 1;
    return daily * mult;
  }
  function effectiveNamazLimit(daysOverride) {
    const daily = config.namazLimit == null ? 50 : config.namazLimit;
    const mult = mode === "month" ? (daysOverride == null ? getMonthDays() : daysOverride) : 1;
    return daily * mult;
  }

  const sessionsForEmp = (emp) =>
    (emp.idle_sessions || []).filter((s) =>
      inPickedRange(s.shiftDate, mode, day, from, to, s.idle_start)
    );

  const uniqueDays = (sessions) => {
    const set = new Set();
    for (const s of sessions) {
      const d = s.shiftDate || ymdInAsiaFromISO(s.idle_start);
      if (d) set.add(d);
    }
    return set;
  };

  /* ======== Employee Update/Delete ======== */
  function onEditOpen(emp) {
    setEditValues({
      id: emp._id || emp.id || emp.emp_id,
      name: emp.name || "",
      department: emp.department || "",
      shift_start: emp.shift_start || "",
      shift_end: emp.shift_end || ""
    });
    setEditOpen(true);
  }

  async function onEditSave() {
    try {
      const { id, name, department, shift_start, shift_end } = editValues;
      await axios.put(`${API}/employees/${encodeURIComponent(id)}`, {
        name, department, shift_start, shift_end
      }, { withCredentials: true, timeout: 15000 });
      setEditOpen(false);
      await fetchEmployees();
    } catch (e) {
      alert("Update failed: " + (e?.response?.data?.error || e.message));
    }
  }

  async function onDeleteEmp(emp) {
    const id = emp._id || emp.id || emp.emp_id;
    if (!id) return;
    if (!window.confirm(`Delete employee "${emp.name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/employees/${encodeURIComponent(id)}`, { withCredentials: true, timeout: 15000 });
      await fetchEmployees();
    } catch (e) {
      alert("Delete failed: " + (e?.response?.data?.error || e.message));
    }
  }

  /* ======== Activity Log Edit/Close/Delete ======== */
  function onEditSessionOpen(_emp, session) {
    const startISO = session.idle_start || null;
    const endISO = session.idle_end || null;
    setEditSessValues({
      id: session._id || session.id,
      kind: session.kind || (session.category === "AutoBreak" ? "AutoBreak" : "Idle"),
      reason: session.reason || "",
      category: session.category || "General",
      startDate: startISO ? toInputDate(startISO) : (session.shiftDate || ""),
      startTime: startISO ? toInputTime(startISO) : (session.start_time_local || "").slice(0,8),
      endDate: endISO ? toInputDate(endISO) : "",
      endTime: endISO ? toInputTime(endISO) : "",
    });
    setEditSessOpen(true);
  }

  async function onEditSessionSave() {
    try {
      const { id, kind, reason, category, startDate, startTime, endDate, endTime } = editSessValues;
      if (kind === "AutoBreak") {
        alert("AutoBreak rows are system-generated; manual edits are disabled.");
        setEditSessOpen(false);
        return;
      }

      const idle_start = localDateTimeToISO(startDate, startTime);
      const idle_end = (endDate && endTime) ? localDateTimeToISO(endDate, endTime) : null;

      if (!idle_start) {
        alert("Start date/time is invalid.");
        return;
      }

      await axios.put(`${API}/activities/${encodeURIComponent(id)}`, {
        reason, category, idle_start, idle_end
      }, { withCredentials: true, timeout: 15000 });

      setEditSessOpen(false);
      await fetchEmployees();
    } catch (e) {
      alert("Activity update failed: " + (e?.response?.data?.error || e.message));
    }
  }

  async function onCloseSessionNow(session) {
    try {
      const id = session._id || session.id;
      const kind = session.kind || (session.category === "AutoBreak" ? "AutoBreak" : "Idle");
      const url = kind === "AutoBreak"
        ? `${API}/autobreaks/${encodeURIComponent(id)}/end`
        : `${API}/activities/${encodeURIComponent(id)}/end`;
      await axios.put(url, {}, { withCredentials: true, timeout: 15000 });
      await fetchEmployees();
    } catch (e) {
      alert("Close failed: " + (e?.response?.data?.error || e.message));
    }
  }

  // NEW: Delete activity (Idle only, per your backend)
  async function onDeleteSessionNow(session) {
    try {
      const id = session._id || session.id;
      const isAuto = session.kind === "AutoBreak" || session.category === "AutoBreak";
      if (isAuto) {
        alert("AutoBreak rows cannot be deleted from the frontend.");
        return;
      }
      if (!window.confirm("Delete this activity log? This cannot be undone.")) return;
      await axios.delete(`${API}/activities/${encodeURIComponent(id)}`, {
        withCredentials: true,
        timeout: 15000
      });
      await fetchEmployees();
    } catch (e) {
      alert("Delete failed: " + (e?.response?.data?.error || e.message));
    }
  }

  /* ---------- Downloads (existing) ---------- */
  function downloadPDFDailyDetailSelected() {
    if (employeeFilter === "all" || !filtered.length || mode !== "day") return;

    const emp = filtered[0];
    const empName = cleanName(emp.name);
    const sessions = sessionsForEmp(emp).sort(
      (a, b) => new Date(a.idle_start || 0) - new Date(b.idle_start || 0)
    );
    const sums = calcTotals(sessions);

    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();

    const brand = [59, 130, 246];
    doc.setFillColor(31, 41, 55);
    doc.rect(0, 0, pageW, 64, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor("#fff");
    doc.text("Daily Report — " + empName, 40, 26);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(
      "Dept: " +
        (emp.department || "-") +
        "   Shift: " +
        emp.shift_start +
        " – " +
        emp.shift_end +
        "   Day: " +
        day +
        "   TZ: " +
        ZONE,
      40,
      46
    );

    doc.setFillColor(brand[0], brand[1], brand[2]);
    doc.roundedRect(40, 84, 340, 26, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor("#fff");
    doc.text(day + " — " + emp.shift_start + " – " + emp.shift_end, 50, 101);

    const body = sessions.map((s) => [
      s.category || "-",
      s.start_time_local || "-",
      s.end_time_local || "Ongoing",
      s.reason || "-",
      s.category === "AutoBreak" ? Number(s.duration || 0).toFixed(1) : s.duration || 0
    ]);

    autoTable(doc, {
      head: [["Category", "Start Time", "End Time", "Reason", "Duration (min)"]],
      body: body,
      startY: 120,
      margin: { left: 40, right: 40 },
      styles: { fontSize: 10, cellPadding: 6, halign: "center", valign: "middle" },
      columnStyles: { 0: { cellWidth: 90 }, 3: { halign: "left", cellWidth: 420, overflow: "linebreak" } },
      headStyles: { fillColor: brand, textColor: 255, halign: "center" },
      theme: "striped",
      alternateRowStyles: { fillColor: [248, 250, 252] }
    });

    const y = doc.lastAutoTable.finalY + 18;
    const boxW = 190;
    const boxH = 68;
    const gap = 16;
    const blocks = [
      ["Total Time", Number(sums.total).toFixed(1) + " min", [234, 179, 8]],
      ["Official Break Time", sums.official + " min", [59, 130, 246]],
      ["Namaz Break Time", sums.namaz + " min", [16, 185, 129]],
      ["General Break Time", sums.general + " min", sums.general > effectiveGeneralLimit() ? [239, 68, 68] : [107, 114, 128]]
    ];
    blocks.forEach((b, i) => {
      const x = 40 + i * (boxW + gap);
      doc.setDrawColor(229, 231, 235);
      doc.setFillColor(247, 249, 251);
      doc.roundedRect(x, y, boxW, boxH, 8, 8, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(b[2][0], b[2][1], b[2][2]);
      doc.text(b[0], x + 12, y + 22);
      doc.setFontSize(16);
      doc.setTextColor(17, 24, 39);
      doc.text(b[1], x + 12, y + 46);
    });

    doc.save("daily_" + slugName(empName) + "_" + day + ".pdf");
  }

  function summarizeReasonsByCategory(sessions) {
    const ORDER = ["General", "Namaz", "Official", "AutoBreak"];
    const OTHER = "Other";
    const buckets = new Map(ORDER.map((c) => [c, []]));
    const seenPerCat = new Map(ORDER.map((c) => [c, new Set()]));
    if (!buckets.has(OTHER)) buckets.set(OTHER, []);
    if (!seenPerCat.has(OTHER)) seenPerCat.set(OTHER, new Set());

    for (const s of sessions) {
      const cat = ORDER.indexOf(s && s.category) >= 0 ? s.category : OTHER;
      const reason = (s && s.reason ? s.reason : "").trim();
      if (!reason) continue;
      const seen = seenPerCat.get(cat);
      const key = reason.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        buckets.get(cat).push(reason);
      }
    }

    const parts = [];
    const makeBlock = (cat, arr) => (arr && arr.length ? cat + ": " + arr.join(" | ") : null);
    for (const cat of ORDER.concat([OTHER])) {
      const block = makeBlock(cat, buckets.get(cat));
      if (block) parts.push(block);
      if ((parts.join(" • ")).length > 500) break;
    }
    return parts.length ? parts.join(" • ") : "-";
  }

  function collectReportRowsWithReasons() {
    const rows = [];
    const elist = filtered.length ? filtered : [];
    for (const emp of elist) {
      const sessions = sessionsForEmp(emp);
      const sums = calcTotals(sessions);
      rows.push([
        emp.emp_id || emp.id || emp._id,
        emp.name || "-",
        emp.department || "-",
        Number(sums.total.toFixed(1)),
        sums.general,
        sums.namaz,
        sums.official,
        Number(sums.autobreak).toFixed(1),
        summarizeReasonsByCategory(sessions)
      ]);
    }
    return rows;
  }

  function downloadPDFDailySummaryAll() {
    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });

    const pageW = doc.internal.pageSize.getWidth();
    const gray600 = "#4b5563";
    const brand = [31, 41, 55];
    const accent = [99, 102, 241];

    const label = mode === "day" ? day : from + " → " + to;
    const title = mode === "day" ? "Daily Idle Report" : mode === "month" ? "Monthly Idle Report" : "Custom Range Idle Report";

    const gDaily = config.generalIdleLimit == null ? 60 : config.generalIdleLimit;
    const nDaily = config.namazLimit == null ? 50 : config.namazLimit;
    const gCap = effectiveGeneralLimit();
    const nCap = effectiveNamazLimit();
    const limitsText =
      mode === "month"
        ? "Limits: General " + gDaily + "m/day (cap " + gCap + "m), Namaz " + nDaily + "m/day (cap " + nCap + "m)"
        : "Limits: General " + gDaily + "m/day, Namaz " + nDaily + "m/day";

    const header = () => {
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
      doc.text("Range: " + label + "   |   TZ: " + ZONE + "   |   " + limitsText, pageW - 40, 26, { align: "right" });
    };
    const footer = (data) => {
      doc.setFontSize(9);
      doc.setTextColor(gray600);
      doc.text("Page " + data.pageNumber, pageW / 2, doc.internal.pageSize.getHeight() - 14, { align: "center" });
    };

    const body = collectReportRowsWithReasons();
    const headers = [
      "Emp ID", "Name", "Dept", "Total (m)", "General (m)", "Namaz (m)", "Official (m)", "Auto (m)", "Reasons (by\nCategory)"
    ];

    autoTable(doc, {
      head: [headers],
      body: body,
      margin: { left: 28, right: 28, top: 70, bottom: 28 },
      tableWidth: "auto",
      styles: { fontSize: 9, cellPadding: { top: 4, right: 4, bottom: 4, left: 4 }, halign: "center", valign: "middle" },
      headStyles: { fillColor: accent, textColor: 255, halign: "center", fontStyle: "bold", overflow: "linebreak" },
      theme: "striped",
      striped: true,
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { halign: "left", cellWidth: 130 },
        2: { halign: "left", cellWidth: 100 },
        3: { cellWidth: 60 },
        4: { cellWidth: 60 },
        5: { cellWidth: 60 },
        6: { cellWidth: 60 },
        7: { cellWidth: 60 },
        8: { cellWidth: "auto", overflow: "linebreak", minCellWidth: 220 }
      },
      didParseCell: (data) => {
        if (data.section === "body" && [3, 4, 5, 6, 7].indexOf(data.column.index) >= 0) {
          data.cell.styles.fontStyle = "bold";
        }
        if (data.section === "body") {
          if (data.column.index === 4) {
            const v = Number(data.cell.raw || 0);
            if (v > gCap) { data.cell.styles.fillColor = [255, 237, 213]; data.cell.styles.textColor = [194, 65, 12]; }
          }
          if (data.column.index === 5) {
            const v = Number(data.cell.raw || 0);
            if (v > nCap) { data.cell.styles.fillColor = [254, 226, 226]; data.cell.styles.textColor = [220, 38, 38]; }
          }
        }
      },
      didDrawPage: (data) => { header(); footer(data); },
      startY: 84
    });

    const fileLabel = mode === "day" ? day : from.split("-").join("") + "_" + to.split("-").join("");
    doc.save("employee_idle_report_" + fileLabel + ".pdf");
  }

  function collectMonthlyRows(employeesList) {
    const rows = [];
    for (const emp of employeesList) {
      const sessions = sessionsForEmp(emp);
      const sums = calcTotals(sessions);

      const days = uniqueDays(sessions).size || getMonthDays();
      const shiftSpan = shiftSpanMinutes(emp.shift_start, emp.shift_end);

      const workMin = Math.max(0, shiftSpan * days - sums.total);

      const gCap = effectiveGeneralLimit(days);
      const nCap = effectiveNamazLimit(days);

      rows.push([
        emp.emp_id || emp.id || emp._id,
        emp.name || "-",
        emp.department || "-",
        toH1(workMin),
        toH1(sums.general),
        toH1(sums.namaz),
        toH1(sums.official),
        toH1(sums.autobreak),
        sums.general > gCap ? "+" + toH1(sums.general - gCap) + "h" : "-",
        sums.namaz > nCap ? "+" + toH1(sums.namaz - nCap) + "h" : "-",
        days
      ]);
    }
    return rows;
  }

  function downloadPDFMonthlyTotals(allOrSelected = "all") {
    if (mode !== "month") return;
    const list = allOrSelected === "all" ? filtered : (employeeFilter === "all" ? [] : filtered.slice(0, 1));
    if (!list.length) return;

    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const accent = [16, 185, 129];
    const header = () => {
      doc.setFillColor(31, 41, 55);
      doc.rect(0, 0, pageW, 64, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor("#fff");
      doc.text("Monthly Totals — " + (allOrSelected === "all" ? "All Employees" : cleanName(list[0].name)), 40, 26);
      doc.setFont("helvetica", "normal"); doc.setFontSize(11);
      doc.text(
        "Range: " + from + " → " + to +
          "   |   Caps/day: General " + (config.generalIdleLimit == null ? 60 : config.generalIdleLimit) +
          "m, Namaz " + (config.namazLimit == null ? 50 : config.namazLimit) +
          "m   |   TZ: " + ZONE,
        40,
        46
      );
    };
    header();

    const body = collectMonthlyRows(list);
    const headers = [
      "Emp ID","Name","Dept","Working (h)","General (h)","Namaz (h)","Official (h)","Auto (h)","Gen Exceed","Namaz Exceed","Active Days"
    ];

    autoTable(doc, {
      head: [headers],
      body: body,
      margin: { left: 40, right: 40, top: 70 },
      styles: { fontSize: 10, cellPadding: 6, halign: "center", valign: "middle" },
      headStyles: { fillColor: accent, textColor: 255, halign: "center", fontStyle: "bold" },
      columnStyles: {
        1: { halign: "left", cellWidth: 140 },
        2: { halign: "left", cellWidth: 120 }
      },
    });

    const fname = allOrSelected === "all"
      ? "monthly_totals_" + from.split("-").join("") + "_" + to.split("-").join("") + ".pdf"
      : "monthly_" + slugName(list[0].name) + "_" + from.split("-").join("") + "_" + to.split("-").join("") + ".pdf";
    doc.save(fname);
  }

  function downloadXLS() {
    const headers = [
      "Employee ID","Name","Department","Total Idle (min)","General (min)",
      "Namaz (min)","Official (min)","AutoBreak (min)","Reasons (by Category)"
    ];
    const rows = collectReportRowsWithReasons();
    const label = mode === "day" ? day : from + "_to_" + to;
    downloadXls("employee_idle_report_" + label + ".xls", headers, rows);
  }

  const isSingleSelected = employeeFilter !== "all" && filtered.length === 1;
  const selectedName = isSingleSelected ? cleanName(filtered[0] && filtered[0].name) : "";
  const quickLabel =
    mode === "day"
      ? (isSingleSelected ? "Daily — " + selectedName : "Daily — All Employees")
      : mode === "month"
      ? (isSingleSelected ? "Monthly — " + selectedName : "Monthly — All Employees")
      : (isSingleSelected ? "Range — " + selectedName : "Range — All Employees");

  function handleQuickDownload() {
    if (mode === "day") {
      return isSingleSelected ? downloadPDFDailyDetailSelected() : downloadPDFDailySummaryAll();
    }
    if (mode === "month") {
      return isSingleSelected ? downloadPDFMonthlyTotals("one") : downloadPDFMonthlyTotals("all");
    }
    return downloadPDFDailySummaryAll();
  }

  const gDaily = config.generalIdleLimit == null ? 60 : config.generalIdleLimit;
  const nDaily = config.namazLimit == null ? 50 : config.namazLimit;
  const headerGradient = "linear-gradient(90deg, " + theme.palette.primary.main + ", " + theme.palette.success.main + ")";

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

        <Button
          variant="contained"
          startIcon={<Download />}
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          {isSingleSelected ? "Download: " + selectedName : "Download Report"}
        </Button>
        <Menu anchorEl={anchorEl} open={openMenu} onClose={() => setAnchorEl(null)}>
          <MenuItem onClick={() => {
            setAnchorEl(null);
            if (confirmDownload(quickLabel)) handleQuickDownload();
          }}>
            {"Quick — " + quickLabel}
          </MenuItem>

          <MenuItem onClick={() => {
            setAnchorEl(null);
            if (confirmDownload("Daily — All Employees")) downloadPDFDailySummaryAll();
          }}>
            Daily — All Employees
          </MenuItem>
          <MenuItem
            disabled={!(mode === "day" && isSingleSelected)}
            onClick={() => {
              setAnchorEl(null);
              if (confirmDownload("Daily — " + (selectedName || "Selected Employee"))) downloadPDFDailyDetailSelected();
            }}
          >
            {"Daily — " + (selectedName || "Selected Employee")}
          </MenuItem>

          <MenuItem
            disabled={mode !== "month"}
            onClick={() => {
              setAnchorEl(null);
              if (confirmDownload("Monthly — All Employees")) downloadPDFMonthlyTotals("all");
            }}
          >
            Monthly — All Employees
          </MenuItem>
          <MenuItem
            disabled={!(mode === "month" && isSingleSelected)}
            onClick={() => {
              setAnchorEl(null);
              if (confirmDownload("Monthly — " + (selectedName || "Selected Employee"))) downloadPDFMonthlyTotals("one");
            }}
          >
            {"Monthly — " + (selectedName || "Selected Employee")}
          </MenuItem>

          <MenuItem onClick={() => {
            setAnchorEl(null);
            if (confirmDownload("Excel — Summary")) downloadXLS();
          }}>
            Excel — Summary (with Reasons)
          </MenuItem>
        </Menu>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        {mode === "day" ? "Range: " + day : "Range: " + from + " → " + to}
        &nbsp; | &nbsp; {isSingleSelected ? "Employee: " + selectedName : "All Employees"}
        &nbsp; | &nbsp; General: {gDaily}m/day • Namaz: {nDaily}m/day
        &nbsp; | &nbsp; TZ: {ZONE}
      </Typography>

      <TableContainer component={Paper} elevation={5} sx={{ borderRadius: "18px" }}>
        <Table>
          <TableHead>
            <TableRow sx={{ background: headerGradient }}>
              <TableCell sx={{ color: "#fff", fontWeight: 600 }}>Name</TableCell>
              <TableCell sx={{ color: "#fff", fontWeight: 600 }}>Department</TableCell>
              <TableCell sx={{ color: "#fff", fontWeight: 600 }}>Shift</TableCell>
              <TableCell sx={{ color: "#fff", fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ color: "#fff", fontWeight: 600 }} align="center">Sessions / Actions</TableCell>
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
                categoryColors={config.categoryColors}
                defaultOpen={filtered.length === 1}
                allowUpdateDelete={allowUpdateDelete}
                onEdit={onEditOpen}
                onDelete={onDeleteEmp}
                onEditSession={onEditSessionOpen}
                onCloseSession={onCloseSessionNow}
                onDeleteSession={onDeleteSessionNow} // << NEW
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Update Employee Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Update Employee</DialogTitle>
        <DialogContent dividers>
          <Box mt={1} display="grid" gridTemplateColumns="1fr 1fr" gap={2}>
            <TextField
              label="Name"
              value={editValues.name}
              onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Department"
              value={editValues.department}
              onChange={(e) => setEditValues((v) => ({ ...v, department: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Shift Start (e.g. 6:00 PM or 18:00)"
              value={editValues.shift_start}
              onChange={(e) => setEditValues((v) => ({ ...v, shift_start: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Shift End (e.g. 3:00 AM or 03:00)"
              value={editValues.shift_end}
              onChange={(e) => setEditValues((v) => ({ ...v, shift_end: e.target.value }))}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={onEditSave}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Activity Dialog (Idle) — with time fields */}
      <Dialog open={editSessOpen} onClose={() => setEditSessOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Update Activity Log</DialogTitle>
        <DialogContent dividers>
          <Box mt={1} display="grid" gridTemplateColumns="1fr 1fr" gap={2}>
            <FormControl fullWidth>
              <InputLabel id="cat-label">Category</InputLabel>
              <Select
                labelId="cat-label"
                label="Category"
                value={editSessValues.category}
                onChange={(e) => setEditSessValues((v) => ({ ...v, category: e.target.value }))}
              >
                <MenuItem value="General">General</MenuItem>
                <MenuItem value="Official">Official</MenuItem>
                <MenuItem value="Namaz">Namaz</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Reason"
              value={editSessValues.reason}
              onChange={(e) => setEditSessValues((v) => ({ ...v, reason: e.target.value }))}
              fullWidth
            />

            <TextField
              label="Start Date"
              type="date"
              value={editSessValues.startDate}
              onChange={(e) => setEditSessValues((v) => ({ ...v, startDate: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Start Time (HH:mm or HH:mm:ss)"
              type="time"
              value={editSessValues.startTime}
              onChange={(e) => setEditSessValues((v) => ({ ...v, startTime: e.target.value }))}
              inputProps={{ step: 1 }}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />

            <TextField
              label="End Date (optional)"
              type="date"
              value={editSessValues.endDate}
              onChange={(e) => setEditSessValues((v) => ({ ...v, endDate: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="End Time (optional)"
              type="time"
              value={editSessValues.endTime}
              onChange={(e) => setEditSessValues((v) => ({ ...v, endTime: e.target.value }))}
              inputProps={{ step: 1 }}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            Times are interpreted from your local browser time. Leave end fields blank for ongoing.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditSessOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={onEditSessionSave}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}


