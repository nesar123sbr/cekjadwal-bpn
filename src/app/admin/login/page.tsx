import { redirect } from "next/navigation";
import LoginForm from "@/components/admin/LoginForm";
import { getSession } from "@/lib/session";

export const metadata = { title: "Login TU - CekJadwal BPN" };

export default async function AdminLoginPage() {
  if (await getSession()) redirect("/admin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Login Staf TU</h1>
        <p className="mb-5 mt-1 text-sm text-gray-600">CekJadwal BPN - Akses internal</p>
        <LoginForm />
      </div>
    </main>
  );
}
