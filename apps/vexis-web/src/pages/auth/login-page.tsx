import { LoginForm } from "@/components/auth/login-form";
import { GalleryVerticalEnd } from "lucide-react";

export default function LoginPage({
  role = "user",
}: {
  role?: "user" | "admin";
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="/" className="flex items-center gap-2 font-semibold">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GalleryVerticalEnd className="size-4" />
            </div>
            Vexis
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <LoginForm role={role} />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <img
          src="https://images.unsplash.com/photo-1556761175-5973dc0f32e7?q=80&w=2064&auto=format&fit=crop"
          alt="Image"
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
        />
        <div className="absolute inset-0 flex items-end p-10 bg-gradient-to-t from-black/60 to-transparent">
          <div className="text-white">
            <h2 className="text-3xl font-bold">
              Kelola Absensi Jadi Lebih Mudah
            </h2>
            <p className="mt-4 text-lg text-gray-200">
              Sistem absensi modern, aman, dan efisien untuk instansi dan
              perusahaan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
