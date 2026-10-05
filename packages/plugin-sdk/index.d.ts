export type Permission = 'terminal.read' | 'terminal.write' | 'ui.panel' | 'llm.complete' | 'commands';
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export interface Completion {
  text: string;
  tokens: number;
  remaining: number;
}
export interface NovaAPI {
  readonly apiVersion: 1;
  terminal: {
    /** Read up to 2,000 lines from the active terminal. Requires terminal.read. */
    read(lines?: number): Promise<string>;
    /** Write to the active shell. Requires terminal.write and user consent. */
    write(data: string): Promise<{ ok: true }>;
  };
  ai: {
    /** Use the configured provider and the plugin's token budget. */
    complete(messages: ChatMessage[], options?: { max_tokens?: number }): Promise<Completion>;
  };
  commands: { trigger(id: string): Promise<{ ok: true }> };
}
export function getNova(scope?: { nova?: unknown }): NovaAPI;
