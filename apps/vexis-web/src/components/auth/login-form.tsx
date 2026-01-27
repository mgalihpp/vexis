import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2 } from "lucide-react";

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
import { Checkbox } from "@/components/ui/checkbox";
import api from "@/lib/api";

const loginSchema = z.object({
  email_or_id: z.string().min(1, "Email atau ID wajib diisi"),
  password: z.string().min(6, "Password minimal 6 karakter"),
  remember: z.boolean().default(false).optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm({ role = "user" }: { role?: "user" | "admin" }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email_or_id: "",
      password: "",
      remember: false,
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post("/auth/login", data);
      const { access_token, refresh_token, user } = response.data;

      if (user.role !== role) {
        throw new Error(`Tidak diizinkan. Portal ini hanya untuk ${role}.`);
      }

      localStorage.setItem("access_token", access_token);
      localStorage.setItem("refresh_token", refresh_token);
      localStorage.setItem("user", JSON.stringify(user));

      // Redirect based on role
      window.location.href =
        role === "admin" ? "/admin/dashboard" : "/dashboard";
    } catch (err: any) {
      setError(err.response?.data || err.message || "Gagal masuk");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mx-auto max-w-sm w-full">
      <CardHeader>
        <CardTitle className="text-2xl text-center">
          Masuk {role === "admin" ? "Admin" : ""}
        </CardTitle>
        <CardDescription className="text-center">
          Masukkan email atau ID Anda untuk masuk ke akun
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="email_or_id">Email / NIP / NIM</Label>
            <Input
              id="email_or_id"
              placeholder="nama@email.com atau 123456"
              {...register("email_or_id")}
              className={errors.email_or_id ? "border-destructive" : ""}
            />
            {errors.email_or_id && (
              <p className="text-xs text-destructive">
                {errors.email_or_id.message}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-primary hover:underline"
              >
                Lupa password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              {...register("password")}
              className={errors.password ? "border-destructive" : ""}
            />
            {errors.password && (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="remember" {...register("remember")} />
            <label
              htmlFor="remember"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Ingat saya
            </label>
          </div>
          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
              {error}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Masuk
          </Button>
          <div className="text-center text-sm">
            Belum punya akun?{" "}
            <Link
              to="/register"
              className="font-medium text-primary hover:underline"
            >
              Daftar
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
