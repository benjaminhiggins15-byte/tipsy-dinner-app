// TEMPORARY — Checkpoint 1 verification for recipe-photos bucket. DELETE this file
// and its one mount point in App.tsx before proceeding past Step 0.
import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function TempBucketCheck() {
  const [result, setResult] = useState<string>("");
  const [running, setRunning] = useState(false);

  async function runCheck() {
    setRunning(true);
    const lines: string[] = [];
    try {
      const { data: userData } = await supabase.auth.getUser();
      lines.push(`auth user: ${userData?.user?.id ?? "NONE (not logged in)"}`);

      const path = `${userData?.user?.id ?? "anon"}/verify-${Date.now()}.txt`;
      const blob = new Blob(["tipsy-dinner bucket verification"], { type: "text/plain" });

      const { error: uploadError } = await supabase.storage
        .from("recipe-photos")
        .upload(path, blob, { contentType: "text/plain" });

      if (uploadError) {
        lines.push(`1. AUTHENTICATED UPLOAD: FAILED — ${uploadError.message}`);
      } else {
        lines.push(`1. AUTHENTICATED UPLOAD: SUCCESS (path: ${path})`);
      }

      const { data: publicUrlData } = supabase.storage.from("recipe-photos").getPublicUrl(path);
      const publicUrl = publicUrlData.publicUrl;
      lines.push(`3. PUBLIC URL FORMAT: ${publicUrl}`);

      try {
        const res = await fetch(publicUrl, { cache: "no-store" });
        lines.push(`2. UNAUTHENTICATED FETCH: ${res.ok ? "SUCCESS" : "FAILED"} (status ${res.status})`);
      } catch (fetchErr) {
        lines.push(`2. UNAUTHENTICATED FETCH: FAILED — ${(fetchErr as Error).message}`);
      }

      // best-effort cleanup of the test object
      const { error: removeError } = await supabase.storage.from("recipe-photos").remove([path]);
      lines.push(`cleanup delete: ${removeError ? `FAILED — ${removeError.message}` : "ok"}`);
    } catch (err) {
      lines.push(`UNEXPECTED ERROR: ${(err as Error).message}`);
    }
    setResult(lines.join("\n"));
    console.log(lines.join("\n"));
    setRunning(false);
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        left: 8,
        zIndex: 9999,
        background: "#FAF7F2",
        border: "2px solid red",
        padding: 10,
        borderRadius: 8,
        maxWidth: 320,
        fontSize: 11,
        fontFamily: "monospace",
      }}
    >
      <button onClick={runCheck} disabled={running} style={{ marginBottom: 6 }}>
        {running ? "running..." : "TEMP: run bucket check"}
      </button>
      <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{result}</pre>
    </div>
  );
}
