import { Html } from "@elysia/html";

// Fixed asset filenames are cached in production. A fresh server process must
// serve fresh clients, particularly when the order-generation protocol changes.
const assetVersion = crypto.randomUUID();

type PageDocumentProps = {
  title: string;
  viewport: string;
  stylesheet: string;
  script?: string;
  bodyAttributes?: Record<string, string>;
  /** Pre-rendered, escaped page markup assembled by the page component. */
  content: JSX.Element;
};

export function pageDocument({ title, viewport, stylesheet, script, bodyAttributes = {}, content }: PageDocumentProps): string {
  const document = (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content={viewport} />
        <title safe>{title}</title>
        <link rel="stylesheet" href={`/assets/${stylesheet}.css?v=${assetVersion}`} />
      </head>
      <body {...bodyAttributes}>
        {content}
        {script ? <script type="module" src={`/assets/${script}.js?v=${assetVersion}`}></script> : ""}
      </body>
    </html>
  );
  return `<!DOCTYPE html>${document as string}`;
}
