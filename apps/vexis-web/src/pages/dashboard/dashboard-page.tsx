import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, LogIn, LogOut, Calendar, Timer, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDashboardStats } from "@/lib/api";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: getDashboardStats,
  });

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Get user from localStorage
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : { name: "Pengguna" };

  // Calculate total hours if both check-in and check-out exist
  const calculateTotalHours = () => {
    if (!dashboardData?.check_in || !dashboardData?.check_out) {
      return "--:--";
    }
    try {
      const [inHour, inMin] = dashboardData.check_in.split(":").map(Number);
      const [outHour, outMin] = dashboardData.check_out.split(":").map(Number);

      const totalMinutes = outHour * 60 + outMin - (inHour * 60 + inMin);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      return `${hours}j ${minutes}m`;
    } catch {
      return "--:--";
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-5xl">
        <div className="text-center">Memuat...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Halo, {user.name} 👋
          </h1>
          <p className="text-muted-foreground">
            {time.toLocaleDateString("id-ID", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-secondary/50 px-4 py-2 rounded-lg border">
          <Clock className="h-5 w-5 text-primary" />
          <span className="text-xl font-mono font-medium">
            {time.toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>
      </div>

      {/* Attendance Action */}
      {(!dashboardData?.check_in || !dashboardData?.check_out) && (
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-full">
                  <UserCheck className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">
                    {!dashboardData?.check_in
                      ? "Belum Absen Masuk"
                      : "Belum Absen Pulang"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {!dashboardData?.check_in
                      ? "Silakan lakukan absensi masuk terlebih dahulu"
                      : "Jangan lupa absen pulang sebelum meninggalkan kantor"}
                  </p>
                </div>
              </div>
              <Button
                size="lg"
                className="w-full md:w-auto"
                onClick={() => navigate("/attendance")}
              >
                <UserCheck className="mr-2 h-5 w-5" />
                Absen Sekarang
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <LogIn className="h-4 w-4" /> Waktu Masuk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData?.check_in || "--:--"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {dashboardData?.check_in ? "Tepat waktu" : "Belum absen"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <LogOut className="h-4 w-4" /> Waktu Pulang
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData?.check_out || "--:--"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {dashboardData?.check_out ? "Sudah absen" : "Belum absen pulang"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Timer className="h-4 w-4" /> Total Jam Kerja
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{calculateTotalHours()}</div>
            <p className="text-xs text-muted-foreground mt-1">Target: 8 jam</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Calendar className="h-5 w-5" /> Aktivitas Terakhir
        </h2>
        <Card>
          <CardContent className="p-0">
            {dashboardData?.recent_logs &&
            dashboardData.recent_logs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3 font-medium">Tanggal</th>
                      <th className="px-6 py-3 font-medium">Masuk</th>
                      <th className="px-6 py-3 font-medium">Pulang</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dashboardData.recent_logs.map((activity, index) => (
                      <tr
                        key={index}
                        className="hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-6 py-4 font-medium">
                          {activity.date}
                        </td>
                        <td className="px-6 py-4">
                          {activity.check_in || "--:--"}
                        </td>
                        <td className="px-6 py-4">
                          {activity.check_out || "--:--"}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              activity.status === "Hadir"
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {activity.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                Belum ada riwayat absensi.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
