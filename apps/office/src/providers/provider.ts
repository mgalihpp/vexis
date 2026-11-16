/** One provider's wire format: how to ask for a completion and how to read its text and token usage. */
export type Provider = {
  readonly build: (call: { model: string; apiKey: string; system: string; user: string }) => {
    readonly url: string;
    readonly headers: Record<string, string>;
    readonly body: unknown;
  };
  /** Throws when the body does not have the provider's documented shape. */
  readonly read: (body: unknown) => Completion;
};

export type Completion = { readonly text: string; readonly inputTokens: number; readonly outputTokens: number };
