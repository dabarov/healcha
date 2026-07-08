export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main
      className="flex min-h-dvh items-center justify-center p-6"
      style={{ background: "var(--bg)" }}
    >
      <form
        method="POST"
        action="/api/auth/login"
        className="card rise flex w-full max-w-sm flex-col gap-4 p-6"
      >
        <div className="flex flex-col gap-1">
          <h1
            className="head text-[28px] font-bold leading-none tracking-[-0.02em]"
            style={{ color: "var(--accent)" }}
          >
            healcha
          </h1>
          <p className="text-[13px]" style={{ color: "var(--faint)" }}>
            train with your data
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--mut)" }}>
            Enter the access secret to continue.
          </p>
        </div>
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
          className="input"
        />
        <button type="submit" className="btn btn-accent w-full">
          Unlock
        </button>
      </form>
    </main>
  );
}
