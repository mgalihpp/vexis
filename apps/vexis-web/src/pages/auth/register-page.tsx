import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
import { LocationPicker } from "@/components/location/location-picker";
import api from "@/lib/api";

const registerSchema = z.object({
  name: z.string().min(2, "Nama wajib diisi"),
  email: z.string().email("Email tidak valid"),
  identifier: z.string().min(3, "ID (NIP/NIM) wajib diisi"),
  password: z.string().min(6, "Password minimal 6 karakter"),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
});

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      location: { lat: -6.2088, lng: 106.8456 }, // Jakarta default
    },
  });

  const onSubmit = async (data: RegisterValues) => {
    setLoading(true);
    setError(null);
    try {
      await api.post("/auth/register", {
        name: data.name,
        email: data.email,
        identifier: data.identifier,
        password: data.password,
        role: "user",
        lat: data.location.lat,
        long: data.location.lng,
      });
      navigate("/login");
    } catch (err: any) {
      setError(err.response?.data || "Gagal mendaftar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-6 md:p-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Buat Akun Baru</CardTitle>
          <CardDescription>
            Lengkapi data di bawah ini untuk mendaftar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nama Lengkap</Label>
              <Input id="name" {...register("name")} />
              {errors.name && (
                <p className="text-xs text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && (
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="identifier">NIP / NIM</Label>
              <Input id="identifier" {...register("identifier")} />
              {errors.identifier && (
                <p className="text-xs text-destructive">
                  {errors.identifier.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" {...register("password")} />
              {errors.password && (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Lokasi Kantor (Pilih di Peta)</Label>
              <Controller
                control={control}
                name="location"
                render={({ field }) => (
                  <LocationPicker
                    value={field.value}
                    onChange={field.onChange}
                    height="200px"
                  />
                )}
              />
            </div>
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Daftar
            </Button>
            <div className="text-center text-sm">
              Sudah punya akun?{" "}
              <a
                href="/login"
                className="font-medium text-primary hover:underline"
              >
                Masuk
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
