import React, { useEffect, useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableRow,
  Paper, Chip
} from "@mui/material";
import axios from "axios";

// 🔧 Base API URL (set REACT_APP_API_URL in Netlify; falls back for local dev)
const API = process.env.REACT_APP_API_URL || "http://localhost:3000";

// 🔹 Utility: calculate total idle time
function calcIdleSummary(idleSessions) {
  if (!idleSessions || idleSessions.length === 0) return 0;
  return idleSessions.reduce((sum, s) => sum + (s.duration || 0), 0);
}

export default function EmployeeTable() {
  const [employees, setEmployees] = useState([]);

  const fetchEmployees = async () => {
    try {
      const res = await axios.get(`${API}/employees`, { timeout: 15000 });
      // backend returns { employees, settings }
      setEmployees(res.data?.employees || []);
    } catch (err) {
      console.error("Failed to fetch employees:", err);
    }
  };

  useEffect(() => {
    fetchEmployees();
    // 🔄 Auto refresh every 1 minute
    const interval = setInterval(fetchEmployees, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Paper sx={{ p: 2 }}>
      <Table>
        <TableHead>
          <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
            <TableCell><b>Name</b></TableCell>
            <TableCell><b>Shift</b></TableCell>
            <TableCell><b>Department</b></TableCell>
            <TableCell><b>Status</b></TableCell>
            <TableCell><b>Total Idle</b></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {employees.map(emp => {
            const totalIdle = calcIdleSummary(emp.idle_sessions);
            return (
              <TableRow key={emp.id}>
                <TableCell>{emp.name}</TableCell>
                <TableCell>{emp.shift_start} - {emp.shift_end}</TableCell>
                <TableCell>{emp.department}</TableCell>
                <TableCell>
                  <Chip
                    label={emp.latest_status}
                    color={emp.latest_status === "Active" ? "success" : "warning"}
                    sx={{ fontWeight: 600 }}
                  />
                </TableCell>
                <TableCell>
                  {totalIdle > 0 ? (
                    <Chip
                      label={`${totalIdle} min`}
                      color={totalIdle > 30 ? "error" : "warning"}
                      size="small"
                    />
                  ) : (
                    "0 min"
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Paper>
  );
}
