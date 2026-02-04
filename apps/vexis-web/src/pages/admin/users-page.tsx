import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getUsers, deleteUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
} from "lucide-react";

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Current user (to prevent self-delete)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        setCurrentUserId(user.id);
      }
    } catch (e) {
      console.error("Failed to parse user from local storage", e);
    }
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["users", { page, limit }],
    queryFn: () => getUsers({ page, limit }),
  });

  const users = data?.users ?? [];
  const total = data?.total ?? 0;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      toast.success("Pengguna berhasil dihapus");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDeleteId(null);
    },
    onError: (error) => {
      console.error(error);
      toast.error("Gagal menghapus pengguna");
    },
  });

  const handleDelete = async () => {
    if (!deleteId) return;
    deleteMutation.mutate(deleteId);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          Manajemen Pengguna
        </h1>
        <div className="text-sm text-muted-foreground">
          Total: {total} Pengguna
        </div>
      </div>

      <div className="border rounded-md bg-card">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm text-left">
            <thead className="[&_tr]:border-b">
              <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                  Nama
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                  Email
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                  Identifier
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                  Peran
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                  Wajah
                </th>
                <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">
                  Aksi
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
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Tidak ada data pengguna
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                  >
                    <td className="p-4 align-middle">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center overflow-hidden border">
                          {user.photo_url ? (
                            <img
                              src={user.photo_url}
                              alt={user.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <UserIcon className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <span className="font-medium">{user.name}</span>
                      </div>
                    </td>
                    <td className="p-4 align-middle">{user.email}</td>
                    <td className="p-4 align-middle font-mono text-xs">
                      {user.identifier}
                    </td>
                    <td className="p-4 align-middle capitalize">{user.role}</td>
                    <td className="p-4 align-middle">
                      <Badge
                        variant={
                          user.has_face_landmarks ? "success" : "secondary"
                        }
                        className={
                          !user.has_face_landmarks
                            ? "text-muted-foreground"
                            : ""
                        }
                      >
                        {user.has_face_landmarks ? "Terdaftar" : "Belum Daftar"}
                      </Badge>
                    </td>
                    <td className="p-4 align-middle text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        disabled={user.id === currentUserId}
                        onClick={() => setDeleteId(user.id)}
                        title={
                          user.id === currentUserId
                            ? "Tidak dapat menghapus diri sendiri"
                            : "Hapus Pengguna"
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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

      <Dialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Penghapusan</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus pengguna ini? Tindakan ini tidak
              dapat dibatalkan dan semua data absensi pengguna ini juga akan
              dihapus.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteId(null)}
              disabled={deleteMutation.isPending}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
