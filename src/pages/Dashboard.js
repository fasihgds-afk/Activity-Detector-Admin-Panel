/* eslint-disable no-console */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Grid, Card, CardContent, Typography, Box, Divider,
  Button, Select, MenuItem, Alert, Skeleton, ToggleButton, ToggleButtonGroup
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import { PieChart, Pie, Cell, Tooltip as RTooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from "recharts";
import api from "../api";

const ZONE = "Asia/Karachi";
const pad = (n) => (n < 10 ? `0${n}` : `${n}`);

function ymdInAsiaFromISO(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
    return fmt.format(d);
  } catch {
    return null;
  }
}
// "shift business day" (before 06:00 → previous day)
function currentShiftYmd() {
  const fmtYmd = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "2-digit", hourCycle: "h23" });
  const now = new Date();
  const ymd = fmtYmd.format(now);
  const hour = parseInt(hourFmt.format(now), 10);
  if (hour >= 6) return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
function firstLastOfMonth(ymd) {
  const [y, m] = ymd.split("-").map(Number);
  const start = `${y}-${pad(m)}-01`;
  const days = new Date(y, m, 0).getDate();
  const end = `${y}-${pad(m)}-${pad(days)}`;
  return { start, end, days };
}
function useColors(theme) {
  const primary = theme.palette.primary.main;
  const secondary = theme.palette.success.main;
  const general = theme.palette.warning.main; // orange
  const namaz = theme.palette.success.main; // green
  const official = theme.palette.info.main; // blue
  const okBg = alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.22 : 0.10);
  const warnBg = alpha(theme.palette.warning.main, theme.palette.mode === "dark" ? 0.22 : 0.12);
  const badBg = alpha(theme.palette.error.main, theme.palette.mode === "dark" ? 0.24 : 0.14);
  const tableHeadGrad = `linear-gradient(90deg, ${primary}, ${secondary})`;
  const progressTrack = theme.palette.mode === "dark" ? alpha(theme.palette.common.white, 0.16) : alpha(theme.palette.text.primary, 0.10);
  return { primary, secondary, general, namaz, official, okBg, warnBg, badBg, tableHeadGrad, progressTrack };
}

export default function Dashboard() {
  const theme = useTheme();
  const C = useColors(theme);

  const [employees, setEmployees] = useState([]);
  const [limits, setLimits] = useState({ general: 60, namaz: 50 });
  const [selectedEmp, setSelectedEmp] = useState("all");
  const [scope, setScope] = useState("today"); // today | month
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const pollRef = useRef(null);

  const todayYmd = useMemo(() => currentShiftYmd(), []);
  const { start: monthStart, end: monthEnd, days: daysInMonth } = useMemo(() => firstLastOfMonth(todayYmd), [todayYmd]);

  async function fetchAll() {
    try {
      setLoading(true);
      const res = await api.get("/employees"); // shared 60s timeout, no per-request override
      const payload = Array.isArray(res.data) ? { employees: res.data } : res.data || {};
      const data = Array.isArray(payload.employees) ? payload.employees : [];
      setEmployees(data);

      const cfg = payload.settings || {};
      const general = Number(cfg.general_idle_limit ?? 60);
      const namaz = Number(cfg.namaz_limit ?? 50);
      setLimits({ general, namaz });

      setErr("");
      setUpdatedAt(new Date().toLocaleString("en-PK", { hour12: true }));
    } catch (e) {
      console.error(e);
      setErr(
        e?.response?.status === 401
          ? "Session expired or not logged in. Please sign in again."
          : "Could not load data. Retrying automatically…"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(fetchAll, 60000);
    return () => clearInterval(pollRef.current);
  }, []);

  const ymdOf = (s) => s.shiftDate || ymdInAsiaFromISO(s.idle_start);

  function sessionsInScope(list, sc) {
    const arr = Array.isArray(list) ? list : [];
    if (sc === "today") return arr.filter((s) => ymdOf(s) === todayYmd);
    return arr.filter((s) => {
      const sd = ymdOf(s);
      return sd && sd >= monthStart && sd <= monthEnd;
    });
  }

  const effectiveGeneralLimit = useMemo(
    () => (scope === "month" ? limits.general * daysInMonth : limits.general),
    [scope, limits.general, daysInMonth]
  );
  const effectiveNamazLimit = useMemo(
    () => (scope === "month" ? limits.namaz * daysInMonth : limits.namaz),
    [scope, limits.namaz, daysInMonth]
  );

  const totalsToday = useMemo(() => {
    let general = 0, namaz = 0, official = 0;
    for (const e of employees) {
      const ses = (e.idle_sessions || []).filter((s) => ymdOf(s) === todayYmd);
      for (const s of ses) {
        const d = Number(s.duration) || 0;
        if (s.category === "General") general += d;
        else if (s.category === "Namaz") namaz += d;
        else if (s.category === "Official") official += d;
      }
    }
    return { general, namaz, official };
  }, [employees, todayYmd]);

  const leaderboard = useMemo(() => {
    const rows = [];
    for (const e of employees) {
      const ses = sessionsInScope(e.idle_sessions, scope);
      let general = 0, namaz = 0, official = 0;
      for (const s of ses) {
        const d = Number(s.duration) || 0;
        if (s.category === "General") general += d;
        else if (s.category === "Namaz") namaz += d;
        else if (s.category === "Official") official += d;
      }
      const total = general + namaz + official;
      const genCap = effectiveGeneralLimit;
      const namCap = effectiveNamazLimit;
      const genEx = Math.max(0, general - genCap);
      const namEx = Math.max(0, namaz - namCap);
      let status = "Obedient", color = "success";
      if (genEx > 0 || namEx > 0) { status = "Exceeded"; color = "error"; }
      else if ((genCap && general / genCap >= 0.8) || (namCap && namaz / namCap >= 0.8)) { status = "Near Limit"; color = "warning"; }
      const score = genEx * 3 + namEx * 3 + total * 0.01;
      rows.push({
        id: e.id || e.emp_id, name: e.name || "-", department: e.department || "-",
        general, namaz, official, total, status, color, score
      });
    }
    return rows
      .sort((a, b) => {
        const rank = (s) => (s === "Obedient" ? 0 : s === "Near Limit" ? 1 : 2);
        const d = rank(a.status) - rank(b.status);
        if (d !== 0) return d;
        return a.score - b.score;
      })
      .map((r, i) => ({ rank: i + 1, ...r }));
  }, [employees, scope, effectiveGeneralLimit, effectiveNamazLimit]);

  const donutData = useMemo(
    () => [
      { name: "General Break", value: totalsToday.general },
      { name: "Namaz Break", value: totalsToday.namaz },
      { name: "Official Break", value: totalsToday.official },
    ],
    [totalsToday]
  );

  const skeletonCard = (
    <Card sx={{ p: 2 }}>
      <Skeleton variant="text" width={120} height={28} />
      <Skeleton variant="text" width={80} height={40} />
      <Skeleton variant="rounded" height={36} sx={{ mt: 1 }} />
    </Card>
  );

  return (
    <Box p={4}>
      {err && <Alert severity="warning" sx={{ mb: 2 }}>{err}</Alert>}

      {/* Top stats */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          {loading ? skeletonCard : (
            <Card sx={{ p: 2, background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})`, color: theme.palette.getContrastText(C.primary) }}>
              <CardContent>
                <Typography variant="h6">Total Employees</Typography>
                <Typography variant="h4" fontWeight={700}>{employees.length}</Typography>
                <Button variant="outlined" sx={{ mt: 1, color: "inherit", borderColor: alpha("#fff", 0.8) }}
                  onClick={() => setSelectedEmp("all")}>
                  Show All
                </Button>
              </CardContent>
            </Card>
          )}
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          {loading ? skeletonCard : (
            <Card sx={{ p: 2, bgcolor: C.namaz, color: theme.palette.getContrastText(C.namaz) }}>
              <CardContent>
                <Typography variant="h6">Date (TZ Asia/Karachi)</Typography>
                <Typography variant="h4" fontWeight={700}>{todayYmd}</Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          {loading ? skeletonCard : (
            <Card sx={{ p: 2, bgcolor: C.general, color: theme.palette.getContrastText(C.general) }}>
              <CardContent>
                <Typography variant="h6">General Limit</Typography>
                <Typography variant="h4" fontWeight={700}>{limits.general} m/day</Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          {loading ? skeletonCard : (
            <Card sx={{ p: 2, bgcolor: C.official, color: theme.palette.getContrastText(C.official) }}>
              <CardContent>
                <Typography variant="h6">Namaz Limit</Typography>
                <Typography variant="h4" fontWeight={700}>{limits.namaz} m/day</Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      {/* Export / Scope */}
      <Card sx={{ p: 3, mb: 4 }}>
        <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
          <Typography variant="h6" fontWeight={600} sx={{ mr: "auto" }}>
            Quick View
            <Typography variant="caption" sx={{ ml: 1 }} color="text.secondary">
              Last updated: {updatedAt || "—"}
            </Typography>
          </Typography>
          <ToggleButtonGroup value={scope} exclusive onChange={(_, v) => v && setScope(v)} size="small" sx={{ mr: 1 }}>
            <ToggleButton value="today">Today</ToggleButton>
            <ToggleButton value="month">This Month</ToggleButton>
          </ToggleButtonGroup>
          <Button variant="outlined" onClick={fetchAll}>Refresh</Button>
        </Box>
      </Card>

      {/* Pie (today) */}
      <Card sx={{ p: 3, mb: 4 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" fontWeight={600}>Break Usage Summary (Today)</Typography>
          <Select size="small" value={selectedEmp} onChange={(e) => setSelectedEmp(e.target.value)}>
            <MenuItem value="all">All Employees</MenuItem>
            {employees.map((emp) => (
              <MenuItem key={emp.id || emp.emp_id} value={emp.id || emp.emp_id}>
                {emp.name}
              </MenuItem>
            ))}
          </Select>
        </Box>
        <Divider sx={{ my: 2 }} />
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={
                selectedEmp === "all"
                  ? donutData
                  : (() => {
                      const emp = employees.find((e) => (e.id || e.emp_id) === selectedEmp);
                      const ses = (emp?.idle_sessions || []).filter((s) => ymdOf(s) === todayYmd);
                      const agg = (c) => ses.reduce((a, s) => a + (s.category === c ? (s.duration || 0) : 0), 0);
                      return [
                        { name: "General Break", value: agg("General") },
                        { name: "Namaz Break", value: agg("Namaz") },
                        { name: "Official Break", value: agg("Official") },
                      ];
                    })()
              }
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={120}
              label
            >
              {[C.general, C.namaz, C.official].map((c, i) => (<Cell key={i} fill={c} />))}
            </Pie>
            <RTooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      {/* Bar (today) */}
      <Card sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" fontWeight={600}>Employee Comparison (Today)</Typography>
        <Divider sx={{ my: 2 }} />
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={employees.map((emp) => {
              const ses = (emp.idle_sessions || []).filter((s) => ymdOf(s) === todayYmd);
              let g = 0, n = 0, o = 0;
              for (const s of ses) {
                const d = Number(s.duration) || 0;
                if (s.category === "General") g += d;
                else if (s.category === "Namaz") n += d;
                else if (s.category === "Official") o += d;
              }
              return { name: emp.name, General: g, Namaz: n, Official: o };
            })}
            margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
          >
            <XAxis dataKey="name" />
            <YAxis />
            <RTooltip />
            <Legend />
            <Bar dataKey="General" stackId="a" fill={C.general} />
            <Bar dataKey="Namaz" stackId="a" fill={C.namaz} />
            <Bar dataKey="Official" stackId="a" fill={C.official} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Leaderboard */}
      <Card sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" fontWeight={700}>
          Leaderboard — Obedience ({scope === "today" ? "Today" : `This Month (${daysInMonth} days)`})
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Sorted with most obedient at top. Colors:
          <b style={{ color: theme.palette.success.main }}> Green</b> = Obedient,&nbsp;
          <b style={{ color: theme.palette.warning.main }}> Amber</b> = Near limit,&nbsp;
          <b style={{ color: theme.palette.error.main }}> Red</b> = Exceeded.
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.tableHeadGrad, color: theme.palette.getContrastText(theme.palette.primary.main) }}>
                <th style={{ padding: 10, textAlign: "left" }}>#</th>
                <th style={{ padding: 10, textAlign: "left" }}>Name</th>
                <th style={{ padding: 10, textAlign: "left" }}>Dept</th>
                <th style={{ padding: 10 }}>General (m)</th>
                <th style={{ padding: 10 }}>Namaz (m)</th>
                <th style={{ padding: 10 }}>Official (m)</th>
                <th style={{ padding: 10 }}>Total (m)</th>
                <th style={{ padding: 10 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((r) => {
                const bg =
                  r.status === "Exceeded" ? C.badBg : r.status === "Near Limit" ? C.warnBg : C.okBg;
                const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank;
                return (
                  <tr key={r.id} style={{ background: bg, borderBottom: `1px solid ${alpha(theme.palette.divider, 0.6)}`, color: theme.palette.text.primary }}>
                    <td style={{ padding: 10, fontWeight: 700 }}>{medal}</td>
                    <td style={{ padding: 10 }}>{r.name}</td>
                    <td style={{ padding: 10 }}>{r.department}</td>
                    <td style={{ padding: 10, fontWeight: 600, textAlign: "center" }}>{r.general}</td>
                    <td style={{ padding: 10, fontWeight: 600, textAlign: "center" }}>{r.namaz}</td>
                    <td style={{ padding: 10, fontWeight: 600, textAlign: "center" }}>{r.official}</td>
                    <td style={{ padding: 10, fontWeight: 700, textAlign: "center" }}>{r.total}</td>
                    <td style={{ padding: 10, textAlign: "center" }}>
                      <span style={{
                        fontWeight: 700,
                        color:
                          r.status === "Exceeded" ? theme.palette.error.main :
                          r.status === "Near Limit" ? theme.palette.warning.main :
                          theme.palette.success.main
                      }}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
      </Card>
    </Box>
  );
}


