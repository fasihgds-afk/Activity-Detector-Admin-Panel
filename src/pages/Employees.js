/* eslint-disable no-console */
// src/pages/Employees.jsx
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
  Alert,
  Skeleton,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import {
  KeyboardArrowDown,
  KeyboardArrowUp,
  AccessTime,
  Download,
  EditOutlined,
  DeleteOutline,
  Close,
  Save,
  Flag,
  Refresh,
} from "@mui/icons-material";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import api from "../api";
import { getRole, getSelfEmpId } from "../auth";

const ZONE = "Asia/Karachi";
const DEFAULT_LIMIT = 100;

/* ===== requested caps ===== */
const CAP_GENERAL_DAY = 60;
const CAP_NAMAZ_DAY = 40;

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
  return (
    dt.getUTCFullYear() +
    "-" +
    pad(dt.getUTCMonth() + 1) +
    "-" +
    pad(dt.getUTCDate())
  );
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
function groupByDaySums(sessions) {
  // returns Map<YYYY-MM-DD, {general, namaz, official, autobreak, total}>
  const map = new Map();
  for (const s of sessions) {
    const d =
      s.shiftDate || ymdInAsiaFromISO(s.idle_start) || ymdInAsiaFromISO(s.idle_end);
    if (!d) continue;
    if (!map.has(d)) map.set(d, { total: 0, general: 0, namaz: 0, official: 0, autobreak: 0 });
    const bucket = map.get(d);
    const mins = Number(s.duration) || 0;
    bucket.total += mins;
    if (s.category === "General") bucket.general += mins;
    else if (s.category === "Namaz") bucket.namaz += mins;
    else if (s.category === "Official") bucket.official += mins;
    else if (s.category === "AutoBreak") bucket.autobreak += mins;
  }
  return map;
}
function computeMonthlyExceedStats(sessions, month) {
  const { from, to } = monthBounds(month);
  const scoped = sessions.filter((s) =>
    inPickedRange(s.shiftDate, "month", null, from, to, s.idle_start)
  );
  const byDay = groupByDaySums(scoped);
  let daysExceededGeneral = 0;
  let daysExceededNamaz = 0;
  let overGeneral = 0;
  let overNamaz = 0;
  for (const [, sums] of byDay.entries()) {
    if (sums.general > CAP_GENERAL_DAY) {
      daysExceededGeneral += 1;
      overGeneral += sums.general - CAP_GENERAL_DAY;
    }
    if (sums.namaz > CAP_NAMAZ_DAY) {
      daysExceededNamaz += 1;
      overNamaz += sums.namaz - CAP_NAMAZ_DAY;
    }
  }
  const totals = calcTotals(scoped);
  return {
    totals,
    daysExceededGeneral,
    daysExceededNamaz,
    overGeneral, // minutes
    overNamaz, // minutes
    activeDays: byDay.size,
  };
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

/* ---------- Karachi → UTC helpers ---------- */
function isoFromKarachi(ymd /* YYYY-MM-DD */, hhmm /* HH:mm */) {
  if (!ymd || !hhmm) return null;
  const [Y, M, D] = ymd.split("-").map(Number);
  const [H, Min] = hhmm.split(":").map(Number);
  // Karachi is UTC+5 (no DST)
  const dt = new Date(Date.UTC(Y, M - 1, D, (H ?? 0) - 5, Min || 0, 0));
  return dt.toISOString();
}
function addDaysYMD(ymd, days) {
  const [Y, M, D] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(Y, M - 1, D));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
function hmToNum(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}
/** compose UTC ISO start/end from Karachi local ymd + times.
 * if end < start ⇒ end goes to next day automatically. */
function composeUtcPeriod(ymd, startHM, endHM) {
  const startIso = startHM ? isoFromKarachi(ymd, startHM) : null;
  let endIso = null;

  if (endHM === "") {
    endIso = null; // explicit clear
  } else if (endHM) {
    const s = hmToNum(startHM);
    const e = hmToNum(endHM);
    const endYmd = s != null && e != null && e < s ? addDaysYMD(ymd, 1) : ymd;
    endIso = isoFromKarachi(endYmd, endHM);
  }
  return { startIso, endIso };
}

/* ---------- Row ---------- */
function EmployeeRow({
  emp,
  dayMode,
  pickedDay,
  from,
  to,
  categoryColors,
  defaultOpen = false,
  showActions = false,
  onEdit,
  onDelete,
  canManageLogs = false,
  onEditLog,
  onDeleteLog,
  caps,
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
        (emp.shift_start || "?") +
        " – " +
        (emp.shift_end || "?");
      if (!map[label]) map[label] = [];
      map[label].push(s);
    }
    return map;
  }, [all, emp.shift_start, emp.shift_end, dayMode, pickedDay, from, to]);

  const raw = (emp && emp.latest_status ? String(emp.latest_status) : "").trim().toLowerCase();
  const sessions = Array.isArray(emp && emp.idle_sessions) ? emp.idle_sessions : [];
  const ongoing = sessions
    .filter((s) => inPickedRange(s.shiftDate, dayMode, pickedDay, from, to, s.idle_start))
    .some((s) => !s.end_time_local || s.end_time_local === "Ongoing");
  let statusLabel = "Active";
  let statusColor = "success";
  if (raw === "idle" || ongoing) {
    statusLabel = "On Break";
    statusColor = "warning";
  } else if (raw === "offline") {
    statusLabel = "Offline";
    statusColor = "default";
  }

  const trackBorder = alpha(theme.palette.divider, 0.4);
  const cardBase = (col, opLight = 0.12, opDark = 0.18) =>
    alpha(col, theme.palette.mode === "dark" ? opDark : opLight);

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
          <Chip label={statusLabel} color={statusColor} variant="filled" sx={{ fontWeight: 600 }} />
        </TableCell>
        <TableCell align="center">
          <Tooltip title="Show Sessions">
            <IconButton onClick={() => setOpen((x) => !x)}>
              {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
            </IconButton>
          </Tooltip>
        </TableCell>

        {showActions && (
          <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
            <Tooltip title="Edit employee">
              <IconButton onClick={() => onEdit(emp)} size="small">
                <EditOutlined />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete employee">
              <IconButton onClick={() => onDelete(emp)} size="small" color="error">
                <DeleteOutline />
              </IconButton>
            </Tooltip>
          </TableCell>
        )}
      </TableRow>

      <TableRow>
        <TableCell colSpan={showActions ? 6 : 5} sx={{ p: 0 }}>
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

                const genCap = caps?.general ?? CAP_GENERAL_DAY;
                const namCap = caps?.namaz ?? CAP_NAMAZ_DAY;
                const genExceededBy = Math.max(0, sums.general - genCap);
                const namExceededBy = Math.max(0, sums.namaz - namCap);

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
                            {canManageLogs && <TableCell align="right">Actions</TableCell>}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {sessions.map((s, i) => {
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
                                  {isAuto
                                    ? Number(s.duration || 0).toFixed(1) + " min"
                                    : (s.duration || 0) + " min"}
                                </TableCell>

                                {canManageLogs && !isAuto && (
                                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                                    <Tooltip title="Edit log">
                                      <IconButton size="small" onClick={() => onEditLog(s, emp)}>
                                        <EditOutlined fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete log">
                                      <IconButton size="small" color="error" onClick={() => onDeleteLog(s, emp)}>
                                        <DeleteOutline fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>

                      {/* Summary cards + exceed flags */}
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
                                borderColor: namExceededBy ? "error.main" : trackBorder,
                              }}
                            >
                              <Typography
                                fontWeight={700}
                                color={namExceededBy ? "error.main" : "success.main"}
                                display="flex"
                                alignItems="center"
                                gap={0.5}
                              >
                                Namaz Break Time {namExceededBy > 0 && <Flag sx={{ fontSize: 18 }} />}
                              </Typography>
                              <Typography variant="h6" fontWeight={800}>
                                {sums.namaz} min
                              </Typography>
                              {namExceededBy > 0 && (
                                <Typography variant="caption" color="error.main">
                                  Exceeded by {namExceededBy} min
                                </Typography>
                              )}
                            </Card>
                          </Grid>
                          <Grid item xs={12} md={3}>
                            <Card
                              sx={{
                                p: 2,
                                borderRadius: 3,
                                bgcolor: generalBg,
                                border: "1px solid",
                                borderColor: genExceededBy ? "error.main" : trackBorder,
                              }}
                            >
                              <Typography
                                fontWeight={700}
                                color={genExceededBy ? "error.main" : "warning.main"}
                                display="flex"
                                alignItems="center"
                                gap={0.5}
                              >
                                General Break Time {genExceededBy > 0 && <Flag sx={{ fontSize: 18 }} />}
                              </Typography>
                              <Typography variant="h6" fontWeight={800}>
                                {sums.general} min
                              </Typography>
                              {genExceededBy > 0 && (
                                <Typography variant="caption" color="error.main">
                                  Exceeded by {genExceededBy} min
                                </Typography>
                              )}
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

export default function Employees() {
  const theme = useTheme();
  const role = getRole(); // 'employee' | 'admin' | 'superadmin'
  const isEmployee = role === "employee";
  const isSuper = role === "superadmin";
  const canDownload = role === "admin" || role === "superadmin";
  const canManageLogs = role === "superadmin"; // admin cannot CRUD

  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [config, setConfig] = useState({
    generalIdleLimit: CAP_GENERAL_DAY,
    namazLimit: CAP_NAMAZ_DAY,
    categoryColors: { Official: "#3b82f6", General: "#f59e0b", Namaz: "#10b981", AutoBreak: "#ef4444" },
  });

 <TableBody>
  {sessions.map((s, i) => {
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
          {s.reason || "-"}
        </TableCell>
        <TableCell>
          {isAuto
            ? Number(s.duration || 0).toFixed(1) + " min"
            : (s.duration || 0) + " min"}
        </TableCell>

        {canManageLogs && !isAuto && (
          <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
            <Tooltip title="Edit log">
              <IconButton size="small" onClick={() => onEditLog(s, emp)}>
                <EditOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete log">
              <IconButton size="small" color="error" onClick={() => onDeleteLog(s, emp)}>
                <DeleteOutline fontSize="small" />
              </IconButton>
            </Tooltip>
          </TableCell>
        )}
      </TableRow>
    );
  })}
</TableBody>

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
      } else {
        const { from: f, to: t } = monthBounds(month);
        params = { from: f, to: t };
      }
      params.limit = DEFAULT_LIMIT;

      const res = await api.get("/employees", { params, signal: ctrl.signal });
      const payload = Array.isArray(res.data) ? { employees: res.data } : res.data || {};
      const arr = Array.isArray(payload.employees) ? payload.employees : [];
      setEmployees(arr);

      const gl = payload?.settings?.general_idle_limit;
      setConfig((c) => ({
        ...c,
        generalIdleLimit: gl ?? CAP_GENERAL_DAY,
        namazLimit: CAP_NAMAZ_DAY, // fixed 40m
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

  // Initial load + reload on mode/day/month change
  useEffect(() => {
    fetchEmployees();
    // no polling here
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [mode, day, month]);

  const isSingleSelected = filtered.length === 1;
  const selectedName = isSingleSelected ? cleanName(filtered[0] && filtered[0].name) : "";
  const quickLabel =
    mode === "day"
      ? isSingleSelected
        ? "Daily — " + selectedName
        : "Daily — All Employees"
      : isSingleSelected
      ? "Monthly — " + selectedName
      : "Monthly — All Employees";

  function confirmDownload(label) {
    return window.confirm("Download " + label + "?");
  }
  function inScopeSessions(emp) {
    return (emp.idle_sessions || []).filter((s) =>
      inPickedRange(s.shiftDate, mode, day, from, to, s.idle_start)
    );
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

  function collectReportRowsWithReasons() {
    const rows = [];
    const elist = filtered.length ? filtered : [];
    for (const emp of elist) {
      const sessions = inScopeSessions(emp);
      const sums = calcTotals(sessions);
      const genExceededBy = Math.max(0, sums.general - (config.generalIdleLimit ?? CAP_GENERAL_DAY));
      const namExceededBy = Math.max(0, sums.namaz - (config.namazLimit ?? CAP_NAMAZ_DAY));
      rows.push([
        emp.emp_id || emp.id || emp._id,
        emp.name || "-",
        emp.department || "-",
        Number(sums.total.toFixed(1)),
        sums.general,
        sums.namaz,
        sums.official,
        Number(sums.autobreak).toFixed(1),
        genExceededBy > 0 ? `YES (+${genExceededBy}m)` : "NO",
        namExceededBy > 0 ? `YES (+${namExceededBy}m)` : "NO",
        summarizeReasonsByCategory(sessions),
      ]);
    }
    return rows;
  }

  /* ===== PDF exporters ===== */
  function downloadPDFDailySummaryAll() {
    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const brand = [31, 41, 55];
    const accent = [99, 102, 241];
    const title = "Daily Idle Report";
    const gDaily = config.generalIdleLimit ?? CAP_GENERAL_DAY;
    const nDaily = config.namazLimit ?? CAP_NAMAZ_DAY;

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
      doc.text(`Range: ${day} | TZ: ${ZONE} | Limits: General ${gDaily}m/day, Namaz ${nDaily}m/day`, pageW - 40, 26, {
        align: "right",
      });
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
      "General Exceeded",
      "Namaz Exceeded",
      "Reasons (by Category)",
    ];

    autoTable(doc, {
      head: [headers],
      body,
      margin: { left: 28, right: 28, top: 70, bottom: 28 },
      tableWidth: "auto",
      styles: {
        fontSize: 9,
        cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
        halign: "center",
        valign: "middle",
      },
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
        8: { cellWidth: 90 },
        9: { cellWidth: 90 },
        10: { cellWidth: "auto", overflow: "linebreak", minCellWidth: 200 },
      },
      didDrawPage: () => header(),
    });

    doc.save("employee_idle_report_" + day + ".pdf");
  }

  function downloadPDFDailyDetailSelected() {
    if (!isSingleSelected || mode !== "day") return;
    const emp = filtered[0];
    const empName = cleanName(emp.name);
    const sessions = inScopeSessions(emp).sort(
      (a, b) => new Date(a.idle_start || 0) - new Date(b.idle_start || 0)
    );
    const sums = calcTotals(sessions);
    const genExceededBy = Math.max(0, sums.general - (config.generalIdleLimit ?? CAP_GENERAL_DAY));
    const namExceededBy = Math.max(0, sums.namaz - (config.namazLimit ?? CAP_NAMAZ_DAY));

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
        " Shift: " +
        emp.shift_start +
        " – " +
        emp.shift_end +
        " Day: " +
        day +
        " TZ: " +
        ZONE,
      40,
      46
    );

    doc.setFillColor(brand[0], brand[1], brand[2]);
    doc.roundedRect(40, 84, 520, 26, 6, 6, "F");
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
    const boxW = 220;
    const boxH = 78;
    const gap = 16;
    const blocks = [
      ["Total Time", Number(sums.total).toFixed(1) + " min", [234, 179, 8]],
      ["Official Break Time", sums.official + " min", [59, 130, 246]],
      [
        "Namaz Break Time" + (namExceededBy ? ` (+${namExceededBy}m over)` : ""),
        sums.namaz + " min",
        namExceededBy ? [220, 38, 38] : [16, 185, 129],
      ],
      [
        "General Break Time" + (genExceededBy ? ` (+${genExceededBy}m over)` : ""),
        sums.general + " min",
        genExceededBy ? [220, 38, 38] : [107, 114, 128],
      ],
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
      doc.text(b[1], x + 12, y + 48);
    });

    doc.save("daily_" + slugName(empName) + "_" + day + ".pdf");
  }

  function downloadPDFMonthlyTotals(allOrSelected = "all") {
    if (mode !== "month") return;
    const list = allOrSelected === "all" ? filtered : isSingleSelected ? filtered.slice(0, 1) : [];
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
      doc.text(
        "Monthly Totals — " + (allOrSelected === "all" ? "All Employees" : cleanName(list[0].name)),
        40,
        26
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(
        `Range: ${mf} → ${mt} | Caps/day: General ${config.generalIdleLimit ?? CAP_GENERAL_DAY}m, Namaz ${
          config.namazLimit ?? CAP_NAMAZ_DAY
        }m | TZ: ${ZONE}`,
        40,
        46
      );
    };

    header();

    const rows = [];
    for (const emp of list) {
      const sessions = emp.idle_sessions || [];
      const stats = computeMonthlyExceedStats(sessions, month);
      rows.push([
        emp.emp_id || emp.id || emp._id,
        emp.name || "-",
        emp.department || "-",
        toH1(stats.totals.general), // Total General (h)
        toH1(stats.totals.namaz), // Total Namaz (h)
        toH1(stats.totals.official), // Official (h)
        toH1(stats.totals.autobreak), // Auto (h)
        stats.daysExceededGeneral, // days exceeded General
        (stats.overGeneral || 0) + "m (" + toH1(stats.overGeneral) + "h)", // over General minutes + hours
        stats.daysExceededNamaz, // days exceeded Namaz
        (stats.overNamaz || 0) + "m (" + toH1(stats.overNamaz) + "h)", // over Namaz minutes + hours
        stats.activeDays,
      ]);
    }

    const headers = [
      "Emp ID",
      "Name",
      "Dept",
      "General (h)",
      "Namaz (h)",
      "Official (h)",
      "Auto (h)",
      "Days > General Cap",
      "Over-General",
      "Days > Namaz Cap",
      "Over-Namaz",
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
        : "monthly_" +
          slugName(list[0].name) +
          "_" +
          mf.split("-").join("") +
          "_" +
          mt.split("-").join("") +
          ".pdf";

    doc.save(fname);
  }

  function handleQuickDownload() {
    if (mode === "day") {
      return isSingleSelected ? downloadPDFDailyDetailSelected() : downloadPDFDailySummaryAll();
    }
    // month
    return isSingleSelected ? downloadPDFMonthlyTotals("one") : downloadPDFMonthlyTotals("all");
  }

  /* ===== employee edit/delete (superadmin) ===== */
  function openEdit(emp) {
    setEditEmp(emp);
    setEditForm({
      name: emp?.name || "",
      department: emp?.department || "",
      shift_start: emp?.shift_start || "",
      shift_end: emp?.shift_end || "",
    });
    setEditOpen(true);
  }
  async function saveEdit() {
    if (!editEmp) return;
    setBusyAction(true);
    try {
      const id = editEmp.emp_id || editEmp.id || editEmp._id;
      await api.put(`/employees/${id}`, {
        name: editForm.name,
        department: editForm.department,
        shift_start: editForm.shift_start,
        shift_end: editForm.shift_end,
      });
      setEditOpen(false);
      await fetchEmployees();
    } catch (e) {
      alert(e?.response?.data?.error || e.message || "Failed to update employee");
    } finally {
      setBusyAction(false);
    }
  }
  function openDelete(emp) {
    setEditEmp(emp);
    setDeleteOpen(true);
  }
  async function doDelete() {
    if (!editEmp) return;
    setBusyAction(true);
    try {
      const id = editEmp.emp_id || editEmp.id || editEmp._id;
      await api.delete(`/employees/${id}`);
      setDeleteOpen(false);
      await fetchEmployees();
    } catch (e) {
      alert(e?.response?.data?.error || e.message || "Failed to delete employee");
    } finally {
      setBusyAction(false);
    }
  }

  /* ===== log edit/delete (superadmin only) ===== */
  function onEditLog(s, emp) {
    // include shiftDate for backend clarity
    const dateYmd = s.shiftDate || ymdInAsiaFromISO(s.idle_start) || day;
    setLogForm({
      _id: s._id || s.id, // be tolerant
      who: emp?.name || "",
      dateYmd,
      startHM: (s.start_time_local || "").slice(0, 5),
      endHM: s.end_time_local && s.end_time_local !== "Ongoing" ? s.end_time_local.slice(0, 5) : "",
      reason: s.reason || "",
      category: s.category || "General",
      status: "Idle",
    });
    setLogEditOpen(true);
  }
  function onDeleteLog(s /*, emp*/) {
    setLogForm((f) => ({ ...f, _id: s._id || s.id }));
    setLogDeleteOpen(true);
  }

  async function saveLogEdit() {
    setBusyAction(true);
    try {
      const payload = {
        reason: logForm.reason,
        category: logForm.category,
        status: logForm.status,
        shiftDate: logForm.dateYmd, // helps some backends
      };

      const { startIso, endIso } = composeUtcPeriod(logForm.dateYmd, logForm.startHM, logForm.endHM);
      if (startIso) payload.idle_start = startIso;
      if (logForm.endHM === "") payload.idle_end = null;
      else if (endIso) payload.idle_end = endIso;

      await api.put(`/activities/${logForm._id}`, payload);
      setLogEditOpen(false);
      await fetchEmployees();
    } catch (e) {
      alert(e?.response?.data?.error || e.message || "Failed to update activity log");
    } finally {
      setBusyAction(false);
    }
  }

  async function doLogDelete() {
    setBusyAction(true);
    try {
      await api.delete(`/activities/${logForm._id}`);
      setLogDeleteOpen(false);
      await fetchEmployees();
    } catch (e) {
      alert(e?.response?.data?.error || e.message || "Failed to delete activity log");
    } finally {
      setBusyAction(false);
    }
  }

  function endLogNow() {
    const { h, m } = karachiNowHM();
    setLogForm((f) => ({ ...f, endHM: `${pad(h)}:${pad(m)}` }));
  }
  function clearEndTime() {
    setLogForm((f) => ({ ...f, endHM: "" }));
  }

  const headerGradient =
    "linear-gradient(90deg, " + theme.palette.primary.main + ", " + theme.palette.success.main + ")";

  const skeletonRow = (
    <TableRow>
      <TableCell colSpan={isSuper ? 6 : 5}>
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
          disabled={isEmployee}
        />
        <Select
          size="small"
          value={isEmployee ? (filtered[0]?.emp_id || "self") : employeeFilter}
          disabled={isEmployee}
          onChange={(e) => setEmployeeFilter(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          {!isEmployee && <MenuItem value="all">All Employees</MenuItem>}
          {employees.map((e) => (
            <MenuItem key={e.emp_id || e.id || e._id} value={e.emp_id || e.id || e._id}>
              {e.name}
            </MenuItem>
          ))}
        </Select>
        <Select size="small" value={mode} onChange={(e) => setMode(e.target.value)}>
          <MenuItem value="day">DAILY</MenuItem>
          <MenuItem value="month">MONTHLY</MenuItem>
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
        <Box flex={1} />
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={fetchEmployees}
          sx={{ mr: canDownload ? 1 : 0 }}
        >
          Refresh
        </Button>
        {canDownload && (
          <>
            <Button
              variant="contained"
              startIcon={<Download />}
              onClick={(e) => setAnchorEl(e.currentTarget)}
            >
              {isSingleSelected ? "Download: " + selectedName : "Download Report"}
            </Button>
            <Menu anchorEl={anchorEl} open={openMenu} onClose={() => setAnchorEl(null)}>
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  if (confirmDownload("Quick — " + quickLabel)) handleQuickDownload();
                }}
              >
                {"Quick — " + quickLabel}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  if (mode === "day") {
                    if (confirmDownload("Daily — All Employees")) downloadPDFDailySummaryAll();
                  } else {
                    if (confirmDownload("Monthly — All Employees")) downloadPDFMonthlyTotals("all");
                  }
                }}
              >
                {mode === "day" ? "Daily — All Employees" : "Monthly — All Employees"}
              </MenuItem>
              <MenuItem
                disabled={!isSingleSelected}
                onClick={() => {
                  setAnchorEl(null);
                  if (mode === "day") {
                    if (confirmDownload("Daily — " + (selectedName || "Selected Employee")))
                      downloadPDFDailyDetailSelected();
                  } else {
                    if (confirmDownload("Monthly — " + (selectedName || "Selected Employee")))
                      downloadPDFMonthlyTotals("one");
                  }
                }}
              >
                {mode === "day" ? `Daily — ${selectedName || "Selected Employee"}` : `Monthly — ${selectedName || "Selected Employee"}`}
              </MenuItem>
            </Menu>
          </>
        )}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        {mode === "day" ? "Range: " + day : (() => { const r = monthBounds(month); return "Range: " + r.from + " → " + r.to; })()} &nbsp; | &nbsp;
        {isEmployee
          ? "Employee: You"
          : employeeFilter !== "all"
          ? "Employee: " + selectedName
          : "All Employees"}{" "}
        &nbsp; | &nbsp; General: {config.generalIdleLimit ?? CAP_GENERAL_DAY}m/day • Namaz:{" "}
        {config.namazLimit ?? CAP_NAMAZ_DAY}m/day &nbsp; | &nbsp; TZ: {ZONE}
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
              {isSuper && (
                <TableCell sx={{ color: "#fff", fontWeight: 600 }} align="right">
                  Actions
                </TableCell>
              )}
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
                    from={monthBounds(month).from}
                    to={monthBounds(month).to}
                    categoryColors={config.categoryColors}
                    defaultOpen={filtered.length === 1}
                    showActions={isSuper}
                    onEdit={openEdit}
                    onDelete={openDelete}
                    canManageLogs={canManageLogs}
                    onEditLog={onEditLog}
                    onDeleteLog={onDeleteLog}
                    caps={{ general: config.generalIdleLimit, namaz: config.namazLimit }}
                  />
                ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Employee Edit dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Employee</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            label="Name"
            fullWidth
            margin="dense"
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
          />
          <TextField
            label="Department"
            fullWidth
            margin="dense"
            value={editForm.department}
            onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
          />
          <Box display="flex" gap={2} mt={1}>
            <TextField
              label="Shift Start (HH:mm)"
              type="time"
              fullWidth
              value={editForm.shift_start}
              onChange={(e) => setEditForm((f) => ({ ...f, shift_start: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Shift End (HH:mm)"
              type="time"
              fullWidth
              value={editForm.shift_end}
              onChange={(e) => setEditForm((f) => ({ ...f, shift_end: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button startIcon={<Close />} onClick={() => setEditOpen(false)} disabled={busyAction}>
            Cancel
          </Button>
          <Button startIcon={<Save />} variant="contained" onClick={saveEdit} disabled={busyAction}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Employee Delete confirm */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete employee?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete <b>{editEmp?.name}</b>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={busyAction}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={doDelete} disabled={busyAction}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Log Edit dialog (superadmin only) */}
      <Dialog open={logEditOpen} onClose={() => setLogEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Activity Log — {logForm.who}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box display="flex" gap={2}>
            <TextField
              label="Date (Karachi)"
              type="date"
              value={logForm.dateYmd}
              onChange={(e) => setLogForm((f) => ({ ...f, dateYmd: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Start (HH:mm)"
              type="time"
              value={logForm.startHM}
              onChange={(e) => setLogForm((f) => ({ ...f, startHM: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="End (HH:mm)"
              type="time"
              value={logForm.endHM}
              onChange={(e) => setLogForm((f) => ({ ...f, endHM: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Box>

          <Box display="flex" gap={2} mt={2}>
            <Select
              fullWidth
              value={logForm.category}
              onChange={(e) => setLogForm((f) => ({ ...f, category: e.target.value }))}
            >
              <MenuItem value="General">General</MenuItem>
              <MenuItem value="Official">Official</MenuItem>
              <MenuItem value="Namaz">Namaz</MenuItem>
            </Select>
            <Select
              fullWidth
              value={logForm.status}
              onChange={(e) => setLogForm((f) => ({ ...f, status: e.target.value }))}
            >
              <MenuItem value="Idle">Idle</MenuItem>
              <MenuItem value="Active">Active</MenuItem>
            </Select>
          </Box>

          <TextField
            label="Reason"
            value={logForm.reason}
            onChange={(e) => setLogForm((f) => ({ ...f, reason: e.target.value }))}
            fullWidth
            margin="dense"
            multiline
            minRows={2}
          />

          <Box mt={1} display="flex" gap={1}>
            <Button size="small" onClick={endLogNow}>
              End Now
            </Button>
            <Button size="small" onClick={clearEndTime}>
              Clear End
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button startIcon={<Close />} onClick={() => setLogEditOpen(false)} disabled={busyAction}>
            Cancel
          </Button>
          <Button startIcon={<Save />} variant="contained" onClick={saveLogEdit} disabled={busyAction}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Log Delete confirm */}
      <Dialog open={logDeleteOpen} onClose={() => setLogDeleteOpen(false)}>
        <DialogTitle>Delete activity log?</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete this activity log?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogDeleteOpen(false)} disabled={busyAction}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={doLogDelete} disabled={busyAction}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
