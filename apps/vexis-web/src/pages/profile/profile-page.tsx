import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  User as UserIcon,
  MapPin,
  Camera,
  LogOut,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from "@/lib/api";
import { EditProfileForm } from "@/components/profile/edit-profile-form";
import { FaceCapture } from "@/components/face/face-capture";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  identifier: string;
  role: string;
  photo_url: string | null;
  has_face_landmarks: boolean;
  office_location: {
    type: string;
    coordinates: number[];
  };
}

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const [isRegisteringFace, setIsRegisteringFace] = useState(false);
  const navigate = useNavigate();

  const { data: user, isLoading: loading } = useQuery<UserProfile>({
    queryKey: ["profile"],
    queryFn: () => api.get("/users/me").then((r) => r.data),
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await api.post("/users/me/photo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Foto berhasil diperbarui", {
        id: "upload",
      });
    },
    onError: () => {
      toast.error("Gagal mengunggah foto", { id: "upload" });
    },
  });

  const registerFaceMutation = useMutation({
    mutationFn: async (landmarks: any) => {
      await api.post("/users/me/face", { landmarks });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setIsRegisteringFace(false);
      toast.success("Wajah berhasil didaftarkan", {
        id: "face",
      });
    },
    onError: () => {
      toast.error("Gagal mendaftarkan wajah", {
        id: "face",
      });
    },
  });

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="container mx-auto py-10 px-4 max-w-4xl">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Left Sidebar - Profile Overview */}
        <div className="w-full md:w-1/3 space-y-6">
          <Card>
            <CardContent className="pt-6 flex flex-col items-center text-center">
              <div className="relative group">
                <Avatar className="h-32 w-32 border-4 border-primary/10">
                  <AvatarImage src={user.photo_url || ""} />
                  <AvatarFallback className="text-4xl bg-primary/5">
                    {user.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <label
                  htmlFor="photo-upload"
                  className="absolute bottom-0 right-0 p-2 bg-primary text-white rounded-full cursor-pointer hover:bg-primary/90 shadow-lg"
                >
                  <Camera className="h-4 w-4" />
                  <input
                    id="photo-upload"
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      toast.loading("Mengunggah foto...", { id: "upload" });
                      uploadPhotoMutation.mutate(file);
                    }}
                  />
                </label>
              </div>
              <h2 className="mt-4 text-2xl font-bold">{user.name}</h2>
              <p className="text-muted-foreground">{user.email}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Badge
                  variant={user.role === "admin" ? "default" : "secondary"}
                >
                  {user.role.toUpperCase()}
                </Badge>
                <Badge
                  variant={user.has_face_landmarks ? "success" : "destructive"}
                >
                  {user.has_face_landmarks
                    ? "Wajah Terdaftar"
                    : "Wajah Belum Terdaftar"}
                </Badge>
              </div>

              <Button
                variant="outline"
                className="w-full mt-8 text-destructive hover:bg-destructive/10"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Keluar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Informasi Kantor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 text-sm">
                <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Lokasi Terdaftar</p>
                  <p className="text-muted-foreground">
                    {user.office_location.coordinates[1].toFixed(6)},{" "}
                    {user.office_location.coordinates[0].toFixed(6)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Content - Tabs */}
        <div className="flex-1">
          <Tabs defaultValue="profile">
            <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-6">
              <TabsTrigger
                value="profile"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
              >
                Profil Akun
              </TabsTrigger>
              <TabsTrigger
                value="face"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
              >
                Pendaftaran Wajah
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Sunting Profil</CardTitle>
                  <CardDescription>
                    Perbarui informasi dasar akun Anda.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <EditProfileForm
                    initialData={{
                      name: user.name,
                      identifier: user.identifier,
                    }}
                    onSuccess={() => {
                      queryClient.invalidateQueries({
                        queryKey: ["profile"],
                      });
                    }}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="face">
              <Card>
                <CardHeader>
                  <CardTitle>Pendaftaran Wajah</CardTitle>
                  <CardDescription>
                    Daftarkan wajah Anda untuk verifikasi absensi yang lebih
                    aman.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                  {isRegisteringFace ? (
                    <FaceCapture
                      onCapture={(landmarks) => {
                        toast.loading("Mendaftarkan wajah...", {
                          id: "face",
                        });
                        registerFaceMutation.mutate(landmarks);
                      }}
                      onCancel={() => setIsRegisteringFace(false)}
                    />
                  ) : user.has_face_landmarks ? (
                    <div className="space-y-4">
                      <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                        <UserIcon className="h-10 w-10 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-lg font-medium">
                          Wajah Sudah Terdaftar
                        </h3>
                        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                          Wajah Anda sudah berhasil didaftarkan. Anda dapat
                          memperbarui jika diperlukan.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setIsRegisteringFace(true)}
                      >
                        Perbarui Wajah
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="h-20 w-20 bg-muted rounded-full flex items-center justify-center mx-auto">
                        <Camera className="h-10 w-10 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="text-lg font-medium">Belum Ada Wajah</h3>
                        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                          Anda perlu mendaftarkan wajah Anda agar dapat
                          melakukan absensi.
                        </p>
                      </div>
                      <Button onClick={() => setIsRegisteringFace(true)}>
                        Mulai Pendaftaran
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
