import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getGlobalAttendance, downloadAttendanceReport } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  MapPin,
  Calendar,
} from "lucide-react";

export default function AttendancePage() {
  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const {
    data: logsData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["adminAttendance", { page, limit, startDate, endDate }],
    queryFn: () =>
      getGlobalAttendance({
        page,
        limit,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      }),
  });

  const { mutate: handleExport, isPending: isExporting } = useMutation({
    mutationFn: () =>
      downloadAttendanceReport({
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      }),
    onSuccess: () => {
      toast.success("Laporan berhasil diunduh");
    },
    onError: (error) => {
      console.error(error);
      toast.error("Gagal mengunduh laporan");
    },
  });

  const logs = logsData?.data || [];
  const total = logsData?.total || 0;

  const handleFilter = () => {
    setPage(1); // Reset to first page
    refetch();
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Laporan Absensi</h1>
          <div className="text-sm text-muted-foreground mt-1">
            Total: {total} Catatan
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-card border rounded-md p-1">
            <div className="relative">
              <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="date"
                className="h-9 w-[130px] bg-transparent pl-9 pr-3 text-sm focus:outline-none"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="Tanggal Mulai"
              />
            </div>
            <span className="text-muted-foreground">-</span>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="date"
                className="h-9 w-[130px] bg-transparent pl-9 pr-3 text-sm focus:outline-none"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="Tanggal Akhir"
              />
            </div>
          </div>
          <Button variant="secondary" onClick={handleFilter}>
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
          <Button onClick={() => handleExport()} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Ekspor CSV
          </Button>
        </div>
      </div>

      <div className="border rounded-md bg-card">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm text-left">
            <thead className="[&_tr]:border-b">
              <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                  Tanggal
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                  Waktu
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                  Nama
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                  Email
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                  Tipe
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                  Lokasi
                </th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="h-24 text-center">
                    <div className="flex justify-center items-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Tidak ada data absensi
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                  >
                    <td className="p-4 align-middle font-medium">
                      {formatDate(log.timestamp)}
                    </td>
                    <td className="p-4 align-middle text-muted-foreground">
                      {formatTime(log.timestamp)}
                    </td>
                    <td className="p-4 align-middle">{log.user_name}</td>
                    <td className="p-4 align-middle text-muted-foreground">
                      {log.user_email}
                    </td>
                    <td className="p-4 align-middle">
                      <Badge
                        variant={log.type === "IN" ? "success" : "warning"}
                        className="uppercase"
                      >
                        {log.type}
                      </Badge>
                    </td>
                    <td className="p-4 align-middle">
                      <div className="flex items-center text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 mr-1" />
                        {log.latitude.toFixed(5)}, {log.longitude.toFixed(5)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-end space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1 || isLoading}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Sebelumnya
        </Button>
        <div className="text-sm font-medium">
          Halaman {page} dari {totalPages || 1}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || isLoading}
        >
          Selanjutnya
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
