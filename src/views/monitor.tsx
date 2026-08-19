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
  </div>
  <div id="page" class="page"></div>
  <div id="connection" class="connection">接続中</div>
    `,
  });
}
