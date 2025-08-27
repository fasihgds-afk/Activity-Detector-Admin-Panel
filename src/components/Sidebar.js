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

export default function Sidebar({ open, setOpen }) {
  const location = useLocation();

  const toggleSidebar = () => setOpen(!open);

  const menuItems = [
    { text: "Dashboard", icon: <DashboardIcon />, path: "/" },
    { text: "Employees", icon: <PeopleIcon />, path: "/employees" },
    { text: "Reports", icon: <BarChartIcon />, path: "/reports" },
  ];

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: open ? 220 : 70,
        flexShrink: 0,
        whiteSpace: "nowrap",
        transition: "0.3s",
        [`& .MuiDrawer-paper`]: {
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
        {menuItems.map((item) => (
          <Tooltip
            title={!open ? item.text : ""}
            placement="right"
            key={item.text}
          >
            <ListItemButton
              component={Link}
              to={item.path}
              selected={location.pathname === item.path}
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
        ))}
      </List>
    </Drawer>
  );
}
