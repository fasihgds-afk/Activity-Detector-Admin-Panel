/* eslint-disable no-console */
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  Button,
  Menu,
  MenuItem,
  Select,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Alert,
  Skeleton,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import {
  KeyboardArrowDown,
  KeyboardArrowUp,
  AccessTime,
  Download,
  Edit,
  Delete,
  StopCircle,
} from "@mui/icons-material";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import api from "../api"; // ✅ unified axios instance (adds Bearer token)
import { getRole, getSelfEmpId } from "../auth";

const ZONE = "Asia/Karachi";
const DEFAULT_LIMIT = 100;

const pad = (n) => (n < 10 ? "0" + n : "" + n);

function cleanName(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}
function slugName(s) {
  return (
    cleanName(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "employee"
  );
}
function ymdInAsiaFromISO(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(d); // YYYY-MM-DD
  } catch {
    return null;
  }
}
function currentShiftYmd() {
  const fmtYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const hourFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    hour: "2-digit",
    hourCycle: "h23",
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
  return dt.getUTCFullYear() + "-" + pad(dt.getUTCMonth() + 1) + "-" + pad(dt.getUTCDate());
}
function monthBounds(ym /* "YYYY-MM" */) {
  const [y, m] = ym.split("-").map(Number);
  const from = `${y}-${pad(m)}-01`;
  const to = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
  return { from, to };
}
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

function hmToMinutes(hhmm) {
  const parts = (hhmm || "").split(":").map(Number);
  const h = parts[0];
  const m = parts[1];
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
}
function karachiNowHM() {
  const fmtH = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", hourCycle: "h23" });
  const fmtM = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, minute: "2-digit" });
  return { h: parseInt(fmtH.format(new Date()), 10), m: parseInt(fmtM.format(new Date()), 10) };
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
  if (raw === "active" || raw === "online" || raw === "working") return { label: "Active", color: "success" };
  if (raw === "idle") {
    if (onCat) {
      const color =
        onCat === "Official" ? "info" : onCat === "Namaz" ? "success" : onCat === "AutoBreak" ? "error" : "warning";
      return { label: "On Break — " + onCat, color };
    }
    return null;
  }
  if (raw === "break" || raw === "on break" || raw === "paused")
    return { label: onCat ? "On Break — " + onCat : "On Break", color: "warning" };
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
    if (parts.join(" • ").length > 500) break;
  }
  return parts.length ? parts.join(" • ") : "-";
}

function EmployeeRow({
  emp,
  dayMode,
  pickedDay,
  from,
  to,
  categoryColors,
  defaultOpen = false,
  canManage = false,
  onChanged = () => {},
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(Boolean(defaultOpen));

  // === edit dialog state ===
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editReason, setEditReason] = useState("");
  const [editCategory, setEditCategory] = useState("");

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
        (emp.shift_start || "?") +
        " – " +
        (emp.shift_end || "?");
      if (!map[label]) map[label] = [];
      map[label].push(s);
    }
    return map;
  }, [all, emp.shift_start, emp.shift_end, dayMode, pickedDay, from, to]);

  const status = getStatusForEmp(emp, {
    mode: dayMode,
    day: pickedDay,
    from,
    to,
  });

  const trackBorder = alpha(theme.palette.divider, 0.4);
  const cardBase = (col, opLight = 0.12, opDark = 0.18) => alpha(col, theme.palette.mode === "dark" ? opDark : opLight);

  // --- actions ---
  const startEdit = (s) => {
    setEditTarget(s);
    setEditReason(s?.reason || "");
    setEditCategory(s?.category || "");
    setEditOpen(true);
  };
  const saveEdit = async () => {
    if (!editTarget?._id) return setEditOpen(false);
    try {
      await api.put(`/activities/${editTarget._id}`, {
        reason: editReason,
        category: editCategory || undefined,
      });
      setEditOpen(false);
      onChanged();
    } catch (e) {
      alert(e?.response?.data?.error || "Failed to update log");
    }
  };
  const endNow = async (s) => {
    if (!s?._id) return;
    if (!window.confirm("End this idle session now?")) return;
    try {
      await api.put(`/activities/${s._id}/end`);
      onChanged();
    } catch (e) {
      alert(e?.response?.data?.error || "Failed to close log");
    }
  };
  const deleteLog = async (s) => {
    if (!s?._id) return;
    if (!window.confirm("Delete this activity log? This cannot be undone.")) return;
    try {
      await api.delete(`/activities/${s._id}`);
      onChanged();
    } catch (e) {
      alert(e?.response?.data?.error || "Failed to delete log");
    }
  };

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
          <Tooltip title="Show Sessions">
            <IconButton onClick={() => setOpen((x) => !x)}>{open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}</IconButton>
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
                const totalBg = cardBase(theme.palette.warning.main);
                const officialBg = cardBase(theme.palette.info.main);
                const namazBg = cardBase(theme.palette.success.main);
                const generalBg = cardBase(theme.palette.warning.main);
                return (
                  <Card
                    key={key}
                    sx={{ mb: 3, borderRadius: 3, boxShadow: 3, border: "1px solid", borderColor: trackBorder }}
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
                            {canManage && <TableCell align="center">Actions</TableCell>}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {sessions.map((s, i) => {
                            const isAuto = s.kind === "AutoBreak" || s.category === "AutoBreak";
                            const canAct = canManage && !isAuto;
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
                                          : "grey.600"),
                                    }}
                                  />
                                </TableCell>
                                <TableCell>{s.start_time_local || "-"}</TableCell>
                                <TableCell>{s.end_time_local || "Ongoing"}</TableCell>
                                <TableCell
                                  sx={{
                                    whiteSpace: "normal",
                                    overflowWrap: "anywhere",
                                    wordBreak: "break-word",
                                    maxWidth: 520,
                                    lineHeight: 1.35,
                                    py: 1,
                                  }}
                                >
                                  {s.reason || (isAuto ? "System Power Off / Startup" : "-")}
                                </TableCell>
                                <TableCell>
                                  {isAuto ? Number(s.duration || 0).toFixed(1) + " min" : (s.duration || 0) + " min"}
                                </TableCell>
                                {canManage && (
                                  <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
                                    <Tooltip title="Edit reason/category">
                                      <span>
                                        <IconButton size="small" disabled={!canAct} onClick={() => startEdit(s)}>
                                          <Edit fontSize="small" />
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                    <Tooltip title="End now">
                                      <span>
                                        <IconButton
                                          size="small"
                                          disabled={!canAct || Boolean(s.end_time_local && s.end_time_local !== "Ongoing")}
                                          onClick={() => endNow(s)}
                                        >
                                          <StopCircle fontSize="small" />
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                    <Tooltip title="Delete log">
                                      <span>
                                        <IconButton size="small" color="error" disabled={!canAct} onClick={() => deleteLog(s)}>
                                          <Delete fontSize="small" />
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>

                      {/* Summary cards */}
                      <Box mt={2}>
                        <Grid container spacing={2}>
                          <Grid item xs={12} md={3}>
                            <Card
                              sx={{
                                p: 2,
                                borderRadius: 3,
                                bgcolor: totalBg,
                                border: "1px solid",
                                borderColor: trackBorder,
                              }}
                            >
                              <Typography fontWeight={700} color="warning.main">
                                Total Time
                              </Typography>
                              <Typography variant="h6" fontWeight={800}>
                                {Number(sums.total).toFixed(1)} min
                              </Typography>
                            </Card>
                          </Grid>
                          <Grid item xs={12} md={3}>
                            <Card
                              sx={{
                                p: 2,
                                borderRadius: 3,
                                bgcolor: officialBg,
                                border: "1px solid",
                                borderColor: trackBorder,
                              }}
                            >
                              <Typography fontWeight={700} color="info.main">
                                Official Break Time
                              </Typography>
                              <Typography variant="h6" fontWeight={800}>
                                {sums.official} min
                              </Typography>
                            </Card>
                          </Grid>
                          <Grid item xs={12} md={3}>
                            <Card
                              sx={{
                                p: 2,
                                borderRadius: 3,
                                bgcolor: namazBg,
                                border: "1px solid",
                                borderColor: trackBorder,
                              }}
                            >
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
                                bgcolor: generalBg,
                                border: "1px solid",
                                borderColor: trackBorder,
                              }}
                            >
                              <Typography fontWeight={700}>General Break Time</Typography>
                              <Typography variant="h6" fontWeight={800}>
                                {sums.general} min
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

      {/* Edit dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Activity Log</DialogTitle>
        <DialogContent dividers>
          <Box display="flex" gap={2} mt={1} flexDirection="column">
            <FormControl size="small">
              <InputLabel id="cat-lbl">Category</InputLabel>
              <Select
                labelId="cat-lbl"
                label="Category"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
              >
                <MenuItem value="">
                  <em>Uncategorized</em>
                </MenuItem>
                <MenuItem value="Official">Official</MenuItem>
                <MenuItem value="General">General</MenuItem>
                <MenuItem value="Namaz">Namaz</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Reason"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              multiline
              minRows={3}
            />
            {editTarget && (
              <Typography variant="caption" color="text.secondary">
                Log ID: {editTarget._id}
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveEdit}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default function Employees() {
  const theme = useTheme();
  const role = getRole(); // 'employee' | 'admin' | 'superadmin'
  const isEmployee = role === "employee";
  const canDownload = role === "admin" || role === "superadmin";
  const canManage = role === "admin" || role === "superadmin";

  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [config, setConfig] = useState({
    generalIdleLimit: 60,
    namazLimit: 50,
    categoryColors: { Official: "#3b82f6", General: "#f59e0b", Namaz: "#10b981", AutoBreak: "#ef4444" },
  });

  const [employeeFilter, setEmployeeFilter] = useState("all");

  const [mode, setMode] = useState("day");
  const [day, setDay] = useState(currentShiftYmd());
  const [month, setMonth] = useState(() => {
    const parts = currentShiftYmd().split("-");
    return parts[0] + "-" + parts[1];
  });
  const [from, setFrom] = useState(currentShiftYmd());
  const [to, setTo] = useState(currentShiftYmd());

  const [anchorEl, setAnchorEl] = useState(null);
  const openMenu = Boolean(anchorEl);

  useEffect(() => {
    if (isEmployee) setEmployeeFilter(getSelfEmpId() || "all");
  }, [isEmployee]);

  useEffect(() => {
    const t = setInterval(() => {
      if (mode !== "day") return;
      const sd = currentShiftYmd();
      setDay((d0) => (d0 !== sd ? sd : d0));
    }, 60000);
    return () => clearInterval(t);
  }, [mode]);

  const filtered = useMemo(() => {
    let list = Array.isArray(employees) ? employees : [];
    if (employeeFilter !== "all") {
      list = list.filter(
        (e) => e.emp_id === employeeFilter || e.id === employeeFilter || e._id === employeeFilter
      );
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((e) => e.name && e.name.toLowerCase().includes(s));
    }
    return list;
  }, [employees, employeeFilter, search]);

  const abortRef = useRef(null);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      setErr("");

      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      let params;
      if (mode === "day") {
        params = { from: day, to: day };
      } else if (mode === "month") {
        const { from: f, to: t } = monthBounds(month);
        params = { from: f, to: t };
      } else {
        params = { from, to };
      }
      params.limit = DEFAULT_LIMIT;

      const res = await api.get("/employees", { params, signal: ctrl.signal });
      const payload = Array.isArray(res.data) ? { employees: res.data } : res.data || {};
      const arr = Array.isArray(payload.employees) ? payload.employees : [];
      setEmployees(arr);

      const gl = payload?.settings?.general_idle_limit;
      const nl = payload?.settings?.namaz_limit;
      setConfig((c) => ({
        ...c,
        generalIdleLimit: gl ?? c.generalIdleLimit,
        namazLimit: nl ?? c.namazLimit,
        categoryColors:
          payload?.categoryColors ||
          c.categoryColors || { Official: "#3b82f6", General: "#f59e0b", Namaz: "#10b981", AutoBreak: "#ef4444" },
      }));
    } catch (e) {
      if (e.code !== "ERR_CANCELED") {
        const status = e?.response?.status;
        const msg =
          e?.response?.data?.error ||
          (status ? `HTTP ${status}` : e?.message) ||
          "Unknown error";
        console.error("Error fetching employees:", e);
        setErr(
          status === 401
            ? "Session expired or not logged in. Please sign in again."
            : `Could not load data: ${msg}`
        );
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  useEffect(() => {
    fetchEmployees();
    const id = setInterval(fetchEmployees, 60000);
    return () => {
      clearInterval(id);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [mode, day, month, from, to]);

  const isSingleSelected = employeeFilter !== "all" && filtered.length === 1;
  const selectedName = isSingleSelected ? cleanName(filtered[0] && filtered[0].name) : "";
  const quickLabel =
    mode === "day"
      ? isSingleSelected
        ? "Daily — " + selectedName
        : "Daily — All Employees"
      : mode === "month"
      ? isSingleSelected
        ? "Monthly — " + selectedName
        : "Monthly — All Employees"
      : isSingleSelected
      ? "Range — " + selectedName
      : "Range — All Employees";

  function confirmDownload(label) {
    return window.confirm("Download " + label + "?");
  }
  function inScopeSessions(emp) {
    return (emp.idle_sessions || []).filter((s) => inPickedRange(s.shiftDate, mode, day, from, to, s.idle_start));
  }
  function uniqueDays(sessions) {
    const set = new Set();
    for (const s of sessions) {
      const d = s.shiftDate || ymdInAsiaFromISO(s.idle_start);
      if (d) set.add(d);
    }
    return set;
  }
  function toH1(min) {
    return ((min || 0) / 60).toFixed(1);
  }
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
  function collectReportRowsWithReasons() {
    const rows = [];
    const elist = filtered.length ? filtered : [];
    for (const emp of elist) {
      const sessions = inScopeSessions(emp);
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
        summarizeReasonsByCategory(sessions),
      ]);
    }
    return rows;
  }

  function downloadPDFDailySummaryAll() {
    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const brand = [31, 41, 55];
    const accent = [99, 102, 241];
    const label = mode === "day" ? day : from + " → " + to;
    const title =
      mode === "day" ? "Daily Idle Report" : mode === "month" ? "Monthly Idle Report" : "Custom Range Idle Report";
    const gDaily = config.generalIdleLimit == null ? 60 : config.generalIdleLimit;
    const nDaily = config.namazLimit == null ? 50 : config.namazLimit;
    const gCap = effectiveGeneralLimit();
    const nCap = effectiveNamazLimit();
    const limitsText =
      mode === "month"
        ? `Limits: General ${gDaily}m/day (cap ${gCap}m), Namaz ${nDaily}m/day (cap ${nCap}m)`
        : `Limits: General ${gDaily}m/day, Namaz ${nDaily}m/day`;

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
      doc.text("Range: " + label + " | TZ: " + ZONE + " | " + limitsText, pageW - 40, 26, { align: "right" });
    };

    const body = collectReportRowsWithReasons();
    const headers = [
      "Emp ID",
      "Name",
      "Dept",
      "Total (m)",
      "General (m)",
      "Namaz (m)",
      "Official (m)",
      "Auto (m)",
      "Reasons (by Category)",
    ];

    autoTable(doc, {
      head: [headers],
      body,
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
        8: { cellWidth: "auto", overflow: "linebreak", minCellWidth: 220 },
      },
      didDrawPage: () => header(),
    });

    const fileLabel = mode === "day" ? day : from.split("-").join("") + "_" + to.split("-").join("");
    doc.save("employee_idle_report_" + fileLabel + ".pdf");
  }

  function downloadPDFDailyDetailSelected() {
    if (employeeFilter === "all" || !filtered.length || mode !== "day") return;
    const emp = filtered[0];
    const empName = cleanName(emp.name);
    const sessions = inScopeSessions(emp).sort((a, b) => new Date(a.idle_start || 0) - new Date(b.idle_start || 0));
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
      "Dept: " + (emp.department || "-") + " Shift: " + emp.shift_start + " – " + emp.shift_end + " Day: " + day + " TZ: " + ZONE,
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
      s.category === "AutoBreak" ? Number(s.duration || 0).toFixed(1) : s.duration || 0,
    ]);

    autoTable(doc, {
      head: [["Category", "Start Time", "End Time", "Reason", "Duration (min)"]],
      body,
      startY: 120,
      margin: { left: 40, right: 40 },
      styles: { fontSize: 10, cellPadding: 6, halign: "center", valign: "middle" },
      columnStyles: { 0: { cellWidth: 90 }, 3: { halign: "left", cellWidth: 420, overflow: "linebreak" } },
      headStyles: { fillColor: brand, textColor: 255, halign: "center" },
      theme: "striped",
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    const y = (doc.lastAutoTable?.finalY || 120) + 18;
    const boxW = 190;
    const boxH = 68;
    const gap = 16;
    const blocks = [
      ["Total Time", Number(sums.total).toFixed(1) + " min", [234, 179, 8]],
      ["Official Break Time", sums.official + " min", [59, 130, 246]],
      ["Namaz Break Time", sums.namaz + " min", [16, 185, 129]],
      ["General Break Time", sums.general + " min", [107, 114, 128]],
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

  function downloadPDFMonthlyTotals(allOrSelected = "all") {
    if (mode !== "month") return;
    const list = allOrSelected === "all" ? filtered : employeeFilter === "all" ? [] : filtered.slice(0, 1);
    if (!list.length) return;

    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const accent = [16, 185, 129];

    const { from: mf, to: mt } = monthBounds(month);

    const header = () => {
      doc.setFillColor(31, 41, 55);
      doc.rect(0, 0, pageW, 64, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor("#fff");
      doc.text("Monthly Totals — " + (allOrSelected === "all" ? "All Employees" : cleanName(list[0].name)), 40, 26);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(
        "Range: " +
          mf +
          " → " +
          mt +
          " | Caps/day: General " +
          (config.generalIdleLimit ?? 60) +
          "m, Namaz " +
          (config.namazLimit ?? 50) +
          "m | TZ: " +
          ZONE,
        40,
        46
      );
    };

    header();

    const rows = [];
    for (const emp of list) {
      const sessions = inScopeSessions(emp);
      const sums = calcTotals(sessions);
      const days =
        uniqueDays(sessions).size ||
        new Date(parseInt(month.slice(0, 4), 10), parseInt(month.slice(5), 10), 0).getDate();
      const shiftSpan = (() => {
        const s = hmToMinutes(emp.shift_start);
        const e = hmToMinutes(emp.shift_end);
        if (s == null || e == null) return 9 * 60;
        return e >= s ? e - s : 24 * 60 - s + e;
      })();
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
        days,
      ]);
    }

    const headers = [
      "Emp ID",
      "Name",
      "Dept",
      "Working (h)",
      "General (h)",
      "Namaz (h)",
      "Official (h)",
      "Auto (h)",
      "Gen Exceed",
      "Namaz Exceed",
      "Active Days",
    ];

    autoTable(doc, {
      head: [headers],
      body: rows,
      margin: { left: 40, right: 40, top: 70 },
      styles: { fontSize: 10, cellPadding: 6, halign: "center", valign: "middle" },
      headStyles: { fillColor: accent, textColor: 255, halign: "center", fontStyle: "bold" },
      columnStyles: { 1: { halign: "left", cellWidth: 140 }, 2: { halign: "left", cellWidth: 120 } },
    });

    const fname =
      allOrSelected === "all"
        ? "monthly_totals_" + mf.split("-").join("") + "_" + mt.split("-").join("") + ".pdf"
        : "monthly_" + slugName(list[0].name) + "_" + mf.split("-").join("") + "_" + mt.split("-").join("") + ".pdf";

    doc.save(fname);
  }

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
            const base = "padding:8px;border:1px solid #e5e7eb;text-align:center;vertical-align:middle";
            const wrap = /reason/i.test(headers[i]) ? "white-space:normal;max-width:520px" : "white-space:nowrap";
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
      "Reasons (by Category)",
    ];
    const rows = collectReportRowsWithReasons();
    const label = mode === "day" ? day : from + "_to_" + to;
    downloadXls("employee_idle_report_" + label + ".xls", headers, rows);
  }

  function handleQuickDownload() {
    if (mode === "day") {
      return isSingleSelected ? downloadPDFDailyDetailSelected() : downloadPDFDailySummaryAll();
    }
    if (mode === "month") {
      return isSingleSelected ? downloadPDFMonthlyTotals("one") : downloadPDFMonthlyTotals("all");
    }
    return downloadPDFDailySummaryAll();
  }

  const headerGradient =
    "linear-gradient(90deg, " + theme.palette.primary.main + ", " + theme.palette.success.main + ")";

  const skeletonRow = (
    <TableRow>
      <TableCell colSpan={5}>
        <Box display="flex" gap={2} alignItems="center">
          <Skeleton variant="circular" width={40} height={40} />
          <Box flex={1}>
            <Skeleton variant="text" width={220} height={24} />
            <Skeleton variant="text" width={140} height={18} />
          </Box>
        </Box>
      </TableCell>
    </TableRow>
  );

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
          disabled={isEmployee}
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
            onChange={(e) => setDay(e.target.value)}
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
        {canDownload && (
          <>
            <Button variant="contained" startIcon={<Download />} onClick={(e) => setAnchorEl(e.currentTarget)}>
              {isSingleSelected ? "Download: " + selectedName : "Download Report"}
            </Button>
            <Menu anchorEl={anchorEl} open={openMenu} onClose={() => setAnchorEl(null)}>
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  if (confirmDownload(quickLabel)) handleQuickDownload();
                }}
              >
                {"Quick — " + quickLabel}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  if (confirmDownload("Daily — All Employees")) downloadPDFDailySummaryAll();
                }}
              >
                Daily — All Employees
              </MenuItem>
              <MenuItem
                disabled={!(mode === "day" && isSingleSelected)}
                onClick={() => {
                  setAnchorEl(null);
                  if (confirmDownload("Daily — " + (selectedName || "Selected Employee")))
                    downloadPDFDailyDetailSelected();
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
                  if (confirmDownload("Monthly — " + (selectedName || "Selected Employee")))
                    downloadPDFMonthlyTotals("one");
                }}
              >
                {"Monthly — " + (selectedName || "Selected Employee")}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  if (confirmDownload("Excel — Summary")) downloadXLS();
                }}
              >
                Excel — Summary (with Reasons)
              </MenuItem>
            </Menu>
          </>
        )}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        {mode === "day" ? "Range: " + day : "Range: " + from + " → " + to} &nbsp; | &nbsp;
        {employeeFilter !== "all" ? "Employee: " + selectedName : "All Employees"} &nbsp; | &nbsp;
        General: {config.generalIdleLimit ?? 60}m/day • Namaz: {config.namazLimit ?? 50}m/day &nbsp; | &nbsp; TZ: {ZONE}
      </Typography>

      {err && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {err}
        </Alert>
      )}

      <TableContainer component={Paper} elevation={5} sx={{ borderRadius: "18px" }}>
        <Table>
          <TableHead>
            <TableRow sx={{ background: headerGradient }}>
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
            {loading
              ? [skeletonRow, skeletonRow, skeletonRow, skeletonRow]
              : filtered.map((emp) => (
                  <EmployeeRow
                    key={emp.emp_id || emp.id || emp._id}
                    emp={emp}
                    dayMode={mode}
                    pickedDay={day}
                    from={from}
                    to={to}
                    categoryColors={config.categoryColors}
                    defaultOpen={filtered.length === 1}
                    canManage={canManage}
                    onChanged={fetchEmployees}
                  />
                ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}



