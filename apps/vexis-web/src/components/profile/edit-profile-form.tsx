import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";

const profileSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  identifier: z.string().min(3, "ID (NIP/NIM) minimal 3 karakter"),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface EditProfileFormProps {
  initialData: ProfileFormValues;
  onSuccess: (data: Partial<ProfileFormValues>) => void;
}

export function EditProfileForm({
  initialData,
  onSuccess,
}: EditProfileFormProps) {
  const [loading, setLoading] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: initialData,
  });

  async function onSubmit(data: ProfileFormValues) {
    setLoading(true);
    try {
      await api.put("/users/me", data);
      toast.success("Profil berhasil diperbarui");
      onSuccess(data);
    } catch (error: any) {
      toast.error(error.response?.data || "Gagal memperbarui profil");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nama Lengkap</FormLabel>
              <FormControl>
                <Input placeholder="Nama Anda" {...field} />
              </FormControl>
              <FormDescription>
                Nama ini akan muncul pada laporan absensi.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="identifier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>NIP / NIM</FormLabel>
              <FormControl>
                <Input placeholder="12345678" {...field} />
              </FormControl>
              <FormDescription>
                Nomor identitas unik Anda di sistem.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Menyimpan...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Simpan Perubahan
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
