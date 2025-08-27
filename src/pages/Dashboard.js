import React, { useEffect, useState } from "react";
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItem,
  ListItemText,
  Select,
  MenuItem,
} from "@mui/material";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import axios from "axios";

// 🔧 Base API URL (set REACT_APP_API_URL in Netlify; falls back to local dev)
const API = process.env.REACT_APP_API_URL || "http://localhost:3000";

// enable isBetween() for date filtering
dayjs.extend(isBetween);

export default function Dashboard() {
  const [employees, setEmployees] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    idle: 0,
    logs: 0,
    general: 0,
    namaz: 0,
    official: 0,
  });
  const [selectedEmp, setSelectedEmp] = useState("all");
  const [openDialog, setOpenDialog] = useState(false);
  const [dateRange, setDateRange] = useState([
    dayjs().startOf("day"),
    dayjs().endOf("day"),
  ]);

  // Fetch employees
  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API}/employees`, { timeout: 15000 });
      // backend returns { employees, settings }
      const employeesData = Array.isArray(res.data)
        ? res.data
        : res.data.employees || [];

      setEmployees(employeesData);

      const active = employeesData.filter(
        (e) => e.latest_status === "Active"
      ).length;
      const idle = employeesData.filter(
        (e) => e.latest_status !== "Active"
      ).length;
      const total = employeesData.length;

      let logs = 0,
        general = 0,
        namaz = 0,
        official = 0;

      employeesData.forEach((emp) => {
        (emp.idle_sessions || []).forEach((s) => {
          logs++;
          if (s.category === "General") general += s.duration || 0;
          if (s.category === "Namaz") namaz += s.duration || 0;
          if (s.category === "Official") official += s.duration || 0;
        });
      });

      setStats({ total, active, idle, logs, general, namaz, official });
    } catch (err) {
      console.error("Error fetching employee stats:", err);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Chart Data
  const getChartData = () => {
    if (selectedEmp === "all") {
      return [
        { name: "General Break", value: stats.general },
        { name: "Namaz Break", value: stats.namaz },
        { name: "Official Break", value: stats.official },
      ];
    }

    const emp = employees.find((e) => e.id === selectedEmp);
    if (!emp) return [];

    let general = 0,
      namaz = 0,
      official = 0;
    (emp.idle_sessions || []).forEach((s) => {
      if (s.category === "General") general += s.duration || 0;
      if (s.category === "Namaz") namaz += s.duration || 0;
      if (s.category === "Official") official += s.duration || 0;
    });

    return [
      { name: "General Break", value: general },
      { name: "Namaz Break", value: namaz },
      { name: "Official Break", value: official },
    ];
  };

  // Bar chart per employee
  const getBarChartData = () => {
    return employees.map((emp) => {
      let general = 0,
        namaz = 0,
        official = 0;
      (emp.idle_sessions || []).forEach((s) => {
        if (s.category === "General") general += s.duration || 0;
        if (s.category === "Namaz") namaz += s.duration || 0;
        if (s.category === "Official") official += s.duration || 0;
      });
      return { name: emp.name, General: general, Namaz: namaz, Official: official };
    });
  };

  // Export function (CSV or PDF with date range)
  const exportReport = (type = "csv") => {
    const [start, end] = dateRange;
    const rows = [];

    employees.forEach((emp) => {
      (emp.idle_sessions || []).forEach((s) => {
        // use idle_start from backend (ISO string); fall back to start_time_local if needed
        const sessionDate = s.idle_start ? dayjs(s.idle_start) : dayjs(s.start_time_local, "HH:mm:ss");

        if (!sessionDate.isBetween(start, end, "day", "[]")) return;

        const general = s.category === "General" ? s.duration || 0 : 0;
        const namaz = s.category === "Namaz" ? s.duration || 0 : 0;
        const official = s.category === "Official" ? s.duration || 0 : 0;
        const total = general + namaz + official;

        const exceeded = general > 60 ? `Exceeded by ${general - 60} min` : "";

        rows.push([
          emp.name,
          emp.latest_status,
          s.category,
          s.start_time_local || "-",
          s.end_time_local || "-",
          `${s.duration ?? 0} min`,
          general > 60 ? `${general} ⚠️ ${exceeded}` : general,
          namaz,
          official,
          total,
        ]);
      });
    });

    const headers = [
      "Employee",
      "Status",
      "Category",
      "Start Time",
      "End Time",
      "Duration",
      "General",
      "Namaz",
      "Official",
      "Total",
    ];

    if (type === "csv") {
      const csvContent = [headers, ...rows].map((e) => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `employee_report_${dayjs().format("YYYY-MM-DD")}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    if (type === "pdf") {
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text(
        `Employee Report (${dayjs(start).format("YYYY-MM-DD")} → ${dayjs(end).format("YYYY-MM-DD")})`,
        14,
        20
      );

      autoTable(doc, {
        head: [headers],
        body: rows,
        styles: { fontSize: 9 },
        didParseCell: (data) => {
          if (
            data.column.index === 6 &&
            data.cell.raw.toString().includes("⚠️")
          ) {
            data.cell.styles.textColor = [255, 0, 0];
          }
        },
      });

      doc.save(`employee_report_${dayjs().format("YYYY-MM-DD")}.pdf`);
    }
  };

  const COLORS = ["#F97316", "#10B981", "#3b82f6"];

  return (
    <Box p={4}>
      {/* Top Stats */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2, bgcolor: "#6366F1", color: "#fff" }}>
            <CardContent>
              <Typography variant="h6">Total Employees</Typography>
              <Typography variant="h4" fontWeight={700}>
                {stats.total}
              </Typography>
              <Button
                variant="outlined"
                sx={{ mt: 1, color: "#fff", borderColor: "#fff" }}
                onClick={() => setOpenDialog(true)}
              >
                Show All
              </Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2, bgcolor: "#10B981", color: "#fff" }}>
            <CardContent>
              <Typography variant="h6">Active Employees</Typography>
              <Typography variant="h4" fontWeight={700}>
                {stats.active}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2, bgcolor: "#F97316", color: "#fff" }}>
            <CardContent>
              <Typography variant="h6">Idle Employees</Typography>
              <Typography variant="h4" fontWeight={700}>
                {stats.idle}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2, bgcolor: "#14B8A6", color: "#fff" }}>
            <CardContent>
              <Typography variant="h6">Logs Today</Typography>
              <Typography variant="h4" fontWeight={700}>
                {stats.logs}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Date Pickers */}
      <Card sx={{ p: 3, mb: 4 }}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <Box display="flex" gap={2}>
            <DatePicker
              label="Start Date"
              value={dateRange[0]}
              onChange={(newValue) => setDateRange([newValue, dateRange[1]])}
            />
            <DatePicker
              label="End Date"
              value={dateRange[1]}
              onChange={(newValue) => setDateRange([dateRange[0], newValue])}
            />
          </Box>
        </LocalizationProvider>
        <Box display="flex" gap={2} mt={2}>
          <Button variant="contained" onClick={() => exportReport("csv")}>
            Export CSV
          </Button>
          <Button variant="outlined" onClick={() => exportReport("pdf")}>
            Export PDF
          </Button>
        </Box>
      </Card>

      {/* Pie Chart */}
      <Card sx={{ p: 3, mb: 4 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" fontWeight={600}>
            Break Usage Summary
          </Typography>
          <Select
            size="small"
            value={selectedEmp}
            onChange={(e) => setSelectedEmp(e.target.value)}
          >
            <MenuItem value="all">All Employees</MenuItem>
            {employees.map((emp) => (
              <MenuItem key={emp.id} value={emp.id}>
                {emp.name}
              </MenuItem>
            ))}
          </Select>
        </Box>
        <Divider sx={{ my: 2 }} />
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={getChartData()}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={120}
              label
            >
              {getChartData().map((entry, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      {/* Bar Chart */}
      <Card sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" fontWeight={600}>
          Employee Comparison
        </Typography>
        <Divider sx={{ my: 2 }} />
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={getBarChartData()}
            margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
          >
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="General" stackId="a" fill="#F97316" />
            <Bar dataKey="Namaz" stackId="a" fill="#10B981" />
            <Bar dataKey="Official" stackId="a" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Leaderboard Table */}
      <Card sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" fontWeight={600}>
          Employee Leaderboard
        </Typography>
        <Divider sx={{ my: 2 }} />
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f3f4f6" }}>
              <th>Name</th>
              <th>Status</th>
              <th>General</th>
              <th>Namaz</th>
              <th>Official</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              let general = 0,
                namaz = 0,
                official = 0;
              (emp.idle_sessions || []).forEach((s) => {
                if (s.category === "General") general += s.duration || 0;
                if (s.category === "Namaz") namaz += s.duration || 0;
                if (s.category === "Official") official += s.duration || 0;
              });
              const total = general + namaz + official;
              return (
                <tr
                  key={emp.id}
                  style={{
                    textAlign: "center",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  <td>{emp.name}</td>
                  <td>{emp.latest_status}</td>
                  <td
                    style={{
                      color: general > 60 ? "red" : "inherit",
                      fontWeight: general > 60 ? 700 : 400,
                    }}
                  >
                    {general} min{" "}
                    {general > 60 && `(Exceeded by ${general - 60} min)`}
                  </td>
                  <td>{namaz} min</td>
                  <td>{official} min</td>
                  <td style={{ fontWeight: 700 }}>{total} min</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Show All Employees Modal */}
      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>All Employees</DialogTitle>
        <DialogContent>
          <List>
            {employees.map((emp) => (
              <ListItem key={emp.id}>
                <ListItemText
                  primary={emp.name}
                  secondary={`Dept: ${emp.department} | Status: ${emp.latest_status}`}
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
