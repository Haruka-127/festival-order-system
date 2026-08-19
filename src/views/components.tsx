import { Html } from "@elysia/html";
import { pageDocument } from "./layout";

function authDocument(title: string, content: JSX.Element): string {
  return pageDocument({
    title: `${title} - 文化祭飲食システム`,
    viewport: "width=device-width, initial-scale=1.0",
    stylesheet: "auth",
    content,
  });
}

export function loginPage(error = ""): string {
  return authDocument("ログイン", (
    <main class="auth-page">
      <section class="auth-card">
        <h1>文化祭 注文システム</h1>
        {error ? <div class="alert alert-error" safe>{error}</div> : ""}
        <form method="POST" action="/login" class="auth-form">
          <label>ユーザー名<input type="text" name="username" autocomplete="username" required /></label>
          <label>パスワード<input type="password" name="password" autocomplete="current-password" required /></label>
          <button type="submit" class="primary-button">ログイン</button>
        </form>
      </section>
    </main>
  ));
}

export function notFoundPage(): string {
  return authDocument("ページが見つかりません", (
    <main class="auth-page centered">
      <section><h1 class="error-code">404</h1><p>ページが見つかりませんでした。</p><p>注文番号またはURLをご確認ください。</p></section>
    </main>
  ));
}
