import React, { useState } from "react";
import { Box } from "@mui/material";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";

export default function Layout({ children, darkMode, setDarkMode }) {
  const [open, setOpen] = useState(true); // Sidebar open state

  return (
    <Box sx={{ display: "flex", height: "100vh", bgcolor: "background.default" }}>
      {/* Sidebar */}
      <Sidebar open={open} setOpen={setOpen} />

      {/* Main Content Area */}
      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
        {/* Pass sidebar state to Navbar 👇 */}
        <Navbar darkMode={darkMode} setDarkMode={setDarkMode} sidebarOpen={open} />

        {/* Add marginTop so content doesn’t hide under fixed navbar */}
        <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 10 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
