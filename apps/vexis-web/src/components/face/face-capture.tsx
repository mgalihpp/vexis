import { useEffect, useRef, useState, useCallback } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { Camera, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface FaceCaptureProps {
  onCapture: (landmarks: number[]) => void;
  onCancel?: () => void;
}

export function FaceCapture({ onCapture, onCancel }: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(
    null,
  );
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [captureComplete, setCaptureComplete] = useState(false);
  const [lastResult, setLastResult] = useState<FaceLandmarkerResult | null>(
    null,
  );

  // Initialize MediaPipe
  useEffect(() => {
    async function initMediaPipe() {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm",
        );
        const landmarker = await FaceLandmarker.createFromOptions(
          filesetResolver,
          {
            baseOptions: {
              modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
              delegate: "GPU",
            },
            outputFaceBlendshapes: true,
            runningMode: "VIDEO",
            numFaces: 1,
          },
        );
        setFaceLandmarker(landmarker);
      } catch (error) {
        console.error("Failed to init MediaPipe", error);
        toast.error("Gagal inisialisasi modul deteksi wajah");
      }
    }
    initMediaPipe();
  }, []);

  // Setup Camera
  useEffect(() => {
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            setIsCameraReady(true);
          };
        }
      } catch (error) {
        console.error("Camera error", error);
        toast.error("Gagal mengakses kamera");
      }
    }
    setupCamera();

    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((t) => t.stop());
      }
    };
  }, []);

  // Process video frames
  const predictWebcam = useCallback(() => {
    if (
      !faceLandmarker ||
      !videoRef.current ||
      !isCameraReady ||
      captureComplete
    )
      return;

    const startTimeMs = performance.now();
    const results = faceLandmarker.detectForVideo(
      videoRef.current,
      startTimeMs,
    );
    setLastResult(results);

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      // Draw landmarks on canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // Optional: Draw bounding box or landmarks for visual feedback
        }
      }
    }

    requestAnimationFrame(predictWebcam);
  }, [faceLandmarker, isCameraReady, captureComplete]);

  useEffect(() => {
    if (isCameraReady && faceLandmarker) {
      predictWebcam();
    }
  }, [isCameraReady, faceLandmarker, predictWebcam]);

  const handleCapture = () => {
    if (!lastResult || lastResult.faceLandmarks.length === 0) {
      toast.error("Wajah tidak terdeteksi");
      return;
    }

    setIsProcessing(true);

    // Flatten landmarks: 478 points * 3 coordinates = 1434 values
    const landmarks = lastResult.faceLandmarks[0];
    const flattened = landmarks.flatMap((p) => [p.x, p.y, p.z]);

    setCaptureComplete(true);
    setIsProcessing(false);
    onCapture(flattened);
  };

  const resetCapture = () => {
    setCaptureComplete(false);
    predictWebcam();
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-[480px] aspect-[4/3] bg-black rounded-lg overflow-hidden border-2 border-primary/20">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover ${captureComplete ? "hidden" : ""}`}
        />
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {!isCameraReady && !captureComplete && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white gap-2">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Menyiapkan kamera...</p>
          </div>
        )}

        {captureComplete && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/20 text-emerald-600 backdrop-blur-sm">
            <CheckCircle2 className="h-16 w-16 mb-2" />
            <p className="font-bold">Wajah Terdeteksi</p>
          </div>
        )}

        {lastResult?.faceLandmarks &&
          lastResult.faceLandmarks.length > 0 &&
          !captureComplete && (
            <div className="absolute top-4 right-4 bg-emerald-500 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1 animate-pulse">
              <div className="h-2 w-2 bg-white rounded-full" />
              Wajah Terdeteksi
            </div>
          )}
      </div>

      <div className="flex gap-2 w-full max-w-[480px]">
        {captureComplete ? (
          <Button variant="outline" className="flex-1" onClick={resetCapture}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Ulangi
          </Button>
        ) : (
          <Button
            className="flex-1"
            onClick={handleCapture}
            disabled={!isCameraReady || !lastResult?.faceLandmarks?.length}
          >
            {isProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Camera className="mr-2 h-4 w-4" />
            )}
            Ambil Data Wajah
          </Button>
        )}
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Batal
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Pastikan pencahayaan cukup dan wajah Anda terlihat jelas tanpa penutup.
      </p>
    </div>
  );
}
