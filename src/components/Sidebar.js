// src/components/Sidebar.jsx
import React from "react";
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Tooltip,
  Box,
} from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import PeopleIcon from "@mui/icons-material/People";
import BarChartIcon from "@mui/icons-material/BarChart";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import MenuIcon from "@mui/icons-material/Menu";
import { Link, useLocation } from "react-router-dom";
import { getRole } from "../auth";

export default function Sidebar({ open, setOpen }) {
  const location = useLocation();
  const toggleSidebar = () => setOpen(!open);

  // Role gate: admin or super admin
  const normalizedRole = (getRole() || "")
    .toString()
    .toLowerCase()
    .replace(/\s|_/g, ""); // "super_admin" / "Super Admin" -> "superadmin"
  const canViewAttendance =
    normalizedRole === "admin" || normalizedRole === "superadmin";

  const menuItems = [
    { text: "Dashboard", icon: <DashboardIcon />, path: "/" },
    { text: "Employees", icon: <PeopleIcon />, path: "/employees" },
    { text: "Reports", icon: <BarChartIcon />, path: "/reports" },
  ];

  // Insert "View Attendance" right after "Reports" when allowed
  const finalItems = [...menuItems];
  if (canViewAttendance) {
    const idx = finalItems.findIndex((i) => i.text === "Reports");
    const insertAt = idx === -1 ? finalItems.length : idx + 1;
    finalItems.splice(insertAt, 0, {
      text: "View Attendance",
      icon: <BarChartIcon />,
      external: true,
      href: "https://hiki-vision-frontend.vercel.app/",
    });
  }

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: open ? 220 : 70,
        flexShrink: 0,
        whiteSpace: "nowrap",
        transition: "0.3s",
        ["& .MuiDrawer-paper"]: {
          width: open ? 220 : 70,
          boxSizing: "border-box",
          background: "linear-gradient(180deg, #6366F1 0%, #14B8A6 100%)",
          color: "#fff",
          overflowX: "hidden",
          transition: "0.3s",
        },
      }}
    >
      {/* Top toggle button */}
      <Box display="flex" justifyContent={open ? "flex-end" : "center"} p={1}>
        <IconButton onClick={toggleSidebar} sx={{ color: "white" }}>
          {open ? <MenuOpenIcon /> : <MenuIcon />}
        </IconButton>
      </Box>

      {/* Menu items */}
      <List>
        {finalItems.map((item) => {
          const isExternal = !!item.external;
          const selected = !isExternal && location.pathname === item.path;

          const buttonProps = isExternal
            ? {
                component: "a",
                href: item.href,
                target: "_blank",
                rel: "noopener noreferrer",
              }
            : { component: Link, to: item.path, selected };

          return (
            <Tooltip
              title={!open ? item.text : ""}
              placement="right"
              key={item.text}
            >
              <ListItemButton
                {...buttonProps}
                sx={{
                  justifyContent: open ? "flex-start" : "center",
                  px: open ? 2 : 1,
                  borderRadius: "12px",
                  mx: 1,
                  mb: 1,
                  "&.Mui-selected": {
                    background: "rgba(255,255,255,0.2)",
                  },
                }}
              >
                <ListItemIcon
                  sx={{ color: "white", minWidth: 0, mr: open ? 2 : "auto" }}
                >
                  {item.icon}
                </ListItemIcon>
                {open && <ListItemText primary={item.text} />}
              </ListItemButton>
            </Tooltip>
          );
        })}
      </List>
    </Drawer>
  );
}
