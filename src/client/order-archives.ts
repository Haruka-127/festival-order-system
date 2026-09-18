type ResetRequest = { request_id: string; revision: string; confirmation: string };
type ResetPreview = { count: number; active_count: number; oldest: string | null; newest: string | null; sold_units: number; reserved_units: number; revision: string };

const pendingKey = "pending-order-history-reset";
const dialog = document.getElementById("order-reset-dialog") as HTMLDialogElement | null;
const form = document.getElementById("order-reset-form") as HTMLFormElement | null;
const result = document.getElementById("order-reset-result");
const trigger = document.querySelector<HTMLButtonElement>('[data-action="reset-order-history"]');
let request: ResetRequest | null = null;
let busy = false;

function pendingRequest(): ResetRequest | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(pendingKey) ?? "null") as ResetRequest | null;
    return value && typeof value.request_id === "string" && typeof value.revision === "string" && value.confirmation === "リセット" ? value : null;
  } catch { return null; }
}

function message(text: string): void {
  if (result) result.textContent = text;
}

function setBusy(value: boolean): void {
  busy = value;
  if (trigger) trigger.disabled = value;
  form?.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.disabled = value);
}

if (trigger && pendingRequest()) {
  trigger.textContent = "前回のリセット結果を確認・再試行";
  message("前回の通信結果が確認できていません。同じリセット要求で結果を確認します。");
}

trigger?.addEventListener("click", async () => {
  if (busy || !dialog || !form) return;
  setBusy(true);
  try {
    request = pendingRequest();
    let description: string;
    if (request) {
      description = "前回の通信結果を確認します。すでに完了している場合、新たな注文は削除せず保存済み履歴を開きます。";
    } else {
      const response = await fetch("/api/admin/order-history/preview");
      if (response.status === 401) { location.href = "/login"; return; }
      if (!response.ok) throw new Error("対象件数を取得できませんでした");
      const preview = await response.json() as ResetPreview;
      request = { request_id: crypto.randomUUID(), revision: preview.revision, confirmation: "リセット" };
      const format = (value: string | null) => value ? new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").toLocaleString("ja-JP") : "---";
      description = `注文 ${preview.count}件（対応中 ${preview.active_count}件）／受渡済み商品 ${preview.sold_units}点／日次受付数量 ${preview.reserved_units}点。対象期間：${format(preview.oldest)} ～ ${format(preview.newest)}`;
    }
    document.getElementById("order-reset-preview")!.textContent = description;
    form.reset();
    dialog.showModal();
    document.getElementById("order-reset-confirmation")?.focus();
  } catch (error) { message(error instanceof Error ? error.message : "対象を確認できませんでした"); }
  finally { setBusy(false); }
});

dialog?.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
form?.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || !request || !form.reportValidity()) return;
  setBusy(true);
  message("履歴を保存してリセットしています。完了までお待ちください。");
  try {
    // Retain the same request ID across lost responses, retries and page reloads.
    sessionStorage.setItem(pendingKey, JSON.stringify(request));
    const response = await fetch("/api/admin/order-history/reset", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
    });
    if (response.status === 401) { location.href = "/login"; return; }
    const data = await response.json() as { success?: boolean; archive_id?: string; error?: string };
    if (!response.ok || !data.success || !data.archive_id) {
      if (response.status === 400 || response.status === 409 || response.status === 403) {
        sessionStorage.removeItem(pendingKey);
        request = null;
      }
      throw new Error(data.error ?? "リセット結果を確認できませんでした。同じ要求で再試行できます。");
    }
    sessionStorage.removeItem(pendingKey);
    location.href = `/admin/settings/archives/${encodeURIComponent(data.archive_id)}`;
  } catch (error) {
    message(error instanceof Error ? error.message : "通信結果を確認できませんでした。同じ要求で再試行してください。");
    if (trigger) trigger.textContent = pendingRequest() ? "前回のリセット結果を確認・再試行" : "バックアップして完全リセット";
  } finally {
    dialog?.close();
    setBusy(false);
  }
});
