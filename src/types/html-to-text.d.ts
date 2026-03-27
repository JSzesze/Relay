declare module "html-to-text" {
  export interface HtmlToTextOptions {
    selectors?: Array<{
      selector: string;
      format?: string;
      options?: Record<string, unknown>;
    }>;
    wordwrap?: number;
  }

  export function htmlToText(
    html: string,
    options?: HtmlToTextOptions,
  ): string;
}
