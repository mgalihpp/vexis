import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { checkAttendance } from "@/lib/api";
import { FaceCapture } from "@/components/face/face-capture";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  MapPin,
  Camera,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Navigation,
  ScanFace,
} from "lucide-react";

export default function AttendancePage() {
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());

  // State
  const [gpsStatus, setGpsStatus] = useState<
    "idle" | "fetching" | "success" | "error"
  >("idle");
  const [gpsCoords, setGpsCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [faceLandmarks, setFaceLandmarks] = useState<number[] | null>(null);

  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: checkAttendance,
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ["dashboard", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      navigate("/dashboard");
    },
    onError: (error: any) => {
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data ||
        "Gagal mengirim absensi";
      toast.error(
        typeof errorMessage === "string"
          ? errorMessage
          : "Gagal mengirim absensi",
      );
    },
  });

  // Time update
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // GPS Auto-fetch
  useEffect(() => {
    setGpsStatus("fetching");
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setGpsStatus("success");
        },
        (error) => {
          console.error(error);
          setGpsStatus("error");
          toast.error(
            "Gagal mengakses lokasi GPS. Pastikan izin lokasi aktif.",
          );
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    } else {
      setGpsStatus("error");
      toast.error("GPS tidak tersedia di perangkat ini");
    }
  }, []);

  const handleFaceCapture = (landmarks: number[]) => {
    setFaceLandmarks(landmarks);
    toast.success("Wajah berhasil dideteksi");
  };

  const handleSubmit = () => {
    if (!gpsCoords || !faceLandmarks) return;

    mutation.mutate({
      latitude: gpsCoords.lat,
      longitude: gpsCoords.lng,
      landmarks: faceLandmarks,
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            className="pl-0 hover:bg-transparent text-muted-foreground mb-2"
            onClick={() => navigate("/dashboard")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Dashboard
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Absensi Masuk</h1>
          <p className="text-muted-foreground">
            {time.toLocaleDateString("id-ID", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            •{" "}
            {time.toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Camera Section - Takes full width on mobile, left col on desktop */}
        <div className="md:col-span-2 flex justify-center bg-black/5 rounded-xl p-4 border-2 border-dashed border-primary/10">
          <FaceCapture onCapture={handleFaceCapture} />
        </div>

        {/* Status Cards */}
        <Card
          className={
            gpsStatus === "success"
              ? "border-emerald-500/50 bg-emerald-500/5"
              : ""
          }
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin
                className={`h-4 w-4 ${gpsStatus === "success" ? "text-emerald-600" : "text-muted-foreground"}`}
              />
              Lokasi GPS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              {gpsStatus === "fetching" && (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              )}
              {gpsStatus === "success" && (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              )}
              {gpsStatus === "error" && (
                <XCircle className="h-5 w-5 text-destructive" />
              )}

              <div className="text-sm">
                {gpsStatus === "fetching" && "Mencari lokasi..."}
                {gpsStatus === "success" && gpsCoords && (
                  <div className="font-mono text-xs">
                    {gpsCoords.lat.toFixed(6)}, {gpsCoords.lng.toFixed(6)}
                  </div>
                )}
                {gpsStatus === "error" && "Gagal mengambil lokasi"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={
            faceLandmarks ? "border-emerald-500/50 bg-emerald-500/5" : ""
          }
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ScanFace
                className={`h-4 w-4 ${faceLandmarks ? "text-emerald-600" : "text-muted-foreground"}`}
              />
              Deteksi Wajah
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              {faceLandmarks ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700">
                    Wajah Terdeteksi
                  </span>
                </>
              ) : (
                <>
                  <Camera className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Menunggu pengambilan foto...
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 pt-4">
        <Button
          size="lg"
          className="w-full text-lg h-12"
          onClick={handleSubmit}
          disabled={
            gpsStatus !== "success" || !faceLandmarks || mutation.isPending
          }
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Mengirim Absensi...
            </>
          ) : (
            <>
              <Navigation className="mr-2 h-5 w-5" />
              Kirim Absensi Sekarang
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => navigate("/dashboard")}
        >
          Batalkan
        </Button>
      </div>
    </div>
  );
}
