import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, LogIn, LogOut, Calendar, Timer } from "lucide-react";

export default function DashboardPage() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Mock data
  const user = { name: "Budi Santoso" };
  const stats = {
    checkIn: "07:45",
    checkOut: "--:--",
    totalHours: "4j 15m",
  };
  const activities = [
    {
      date: "27 Jan 2026",
      checkIn: "07:50",
      checkOut: "17:05",
      status: "Hadir",
    },
    {
      date: "26 Jan 2026",
      checkIn: "07:45",
      checkOut: "17:00",
      status: "Hadir",
    },
    {
      date: "25 Jan 2026",
      checkIn: "--:--",
      checkOut: "--:--",
      status: "Libur",
    },
  ];

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

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <LogIn className="h-4 w-4" /> Waktu Masuk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.checkIn}</div>
            <p className="text-xs text-muted-foreground mt-1">Tepat waktu</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <LogOut className="h-4 w-4" /> Waktu Pulang
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.checkOut}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Belum absen pulang
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
            <div className="text-2xl font-bold">{stats.totalHours}</div>
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
                  {activities.map((activity, index) => (
                    <tr
                      key={index}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium">{activity.date}</td>
                      <td className="px-6 py-4">{activity.checkIn}</td>
                      <td className="px-6 py-4">{activity.checkOut}</td>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
