export function layout(title: string, content: string, extraHead = ""): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - 文化祭飲食システム</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans JP", sans-serif; background: #fff; color: #111827; line-height: 1.6; }
    button { cursor: pointer; font: inherit; }
    input, select, textarea { font: inherit; }

    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 8px 16px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; font-weight: 600; transition: all .15s; background:#fff; color:#111827; }
    .btn:hover { background:#f9fafb; }
    .btn:active { transform: scale(.97); }
    .btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }
    .btn-primary { background: #111827; border-color:#111827; color: white; }
    .btn-primary:hover { background:#374151; }
    .btn-success { background: #111827; border-color:#111827; color: white; }
    .btn-warning { background: #fff; border-color:#9ca3af; color: #111827; }
    .btn-danger { background: #fff; border-color:#dc2626; color: #b91c1c; }
    .btn-secondary { background: #fff; color: #374151; }
    .btn-outline { background: transparent; border: 1px solid #111827; color: #111827; }
    .btn-lg { padding: 14px 28px; font-size: 18px; border-radius: 12px; }
    .btn-sm { padding: 4px 10px; font-size: 12px; }
    .btn-block { width: 100%; }

    .card { background: white; border-radius: 8px; padding: 24px; border:1px solid #e5e7eb; box-shadow:none; }
    .grid { display: grid; gap: 12px; }
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .gap-2 { gap: 8px; }
    .gap-4 { gap: 16px; }
    .text-center { text-align: center; }
    .text-lg { font-size: 1.25rem; }
    .text-xl { font-size: 1.5rem; }
    .text-2xl { font-size: 2rem; }
    .text-3xl { font-size: 3rem; }
    .font-bold { font-weight: 700; }
    .mt-2 { margin-top: 8px; }
    .mt-4 { margin-top: 16px; }
    .mb-2 { margin-bottom: 8px; }
    .mb-4 { margin-bottom: 16px; }
    .p-4 { padding: 16px; }
    .w-full { width: 100%; }

    .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #333; color: white; padding: 12px 24px; border-radius: 8px; z-index: 9999; animation: toastIn .3s, toastOut .3s 2.7s; }
    @keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
    @keyframes toastOut { from { opacity: 1; } to { opacity: 0; } }

    .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .badge-blue { background: #f3f4f6; color: #111827; }
    .badge-green { background: #f0fdf4; color: #166534; }
    .badge-orange { background: #f9fafb; color: #374151; }
    .badge-gray { background: #e5e7eb; color: #4b5563; }
    .badge-red { background: #fecaca; color: #991b1b; }
  </style>
  ${extraHead}
</head>
<body>
  ${content}
</body>
</html>`;
}

export function loginPage(error = ""): string {
  return layout("ログイン", `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fff;padding:24px;">
      <div class="card" style="width:100%;max-width:400px;">
        <h1 class="text-2xl font-bold text-center mb-4">文化祭 注文システム</h1>
        ${error ? `<div style="background:#fff;color:#991b1b;border:1px solid #fecaca;padding:10px;border-radius:8px;margin-bottom:12px;text-align:center;">${error}</div>` : ""}
        <form method="POST" action="/login" class="flex flex-col gap-4">
          <input type="text" name="username" placeholder="ユーザー名" required style="padding:12px;border:1px solid #d1d5db;border-radius:8px;font-size:16px;">
          <input type="password" name="password" placeholder="パスワード" required style="padding:12px;border:1px solid #d1d5db;border-radius:8px;font-size:16px;">
          <button type="submit" class="btn btn-primary btn-lg btn-block">ログイン</button>
        </form>
      </div>
    </div>
  `);
}

export function notFoundPage(): string {
  return layout("ページが見つかりません", `
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center;">
      <h1 class="text-3xl font-bold mb-4">404</h1>
      <p class="mb-4">ページが見つかりませんでした。</p>
      <p>注文番号またはURLをご確認ください。</p>
    </div>
  `);
}
