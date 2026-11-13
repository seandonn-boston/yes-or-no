import Link from "next/link";
import { Header } from "@/components/Header";

export default function GoodbyePage() {
  return (
    <>
      <Header />
      <main className="wrap wrap-narrow">
        <h1 className="page-title">Your account is deleted</h1>
        <p>Your votes have been withdrawn and you&apos;ve been signed out. You can still browse questions.</p>
        <p><Link href="/">Back to questions</Link></p>
      </main>
    </>
  );
}
