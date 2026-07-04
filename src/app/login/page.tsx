export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <form
        method="POST"
        action="/api/auth/login"
        className="card w-full max-w-sm p-8 flex flex-col gap-4"
      >
        <h1 className="text-lg font-semibold">Health dashboard</h1>
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>
          Enter the access secret to continue.
        </p>
        {error && (
          <p className="text-sm" style={{ color: "var(--bad)" }}>
            Wrong secret — try again.
          </p>
        )}
        <input
          type="password"
          name="password"
          autoFocus
          placeholder="Access secret"
          className="rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--page)",
            border: "1px solid var(--hairline)",
            color: "var(--ink)",
          }}
        />
        <button
          type="submit"
          className="rounded-lg px-3 py-2 text-sm font-medium"
          style={{ background: "var(--c-readiness)", color: "#fff" }}
        >
          Unlock
        </button>
      </form>
    </main>
  );
}
