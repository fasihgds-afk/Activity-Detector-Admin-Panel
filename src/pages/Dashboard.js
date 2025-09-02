import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Grid, Card, CardContent, Typography, Box, Divider, Button, Dialog,
  DialogTitle, DialogContent, List, ListItem, ListItemText, Select, MenuItem,
  Chip, LinearProgress, Tooltip, Alert, Skeleton, ToggleButton, ToggleButtonGroup
} from "@mui/material";
import { useTheme, alpha, lighten, darken } from "@mui/material/styles";
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, Legend,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "http://localhost:3000";

const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
function ymdInAsiaFromISO(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit",
    });
    return fmt.format(d);
  } catch { return null; }
}
function currentShiftYmd() {
  const fmtYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" });
  const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", hour: "2-digit", hourCycle: "h23" });
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

function downloadXls(filename, headers, rows) {
  const headerHtml = headers
    .map((h) => `<th style="background:#111827;color:#fff;padding:10px 8px;border:1px solid #e5e7eb;text-align:center;font-weight:700">${h}</th>`)
    .join("");
  const rowHtml = rows
    .map((r) => `<tr>${r.map((c) =>
      `<td style="padding:8px;border:1px solid #e5e7eb;text-align:center">${String(c)}</td>`).join("")
    }</tr>`).join("");
  const html = `
    <html><head><meta charset="utf-8" />
    <style>table{border-collapse:collapse;font-family:Segoe UI,Arial;font-size:12px}</style>
    </head><body><table><thead><tr>${headerHtml}</tr></thead><tbody>${rowHtml}</tbody></table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ---- theme-driven palette so dark mode looks perfect ---- */
function useColors(theme) {
  const primary = theme.palette.primary.main;
  const secondary = theme.palette.secondary?.main || theme.palette.success.main;
  const general = theme.palette.warning.main; // orange
  const namaz = theme.palette.success.main;   // green
  const official = theme.palette.info.main;   // blue

  const okBg   = alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.22 : 0.10);
  const warnBg = alpha(theme.palette.warning.main, theme.palette.mode === "dark" ? 0.22 : 0.12);
  const badBg  = alpha(theme.palette.error.main,   theme.palette.mode === "dark" ? 0.24 : 0.14);

  const tableHeadGrad = `linear-gradient(90deg, ${primary}, ${secondary})`;
  const progressTrack = theme.palette.mode === "dark"
    ? alpha(theme.palette.common.white, 0.16)
    : alpha(theme.palette.text.primary, 0.10);

  return { primary, secondary, general, namaz, official, okBg, warnBg, badBg, tableHeadGrad, progressTrack };
}

export default function Dashboard() {
  const theme = useTheme();
  const C = useColors(theme);

  const [employees, setEmployees] = useState([]);
  const [limits, setLimits] = useState({ general: 60, namaz: 50 });
  const [selectedEmp, setSelectedEmp] = useState("all");
  const [openDialog, setOpenDialog] = useState(false);
  const [scope, setScope] = useState("today");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const pollRef = useRef(null);

  const todayYmd = useMemo(() => currentShiftYmd(), []);
  const { start: monthStart, end: monthEnd, days: daysInMonth } = useMemo(
    () => firstLastOfMonth(todayYmd), [todayYmd]
  );

  async function fetchAll() {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/employees`, { timeout: 15000 });
      const data = Array.isArray(res.data) ? res.data : res.data.employees || [];
      setEmployees(data);
      const cfg = res.data?.settings || {};
      const general = Number(cfg.general_idle_limit) || limits.general;
      const namaz = Number(cfg.namazLimit) || limits.namaz;
      setLimits({ general, namaz });
      setErr("");
      setUpdatedAt(new Date().toLocaleString("en-PK", { hour12: true }));
    } catch {
      setErr("Could not load data. Retrying automatically…");
    } finally { setLoading(false); }
  }
  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(fetchAll, 60000);
    return () => clearInterval(pollRef.current);
  }, []);

  function sessionsInScope(sessions) {
    const list = Array.isArray(sessions) ? sessions : [];
    if (scope === "today") {
      return list.filter((s) => (s.shiftDate || ymdInAsiaFromISO(s.idle_start)) === todayYmd);
    }
    return list.filter((s) => {
      const sd = s.shiftDate || ymdInAsiaFromISO(s.idle_start);
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
      const ses = (e.idle_sessions || []).filter(
        (s) => (s.shiftDate || ymdInAsiaFromISO(s.idle_start)) === todayYmd
      );
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
      const ses = sessionsInScope(e.idle_sessions);
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
      else if ((general / genCap) >= 0.8 || (namaz / namCap) >= 0.8) { status = "Near Limit"; color = "warning"; }

      const score = genEx * 3 + namEx * 3 + total * 0.01;
      rows.push({
        id: e.id || e.emp_id || e._id,
        name: e.name || "-",
        department: e.department || "-",
        general, namaz, official, total,
        status, color, score
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

  const donutData = useMemo(() => ([
    { name: "General Break", value: totalsToday.general },
    { name: "Namaz Break", value: totalsToday.namaz },
    { name: "Official Break", value: totalsToday.official },
  ]), [totalsToday]);

  const barDataToday = useMemo(() => {
    return employees.map((emp) => {
      const ses = (emp.idle_sessions || []).filter(
        (s) => (s.shiftDate || ymdInAsiaFromISO(s.idle_start)) === todayYmd
      );
      let g = 0, n = 0, o = 0;
      for (const s of ses) {
        const d = Number(s.duration) || 0;
        if (s.category === "General") g += d;
        else if (s.category === "Namaz") n += d;
        else if (s.category === "Official") o += d;
      }
      return { name: emp.name, General: g, Namaz: n, Official: o };
    });
  }, [employees, todayYmd]);

  function exportPDF() {
    const label = scope === "today" ? todayYmd : `${monthStart} → ${monthEnd} (${daysInMonth} days)`;
    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();

    const limitsText =
      scope === "month"
        ? `Limits: General ${limits.general}m/day (cap ${effectiveGeneralLimit}m), Namaz ${limits.namaz}m/day (cap ${effectiveNamazLimit}m)`
        : `Limits: General ${limits.general}m/day, Namaz ${limits.namaz}m/day`;

    const header = (pageNumber) => {
      doc.setFillColor(31, 41, 55);
      doc.rect(0, 0, pageW, 64, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor("#fff");
      doc.text("Employee Idle Leaderboard", 40, 26);
      doc.setFont("helvetica", "normal"); doc.setFontSize(12);
      doc.text(`Scope: ${label}  |  TZ: Asia/Karachi  |  ${limitsText}`, 40, 46);
      doc.setFontSize(9); doc.text(`Page ${pageNumber}`, pageW / 2, doc.internal.pageSize.getHeight() - 14, { align: "center" });
    };

    const headers = ["#", "Name", "Dept", "Status", "General (m)", "Namaz (m)", "Official (m)", "Total (m)"];
    const body = leaderboard.map((r) => [r.rank, r.name, r.department, r.status, r.general, r.namaz, r.official, r.total]);

    autoTable(doc, {
      head: [headers],
      body,
      margin: { left: 40, right: 40, top: 70, bottom: 28 },
      startY: 84,
      styles: { fontSize: 10, cellPadding: 6, halign: "center", valign: "middle" },
      headStyles: { fillColor: [99,102,241], textColor: 255, halign: "center" },
      theme: "striped",
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didDrawPage: (d) => header(d.pageNumber),
      didParseCell: (d) => {
        if (d.section === "body") {
          const row = leaderboard[d.row.index];
          d.cell.styles.fillColor =
            row.status === "Exceeded" ? [254, 226, 226] :
            row.status === "Near Limit" ? [255, 251, 235] : [236, 253, 245];
          if ([4,5,6,7].includes(d.column.index)) d.cell.styles.fontStyle = "bold";
        }
      },
      columnStyles: { 1: { halign: "left" }, 2: { halign: "left" } }
    });

    const fileLabel = scope === "today" ? todayYmd : `${monthStart.replaceAll("-","")}_${monthEnd.replaceAll("-","")}`;
    doc.save(`leaderboard_${fileLabel}.pdf`);
  }
  function exportXLS() {
    const headers = ["Rank","Name","Department","Status","General (m)","Namaz (m)","Official (m)","Total (m)"];
    const rows = leaderboard.map((r) => [r.rank, r.name, r.department, r.status, r.general, r.namaz, r.official, r.total]);
    const fileLabel = scope === "today" ? todayYmd : `${monthStart.replaceAll("-","")}_${monthEnd.replaceAll("-","")}`;
    downloadXls(`leaderboard_${fileLabel}.xls`, headers, rows);
  }

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

      {/* Top stats (today) */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          {loading ? skeletonCard : (
            <Card sx={{ p: 2, background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})`, color: theme.palette.getContrastText(C.primary) }}>
              <CardContent>
                <Typography variant="h6">Total Employees</Typography>
                <Typography variant="h4" fontWeight={700}>{employees.length}</Typography>
                <Button variant="outlined" sx={{ mt: 1, color: "inherit", borderColor: alpha("#fff", 0.8) }} onClick={() => setOpenDialog(true)}>
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

      {/* Export + Scope */}
      <Card sx={{ p: 3, mb: 4 }}>
        <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
          <Typography variant="h6" fontWeight={600} sx={{ mr: "auto" }}>
            Quick Exports
            <Typography variant="caption" sx={{ ml: 1 }} color="text.secondary">
              Last updated: {updatedAt || "—"}
            </Typography>
          </Typography>
          <ToggleButtonGroup value={scope} exclusive onChange={(_, v) => v && setScope(v)} size="small" sx={{ mr: 1 }}>
            <ToggleButton value="today">Today</ToggleButton>
            <ToggleButton value="month">This Month</ToggleButton>
          </ToggleButtonGroup>
          <Button variant="contained" onClick={exportPDF}>Export PDF</Button>
          <Button variant="outlined" onClick={exportXLS}>Export Excel</Button>
        </Box>
      </Card>

      {/* Pie (today) */}
      <Card sx={{ p: 3, mb: 4 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" fontWeight={600}>Break Usage Summary (Today)</Typography>
          <Select size="small" value={selectedEmp} onChange={(e) => setSelectedEmp(e.target.value)}>
            <MenuItem value="all">All Employees</MenuItem>
            {employees.map((emp) => (
              <MenuItem key={emp.id || emp.emp_id || emp._id} value={emp.id || emp.emp_id || emp._id}>
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
                  ? [
                      { name: "General Break", value: totalsToday.general },
                      { name: "Namaz Break", value: totalsToday.namaz },
                      { name: "Official Break", value: totalsToday.official },
                    ]
                  : (() => {
                      const emp = employees.find(e => (e.id || e.emp_id || e._id) === selectedEmp);
                      const ses = (emp?.idle_sessions || []).filter((s) => (s.shiftDate || ymdInAsiaFromISO(s.idle_start)) === todayYmd);
                      const agg = (c) => ses.reduce((a, s) => a + (s.category === c ? (s.duration || 0) : 0), 0);
                      return [
                        { name: "General Break", value: agg("General") },
                        { name: "Namaz Break", value: agg("Namaz") },
                        { name: "Official Break", value: agg("Official") },
                      ];
                    })()
              }
              dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} label
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
          <BarChart data={employees.map((emp) => {
            const ses = (emp.idle_sessions || []).filter((s) => (s.shiftDate || ymdInAsiaFromISO(s.idle_start)) === todayYmd);
            let g = 0, n = 0, o = 0;
            for (const s of ses) {
              const d = Number(s.duration) || 0;
              if (s.category === "General") g += d;
              else if (s.category === "Namaz") n += d;
              else if (s.category === "Official") o += d;
            }
            return { name: emp.name, General: g, Namaz: n, Official: o };
          })} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
            <XAxis dataKey="name" />
            <YAxis />
            <RTooltip />
            <Legend />
            <Bar dataKey="General" stackId="a" fill={C.general} />
            <Bar dataKey="Namaz"   stackId="a" fill={C.namaz} />
            <Bar dataKey="Official" stackId="a" fill={C.official} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Leaderboard (theme-aware) */}
      <Card sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" fontWeight={700}>
          Leaderboard — Obedience ({scope === "today" ? "Today" : `This Month (${daysInMonth} days)`})
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Sorted with most obedient at top. Colors: <b style={{color: theme.palette.success.main}}>Green</b> = Obedient,
          <b style={{color: theme.palette.warning.main}}> Amber</b> = Near limit,
          <b style={{color: theme.palette.error.main}}> Red</b> = Exceeded.
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.tableHeadGrad, color: theme.palette.getContrastText(theme.palette.primary.main) }}>
                <th style={{ padding: 10, textAlign: "left" }}>#</th>
                <th style={{ padding: 10, textAlign: "left" }}>Name</th>
                <th style={{ padding: 10, textAlign: "left" }}>Dept</th>
                <th style={{ padding: 10 }}>General</th>
                <th style={{ padding: 10 }}>Namaz</th>
                <th style={{ padding: 10 }}>Official</th>
                <th style={{ padding: 10 }}>Total</th>
                <th style={{ padding: 10 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((r) => {
                const bg =
                  r.status === "Exceeded" ? C.badBg :
                  r.status === "Near Limit" ? C.warnBg : C.okBg;

                const capG = effectiveGeneralLimit;
                const capN = effectiveNamazLimit;

                const pctBar = (value, cap, color) => (
                  <Box sx={{ minWidth: 140 }}>
                    <Tooltip title={`${value} / ${cap} min`}>
                      <LinearProgress
                        variant="determinate"
                        value={cap ? Math.min(100, (value / cap) * 100) : 0}
                        sx={{
                          height: 8,
                          borderRadius: 6,
                          backgroundColor: C.progressTrack,
                          "& .MuiLinearProgress-bar": { backgroundColor: color }
                        }}
                      />
                    </Tooltip>
                    <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>{value} m</Typography>
                  </Box>
                );

                const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank;

                return (
                  <tr key={r.id} style={{ background: bg, borderBottom: `1px solid ${alpha(theme.palette.divider, 0.6)}`, color: theme.palette.text.primary }}>
                    <td style={{ padding: 10, fontWeight: 700 }}>{medal}</td>
                    <td style={{ padding: 10 }}>{r.name}</td>
                    <td style={{ padding: 10 }}>{r.department}</td>
                    <td style={{ padding: 10, textAlign: "center" }}>{pctBar(r.general, capG, C.general)}</td>
                    <td style={{ padding: 10, textAlign: "center" }}>{pctBar(r.namaz, capN, C.namaz)}</td>
                    <td style={{ padding: 10, fontWeight: 600, textAlign: "center" }}>{r.official} m</td>
                    <td style={{ padding: 10, fontWeight: 700, textAlign: "center" }}>{r.total} m</td>
                    <td style={{ padding: 10, textAlign: "center" }}>
                      <Chip
                        label={r.status}
                        color={r.color}
                        variant={r.status === "Obedient" ? "filled" : "outlined"}
                        sx={{ fontWeight: 700 }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
      </Card>

      {/* All Employees Modal */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>All Employees</DialogTitle>
        <DialogContent>
          <List>
            {employees.map((emp) => (
              <ListItem key={emp.id || emp.emp_id || emp._id}>
                <ListItemText
                  primary={emp.name}
                  secondary={`Dept: ${emp.department || "-"} | Status: ${emp.latest_status || "-"}`}
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
