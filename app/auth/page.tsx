import { redirect } from "next/navigation";

/**
 * Legacy /auth route — redirect to new /login page.
 */
export default function AuthRedirect() {
  redirect("/login");
}
