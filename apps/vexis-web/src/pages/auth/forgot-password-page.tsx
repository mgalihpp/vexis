import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";

const schema = z.object({
  email: z.string().email("Alamat email tidak valid"),
});

type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: Values) => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await api.post("/auth/forgot-password", data);
      setMessage(
        "Jika akun terdaftar, Anda akan segera menerima link reset password.",
      );
    } catch (err: any) {
      setError(err.response?.data || "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-6 md:p-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2">
            <Link
              to="/login"
              className="text-sm text-muted-foreground flex items-center hover:text-primary"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke halaman masuk
            </Link>
          </div>
          <CardTitle className="text-2xl">Lupa Password</CardTitle>
          <CardDescription>
            Masukkan email Anda dan kami akan mengirimkan link untuk mengatur
            ulang password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nama@email.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            {message && (
              <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md border border-green-200">
                {message}
              </div>
            )}
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Kirim Link Reset
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
