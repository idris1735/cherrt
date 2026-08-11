import { redirect } from "next/navigation";

export default function IndexPage() {
  redirect("/auth/sign-in");
}
