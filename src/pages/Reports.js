import React from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Grid,
  Divider,
} from "@mui/material";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import AssessmentIcon from "@mui/icons-material/Assessment";

export default function Reports() {
  return (
    <Box p={4}>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Reports
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Generate and download employee activity summaries
      </Typography>

      <Grid container spacing={4} sx={{ mt: 2 }}>
        {/* Daily Report */}
        <Grid item xs={12} md={6}>
          <Card
            elevation={6}
            sx={{
              borderRadius: "20px",
              p: 2,
              background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
              color: "#fff",
              transition: "0.3s",
              "&:hover": {
                transform: "translateY(-5px)",
                boxShadow: "0 10px 20px rgba(0,0,0,0.3)",
              },
            }}
          >
            <CardContent>
              <Box display="flex" alignItems="center" gap={2} mb={2}>
                <AssessmentIcon fontSize="large" />
                <Typography variant="h6" fontWeight={600}>
                  Daily Report
                </Typography>
              </Box>
              <Divider sx={{ borderColor: "rgba(255,255,255,0.3)", mb: 2 }} />
              <Typography variant="body2" sx={{ mb: 3 }}>
                Download logs of employee activity recorded today.
              </Typography>
              <Box>
                <Button
                  variant="contained"
                  startIcon={<PictureAsPdfIcon />}
                  sx={{
                    mr: 2,
                    borderRadius: "12px",
                    background: "#F43F5E",
                    "&:hover": { background: "#E11D48" },
                  }}
                >
                  Export PDF
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<FileDownloadIcon />}
                  sx={{
                    borderRadius: "12px",
                    color: "#fff",
                    borderColor: "#fff",
                    "&:hover": { background: "rgba(255,255,255,0.1)" },
                  }}
                >
                  Export CSV
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Monthly Report */}
        <Grid item xs={12} md={6}>
          <Card
            elevation={6}
            sx={{
              borderRadius: "20px",
              p: 2,
              background: "linear-gradient(135deg, #10B981, #14B8A6)",
              color: "#fff",
              transition: "0.3s",
              "&:hover": {
                transform: "translateY(-5px)",
                boxShadow: "0 10px 20px rgba(0,0,0,0.3)",
              },
            }}
          >
            <CardContent>
              <Box display="flex" alignItems="center" gap={2} mb={2}>
                <AssessmentIcon fontSize="large" />
                <Typography variant="h6" fontWeight={600}>
                  Monthly Report
                </Typography>
              </Box>
              <Divider sx={{ borderColor: "rgba(255,255,255,0.3)", mb: 2 }} />
              <Typography variant="body2" sx={{ mb: 3 }}>
                Download a summary of employee activity for the month.
              </Typography>
              <Box>
                <Button
                  variant="contained"
                  startIcon={<PictureAsPdfIcon />}
                  sx={{
                    mr: 2,
                    borderRadius: "12px",
                    background: "#FBBF24",
                    "&:hover": { background: "#F59E0B" },
                  }}
                >
                  Export PDF
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<FileDownloadIcon />}
                  sx={{
                    borderRadius: "12px",
                    color: "#fff",
                    borderColor: "#fff",
                    "&:hover": { background: "rgba(255,255,255,0.1)" },
                  }}
                >
                  Export CSV
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
