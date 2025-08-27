import React, { useEffect, useState } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function ActivityChart() {
  const [chartData, setChartData] = useState({ labels: [], datasets: [] });

  useEffect(() => {
    setChartData({
      labels: ["Usama", "Jawad", "Saqlain", "Fasih"],
      datasets: [
        {
          label: "Idle Minutes",
          data: [30, 15, 45, 10],
          backgroundColor: "rgba(239,68,68,0.7)", // red
          borderRadius: 10,
        },
        {
          label: "Active Minutes",
          data: [210, 225, 195, 240],
          backgroundColor: "rgba(59,130,246,0.7)", // blue
          borderRadius: 10,
        },
      ],
    });
  }, []);

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <Bar
        data={chartData}
        options={{
          responsive: true,
          plugins: {
            legend: { position: "top" },
            title: { display: true, text: "Employee Activity (Minutes)" },
          },
        }}
      />
    </div>
  );
}
