import { config } from "../config";
import { pageDocument } from "./layout";
import { todayDate } from "../services/numbering";

export function monitorPage(_securityNonce = ""): string {
return pageDocument({
    title: "受付番号モニター",
    viewport: "width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no",
    stylesheet: "monitor",
    script: "monitor",
    bodyAttributes: { "data-current-date": todayDate(), "data-display-digits": String(config.displayNumberDigits) },
    content: `
<div class="screen">
    <main class="board">
      <section class="column waiting"><h1 class="title">お待ち番号</h1><div id="waiting" class="content"></div></section>
      <section class="column calling"><h1 class="title">お呼び出し中の番号</h1><div id="calling" class="content"></div></section>
    </main>
    <footer class="guidance">お手元の受付番号をご確認ください。番号が表示されたブースで商品をお受け取りください。</footer>
    <div class="monitor-status">
      <section id="monitor-sound-notice" class="sound-notice" aria-label="呼び出し音の設定" hidden>
        <div class="sound-notice-body">
          <p id="monitor-sound-message" role="status" aria-live="polite"></p>
          <details>
            <summary>ブラウザでの設定方法</summary>
            <p>Chrome：アドレス左のアイコン → サイトの設定 → 音声 → 許可</p>
            <p>Safari（Mac）：設定 → Webサイト → 自動再生 → このサイトの自動再生を許可</p>
            <p>設定後も音が聞こえない場合は、タブの消音・PCの音量・スピーカーの接続をご確認ください。</p>
          </details>
        </div>
        <button id="monitor-sound-enable" type="button" aria-describedby="monitor-sound-message">呼び出し音を有効にする</button>
      </section>
      <div id="connection" class="connection">接続中</div>
      <div id="page" class="page" aria-label="表示ページ"></div>
    </div>
    <audio id="monitor-chime" src="/assets/monitor-call-chime.wav" preload="auto" hidden></audio>
  </div>
    `,
  });
}
